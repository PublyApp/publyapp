using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

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
		var key = dbContext.DataProtectionKeys
			.AsNoTracking()
			.SingleOrDefault(k => k.FriendlyName == RowName);
		return key?.Xml;
	}

	public void Write(string blob) {
		using var scope = _scopeFactory.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var key = dbContext.DataProtectionKeys
			.SingleOrDefault(k => k.FriendlyName == RowName);
		if (key is null) {
			dbContext.DataProtectionKeys.Add(
				new DataProtectionKey {
					FriendlyName = RowName,
					Xml = blob,
				}
			);
		} else {
			key.Xml = blob;
		}
		dbContext.SaveChanges();
	}
}
