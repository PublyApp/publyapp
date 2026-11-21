using FluentAssertions;

using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

/// <summary>
/// #2456: on a FRESH database the boot gate mints the master-key canary row in
/// data_protection_keys BEFORE Data Protection has created its first real key. The REAL
/// credential protector (not the fake) must still protect/unprotect a credential.
/// </summary>
[Collection("WitnessBootChildProcess")]
public sealed class CanaryBeforeFirstKeyCredentialProtectionSpec {
	[Fact]
	public async Task ItShouldProtectACredentialOnAFreshDatabaseWhenTheCanaryRowPredatesTheFirstKey() {
		await using var db = await WitnessTestDatabase.CreateAsync();

		var services = new ServiceCollection();
		services.AddLogging();
		services.AddDbContext<AppDbContext>(options => options.UseNpgsql(db.ConnectionString));
		services
			.AddDataProtection()
			.SetApplicationName("publyapp-social-accounts")
			.PersistKeysToDbContext<AppDbContext>();
		// Same wiring as ServiceRegistration (#2456).
		services.AddOptions<Microsoft.AspNetCore.DataProtection.KeyManagement.KeyManagementOptions>()
			.Configure<IServiceScopeFactory>((options, scopeFactory) => {
				options.XmlRepository = new CanaryAwareKeyRingRepository(scopeFactory);
			});
		services.AddSingleton<Microsoft.AspNetCore.DataProtection.XmlEncryption.IXmlEncryptor, MasterKeyXmlEncryptor>();
		services.AddSingleton<Microsoft.AspNetCore.DataProtection.XmlEncryption.IXmlDecryptor, MasterKeyXmlDecryptor>();
		services.AddSingleton<ICredentialProtector, CredentialProtector>();
		await using var provider = services.BuildServiceProvider();

		// Canary minted first, exactly like the real boot gate on an empty key ring.
		var key = AppEnvironment.Instance.SocialAccountsMasterKey;
		SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(
			key,
			new PostgresKeyRingCanaryStore(provider.GetRequiredService<IServiceScopeFactory>())
		);

		var protector = provider.GetRequiredService<ICredentialProtector>();
		var protectedText = protector.Protect("app-password", SocialProvider.Bluesky);

		protector.Unprotect(protectedText, SocialProvider.Bluesky).Should().BeEquivalentTo(
			UnprotectResult.Ok("app-password")
		);
	}
}
