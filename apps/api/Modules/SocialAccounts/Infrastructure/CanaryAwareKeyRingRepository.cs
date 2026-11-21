using System.Xml.Linq;

using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

/// <summary>
/// Key-ring repository over <c>data_protection_keys</c> that ignores the master-key canary
/// row (#2456). The canary shares the table but its payload is a base64 nonce:ciphertext:tag
/// blob, not XML: the stock EF repository parses EVERY row with XElement.Parse, so as soon
/// as the canary row existed when the key ring was first built (fresh database: the boot
/// gate mints it before the first key) every Protect call failed with an XmlException.
/// </summary>
public sealed class CanaryAwareKeyRingRepository : IXmlRepository {
	private readonly IServiceScopeFactory _ScopeFactory;

	public CanaryAwareKeyRingRepository(IServiceScopeFactory scopeFactory) {
		this._ScopeFactory = scopeFactory;
	}

	public IReadOnlyCollection<XElement> GetAllElements() {
		using var scope = this._ScopeFactory.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return dbContext.DataProtectionKeys
			.AsNoTracking()
			.Where(k => k.FriendlyName == null || k.FriendlyName != PostgresKeyRingCanaryStore.RowName)
			.Select(k => k.Xml)
			.ToList()
			.OfType<string>()
			.Where(xml => xml.Length > 0)
			.Select(xml => XElement.Parse(xml))
			.ToList();
	}

	public void StoreElement(XElement element, string friendlyName) {
		using var scope = this._ScopeFactory.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		dbContext.DataProtectionKeys.Add(
			new DataProtectionKey {
				FriendlyName = friendlyName,
				Xml = element.ToString(SaveOptions.DisableFormatting),
			}
		);
		dbContext.SaveChanges();
	}
}
