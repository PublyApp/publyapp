using System.Net.Sockets;

using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

using Npgsql;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

/// <summary>
/// Production <see cref="IKeyRingCanaryStore"/>: one well-known row in
/// <c>data_protection_keys</c> — the SAME table the Data Protection key ring already
/// persists to via PersistKeysToDbContext — so no migration is needed. The row's Xml
/// payload column carries the base64 nonce:ciphertext:tag canary blob under a fixed
/// friendly name, so api, worker, and migrate all read the exact same bytes.
/// Resolves the scoped <see cref="AppDbContext"/> through <see cref="IServiceScopeFactory"/>
/// (no HttpContext exists at boot; both host shapes register the factory).
/// </summary>
public sealed class PostgresKeyRingCanaryStore : IKeyRingCanaryStore {
	public const string RowName = "social-accounts-master-key-canary";

	// #1424: prefix of the plain-words refusal when the canary read/write cannot reach
	// Postgres at boot. Public so specs assert the REAL cause text instead of a copy.
	// Round 2: the prefix stays ONLY for genuine TRANSPORT failures — see
	// <see cref="HasCanaryTranslation"/>; every other infrastructure shape gets its own
	// truthful prefix instead of an unreachable claim.
	public const string UnreachablePrefix = "cannot reach the database at ";

	/// <summary>
	/// #1424 round 2: prefix of the refusal when the SERVER answered but the canary
	/// table does not exist yet (SQLSTATE 42P01 / 42703). This is the deploy-ordering
	/// race, not a connectivity problem: dokploy.yml starts api/worker/migrate
	/// concurrently (no depends_on) and only the worker graph waits for pending
	/// migrations, so the api can reach the canary while the one-shot migrator is still
	/// working. Public so specs assert the REAL cause text.
	/// </summary>
	public const string MissingSchemaPrefix =
		"the master-key canary table is missing — database migrations have not been "
			+ "applied yet";

	/// <summary>
	/// #1424 round 2: prefix of the refusal when the server answered and REJECTED the
	/// canary operation with any other server-side error. Public so specs assert the
	/// REAL cause text.
	/// </summary>
	public const string ServerRejectedPrefix =
		"the database rejected the master-key canary check";

	private readonly IServiceScopeFactory _scopeFactory;

	public PostgresKeyRingCanaryStore(IServiceScopeFactory scopeFactory) {
		_scopeFactory = scopeFactory;
	}

	public string? Read() {
		using var scope = _scopeFactory.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		try {
			// #1416: never let the bare LINQ "Sequence contains more than one element" reach
			// an operator. Residual duplicates should be unreachable behind the unique partial
			// index, so if they ever appear anyway the failure must carry the CAUSE (how many
			// rows) and the ACTION (keep the lowest id, delete the rest).
			var blobs = dbContext.DataProtectionKeys
				.AsNoTracking()
				.Where(k => k.FriendlyName == RowName)
				.Select(k => k.Xml)
				.ToList();

			if (blobs.Count > 1) {
				throw new InvalidOperationException(
					"The master-key canary is corrupted: found "
						+ blobs.Count
						+ " duplicate "
						+ RowName
						+ " rows in data_protection_keys, so the boot refuses to guess which blob "
						+ "to trust. Repair by keeping only the lowest-id row and deleting the "
						+ "others, for example: DELETE FROM data_protection_keys WHERE "
						+ "\"FriendlyName\" = '" + RowName + "' AND \"Id\" <> (SELECT MIN(\"Id\") "
						+ "FROM data_protection_keys WHERE \"FriendlyName\" = '" + RowName
						+ "'); then restart this service."
				);
			}

			return blobs.Count == 0 ? null : blobs[0];
		} catch (Exception ex) when (HasCanaryTranslation(ex)) {
			throw TranslateCause(dbContext, ex);
		}
	}

	public void Write(string blob) {
		using var scope = _scopeFactory.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		// #1416: BLIND insert. Concurrent first boots all read an empty canary and all
		// arrive here; the unique partial index ux_data_protection_keys_canary_friendly_name
		// turns every loser's insert into a 23505 instead of a duplicate row (which used to
		// crash-loop every later boot) or a silent overwrite of the winner.
		dbContext.DataProtectionKeys.Add(
			new DataProtectionKey {
				FriendlyName = RowName,
				Xml = blob,
			}
		);
		try {
			dbContext.SaveChanges();
		} catch (DbUpdateException ex) when (
			ex.InnerException is PostgresException pgEx
			&& pgEx.SqlState == PostgresErrorCodes.UniqueViolation
		) {
			// Lost the mint race (#1416): another boot inserted the canary first. Keep the
			// winner's row untouched — a loser must NOT overwrite it (a divergent api/worker
			// key would otherwise be masked instead of failing the boot). The witness
			// re-reads and verifies the winner's blob right after this returns.
		} catch (Exception ex) when (HasCanaryTranslation(ex)) {
			// #1424: the mint's INSERT hit a database infrastructure failure (first boot,
			// Postgres down/restarting/firewalled, or the unmigrated-schema race). Same
			// truthful plain-words refusal as the read path.
			throw TranslateCause(dbContext, ex);
		}
	}

	// ---- #1424: truthful plain-words refusals for infrastructure failures at boot ----

	/// <summary>
	/// True when the exception chain is a DATABASE INFRASTRUCTURE failure the canary
	/// gate translates into a plain-words startup refusal. Deliberately CONSERVATIVE:
	/// anything else (unique violations, malformed data, genuine bugs) keeps its own
	/// handling and never masquerades as an infrastructure problem.
	/// <para>
	/// Classification (adversarial review round 2) — <see cref="PostgresException"/>
	/// DERIVES from <see cref="NpgsqlException"/>, so the base type alone cannot
	/// separate the shapes; the SERVER-DELIVERED error must be classified FIRST:
	/// </para>
	/// <list type="bullet">
	/// <item>A <see cref="PostgresException"/> anywhere in the chain means the server
	/// ANSWERED — never "unreachable". SQLSTATE 42P01/42703 (undefined table/column)
	/// is the migrations-not-applied-yet shape; SQLSTATE class 08 is the server-side
	/// shape of "cannot connect"; anything else is a server rejection.</item>
	/// <item>Otherwise, socket/IO/timeout errors in the chain are genuine TRANSPORT
	/// failures (nothing answered), as is a transient-failure-wrapped
	/// <see cref="NpgsqlException"/> carrying no SqlState of its own.</item>
	/// </list>
	/// </summary>
	private static bool HasCanaryTranslation(Exception ex) {
		return ClassifyChain(ex) != CanaryFailureKind.None;
	}

	private enum CanaryFailureKind {
		None,
		TransportUnreachable,
		ServerMissingSchema,
		ServerConnectionClassError,
		ServerRejection
	}

	private static CanaryFailureKind ClassifyChain(Exception ex) {
		var kind = CanaryFailureKind.None;

		for (var current = (Exception?)ex; current is not null; current = current.InnerException) {
			if (current is PostgresException pg) {
				// The server DELIVERED this error: the database is reachable and answering,
				// so no branch below may ever be labelled "unreachable".
				if (pg.SqlState is PostgresErrorCodes.UndefinedTable
					or PostgresErrorCodes.UndefinedColumn) {
					return CanaryFailureKind.ServerMissingSchema;
				}

				if (pg.SqlState.StartsWith("08", StringComparison.Ordinal)) {
					return CanaryFailureKind.ServerConnectionClassError;
				}

				kind = CanaryFailureKind.ServerRejection;
				continue;
			}

			if (current is SocketException or TimeoutException or IOException) {
				// Remembered, not returned immediately: a server-delivered error later in
				// the chain outranks the transport layer that carried it.
				if (kind == CanaryFailureKind.None) {
					kind = CanaryFailureKind.TransportUnreachable;
				}
			}
		}

		if (kind is CanaryFailureKind.ServerRejection
			or CanaryFailureKind.TransportUnreachable) {
			return kind;
		}

		// No typed transport error and no server answer anywhere in the chain: accept
		// Npgsql's own transient-declaration ONLY when it carries no SqlState — a
		// transient flag on a server-answered error would contradict the classification
		// above (fail-closed otherwise: unknown shapes keep their own handling).
		for (var current = (Exception?)ex; current is not null; current = current.InnerException) {
			if (current is NpgsqlException npg && !npg.IsTransient) {
				return CanaryFailureKind.None;
			}
		}

		return ex is NpgsqlException npgEx && npgEx.IsTransient
			? CanaryFailureKind.TransportUnreachable
			: CanaryFailureKind.None;
	}

	/// <summary>
	/// The startup refusal for a canary infrastructure failure (#1424): names the
	/// ENDPOINT the boot tried (never the credentials carried by the connection
	/// string), the TRUE class of failure, what could not run, the consequence, and the
	/// operator action that is actually right for THAT class. The witness lets
	/// <see cref="InvalidOperationException"/> propagate, so this becomes the cause
	/// operators read in crash-loop logs.
	/// </summary>
	private static InvalidOperationException TranslateCause(
		AppDbContext dbContext,
		Exception cause
	) {
		var connectionString = dbContext.Database.GetConnectionString();
		string endpoint;
		try {
			var builder = new NpgsqlConnectionStringBuilder(connectionString);
			endpoint = builder.Host + ":" + builder.Port;
		} catch (ArgumentException) {
			endpoint = "<unparseable connection string>";
		}

		var kind = ClassifyChain(cause);
		string message;
		if (kind is CanaryFailureKind.None or CanaryFailureKind.TransportUnreachable) {
			message =
				UnreachablePrefix + endpoint + ": " + SanitizeReason(cause)
					+ " — the master-key check could not run; the API will not start. "
					+ "Verify the database container/service is running and reachable "
					+ "from this service, then restart.";
		} else if (kind == CanaryFailureKind.ServerMissingSchema) {
			message =
				MissingSchemaPrefix + " (SqlState "
					+ RedactedReason(cause) + "). The database at " + endpoint
					+ " answered, so it is reachable — the schema simply does not exist "
					+ "yet; the master-key check could not run and the API will not "
					+ "start. Wait for the one-shot migrate task (publyapp-migrate) to "
					+ "finish and restart this service; inspect its logs if it did not "
					+ "succeed.";
		} else if (kind == CanaryFailureKind.ServerConnectionClassError) {
			message =
				ServerRejectedPrefix + ": the server refused the CONNECTION itself ("
					+ RedactedReason(cause) + ") — the master-key check could not run; "
					+ "the API will not start. Check the PostgreSQL server's "
					+ "connection limits and access rules (pg_hba.conf) for this "
					+ "service, then restart.";
		} else {
			message =
				ServerRejectedPrefix + " (" + RedactedReason(cause)
					+ ") — the master-key check could not run; the API will not start. "
					+ "The database answered and rejected the canary statement; compare "
					+ "its schema state with the deployed migrations, then restart.";
		}

		return new InvalidOperationException(message, cause);
	}

	/// <summary>
	/// One-line reason for a SERVER-answered failure: the SqlState plus the server's
	/// own message text, credential-redacted. The driver quotes the connection-string
	/// USERNAME verbatim in several of these (e.g. 28P01 password failures), and this
	/// text travels to crash-loop logs.
	/// </summary>
	private static string RedactedReason(Exception cause) {
		Exception? innermost = cause;
		while (innermost.InnerException is not null) {
			innermost = innermost.InnerException;
		}

		var sqlState = innermost is PostgresException pg ? pg.SqlState : "unknown";

		if (innermost is PostgresException serverError) {
			// Use the server's OWN MessageText: it carries no SqlState prefix and no
			// POSITION suffix, so prefixing the SqlState here never duplicates either.
			return sqlState + ": " + SanitizeText(serverError.MessageText);
		}

		return sqlState + ": " + SanitizeText(innermost?.Message);
	}

	/// <summary>
	/// Flattens the driver reason onto one line: the innermost exception carries the
	/// actionable detail ("Connection refused", timeout expired, ...). Npgsql messages
	/// can quote credentials carried by the connection string (e.g. 28P01 echoes the
	/// username), so anything between the planted-marker delimiters used by the
	/// credential spec is stripped before this text reaches an operator log.
	/// </summary>
	private static string SanitizeReason(Exception cause) {
		Exception? innermost = cause;
		while (innermost.InnerException is not null) {
			innermost = innermost.InnerException;
		}

		return SanitizeText(innermost?.Message);
	}

	/// <summary>
	/// Flattens one driver/server message onto a single line and strips anything that
	/// could echo connection-string credentials (see <see cref="StripDelimited"/>).
	/// </summary>
	private static string SanitizeText(string? raw) {
		var message = (raw ?? "unknown driver failure")
			.Replace("\r", " ", StringComparison.Ordinal)
			.Replace("\n", " ", StringComparison.Ordinal)
			.Trim();

		message = StripDelimited(message, '"');
		message = StripDelimited(message, '\'');

		return message.Length <= 300 ? message : message[..300];
	}

	/// <summary>
	/// Removes each <c>delimiter…delimiter</c> span from the message: driver texts wrap
	/// identifiers quoted from the connection string (usernames) in these delimiters,
	/// and the refusal must never echo them. Deliberately ITERATIVE with the
	/// replacement carrying NEITHER delimiter: each pass consumes one span of the
	/// original text and cannot re-match its own output, so the work is bounded by the
	/// input length instead of the call-stack depth.
	/// </summary>
	private static string StripDelimited(string message, char delimiter) {
		var result = message;
		while (true) {
			var opening = result.IndexOf(delimiter);
			if (opening < 0) {
				return result;
			}

			// char IndexOf is ordinal by definition; no culture can touch it.
			var closing = result.IndexOf(delimiter, opening + 1);
			if (closing < 0) {
				return result;
			}

			result = result[..opening] + "<redacted>" + result[(closing + 1)..];
		}
	}
}
