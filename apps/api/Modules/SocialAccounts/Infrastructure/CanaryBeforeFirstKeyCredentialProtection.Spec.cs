using FluentAssertions;

using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

/// <summary>
/// #2456: any database holding the master-key canary row (every real boot mints it) made
/// the stock key-ring repository throw an XmlException on the first key-ring load. These
/// specs run against the REAL host wiring (ServiceRegistration), not a hand-built copy:
/// removing or reordering its registration turns them red.
/// </summary>
public sealed class CanaryBeforeFirstKeyCredentialProtectionSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public CanaryBeforeFirstKeyCredentialProtectionSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	[Fact]
	public void ItShouldUseTheCanaryAwareKeyRingRepositoryInTheApiHost() {
		var options = this._Fixture.Factory.Services.GetRequiredService<IOptions<KeyManagementOptions>>();

		options.Value.XmlRepository.Should().BeOfType<CanaryAwareKeyRingRepository>();
	}

	[Fact]
	public void ItShouldUseTheCanaryAwareKeyRingRepositoryInTheWorkerHost() {
		using var host = Program.CreateWorkerHostBuilder([]).Build();

		host.Services.GetRequiredService<IOptions<KeyManagementOptions>>().Value.XmlRepository
			.Should().BeOfType<CanaryAwareKeyRingRepository>();
	}

	[Fact]
	public async Task ItShouldProtectACredentialWhenTheCanaryRowAlreadyExists() {
		SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(
			AppEnvironment.Instance.SocialAccountsMasterKey,
			new PostgresKeyRingCanaryAdapter(this._Fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>())
		);

		// The first host already built its key ring before the canary existed; a second,
		// independent host (a restart or another replica) reads the ring WITH the canary row.
		await using var secondHost = this._Fixture.CreateSecondHost();
		var services = secondHost.Services;
		var protector = services.GetRequiredService<ICredentialProtector>();
		var protectedText = protector.Protect("app-password", SocialProvider.Bluesky);

		protector.Unprotect(protectedText, SocialProvider.Bluesky).Should().BeEquivalentTo(
			UnprotectResult.Ok("app-password")
		);
	}
}
