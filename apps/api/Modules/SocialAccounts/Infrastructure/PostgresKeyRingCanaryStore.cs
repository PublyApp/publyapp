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
	public const string UnreachablePrefix = "database unreachable at ";

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
		} catch (Exception ex) when (IsDatabaseConnectivityFailure(ex)) {
			throw UnreachableDatabase(dbContext, ex);
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
		} catch (Exception ex) when (IsDatabaseConnectivityFailure(ex)) {
			// #1424: the mint's INSERT hit an unreachable database (first boot, Postgres
			// down/restarting/firewalled). Same plain-words refusal as the read path.
			throw UnreachableDatabase(dbContext, ex);
		}
	}

	// ---- #1424: plain-words refusal for connectivity failures at boot ----

	/// <summary>
	/// True when the exception chain is a CONNECTIVITY failure (cannot reach or talk to
	/// Postgres): socket-level refusals and timeouts, broken connections mid-command,
	/// PostgreSQL connection-class errors (SQLSTATE class 08), or EF's transient-failure
	/// wrapper around any of them. Deliberately CONSERVATIVE: anything else (unique
	/// violations, malformed data, genuine bugs) keeps its own handling and never
	/// masquerades as "database unreachable".
	/// </summary>
	private static bool IsDatabaseConnectivityFailure(Exception ex) {
		for (var current = (Exception?)ex; current is not null; current = current.InnerException) {
			if (current is NpgsqlException or SocketException or TimeoutException or IOException) {
				return true;
			}

			// PostgreSQL connection-class errors (SQLSTATE class 08): the server-side
			// shape of "cannot connect" (too many connections, server not accepting, ...).
			if (current is PostgresException pg
				&& pg.SqlState.StartsWith("08", StringComparison.Ordinal)) {
				return true;
			}
		}

		return false;
	}

	/// <summary>
	/// The startup refusal for an unreachable database (#1424): names the ENDPOINT the
	/// boot tried (never the credentials carried by the connection string), the driver
	/// reason, what could not run, and the consequence. The witness lets
	/// <see cref="InvalidOperationException"/> propagate, so this becomes the cause
	/// operators read in crash-loop logs.
	/// </summary>
	private static InvalidOperationException UnreachableDatabase(
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

		return new InvalidOperationException(
			UnreachablePrefix + endpoint + ": " + SanitizeReason(cause)
				+ " — the master-key check could not run; the API will not start. "
				+ "Verify the database container/service is running and reachable from "
				+ "this service, then restart.",
			cause
		);
	}

	/// <summary>
	/// Flattens the driver reason onto one line: the innermost exception carries the
	/// actionable detail ("Connection refused", timeout expired, ...). Npgsql messages
	/// name hosts and ports but never credentials; the planted-marker spec pins that
	/// guarantee.
	/// </summary>
	private static string SanitizeReason(Exception cause) {
		Exception? innermost = cause;
		while (innermost.InnerException is not null) {
			innermost = innermost.InnerException;
		}

		var message = (innermost.Message ?? "unknown driver failure")
			.Replace("\r", " ", StringComparison.Ordinal)
			.Replace("\n", " ", StringComparison.Ordinal)
			.Trim();

		return message.Length <= 300 ? message : message[..300];
	}
}
