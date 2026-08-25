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

	private readonly IServiceScopeFactory _scopeFactory;

	public PostgresKeyRingCanaryStore(IServiceScopeFactory scopeFactory) {
		_scopeFactory = scopeFactory;
	}

	public string? Read() {
		using var scope = _scopeFactory.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

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
		}
	}
}
