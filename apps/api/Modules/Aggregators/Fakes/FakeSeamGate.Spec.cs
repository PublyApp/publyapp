using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Aggregators.Adapters.Zernio;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.Aggregators.Fakes;

[CollectionDefinition(nameof(FakeSeamGateSpec), DisableParallelization = true)]
public sealed class FakeSeamGateCollection;

// Security pin: the e2e fake (aggregator HTTP handler) is wired
// ONLY on a Development/Testing host. With PUBLISHING_FAKE_PROVIDER set, a Production
// or unset host environment must still resolve the REAL implementations. The spec
// changes process environment variables, so its collection never runs in parallel.
[Collection(nameof(FakeSeamGateSpec))]
public sealed class FakeSeamGateSpec {
	private const string _HostVar = "ASPNETCORE_ENVIRONMENT";
	private const string _FlagVar = "PUBLISHING_FAKE_PROVIDER";

	[Theory]
	[InlineData("Production")]
	[InlineData(null)]
	public void ItShouldResolveTheRealCredentialProtectorAndAggregatorClientWhenTheFlagIsSetOutsideDevelopmentAndTesting(
		string? hostEnvironment
	) {
		var (protector, innermost) = FakeSeamGateSpec._Compose(hostEnvironment);

		protector.Should().BeOfType<CredentialProtector>();
		innermost.Should().NotBeOfType<FakeAggregatorServer>();
	}

	// Non-vacuity: the same composition under Testing DOES pick the fake aggregator, so the
	// assertions above would go red if the gate silently stopped being read.
	[Fact]
	public void ItShouldResolveTheFakeAggregatorAndTheRealProtectorWhenTheFlagIsSetOnATestingHost() {
		var (protector, innermost) = FakeSeamGateSpec._Compose(EnvironmentNames.Testing);

		protector.Should().BeOfType<CredentialProtector>();
		innermost.Should().BeOfType<FakeAggregatorServer>();
	}

	private static (ICredentialProtector Protector, HttpMessageHandler Innermost) _Compose(
		string? hostEnvironment
	) {
		var previousHost = Environment.GetEnvironmentVariable(FakeSeamGateSpec._HostVar);
		var previousFlag = Environment.GetEnvironmentVariable(FakeSeamGateSpec._FlagVar);
		var previousDotnet = Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT");
		Environment.SetEnvironmentVariable(FakeSeamGateSpec._HostVar, hostEnvironment);
		Environment.SetEnvironmentVariable("DOTNET_ENVIRONMENT", null);
		Environment.SetEnvironmentVariable(FakeSeamGateSpec._FlagVar, "true");
		try {
			var builder = Program.CreateWebHostBuilder(
				["--environment", hostEnvironment ?? EnvironmentNames.Production],
				AppRole.Api
			);
			using var app = builder.Build();
			var protector = app.Services.GetRequiredService<ICredentialProtector>();
			var chain = app.Services
				.GetRequiredService<IHttpMessageHandlerFactory>()
				.CreateHandler(ZernioAggregatorAdapter.HttpClientName);
			while (chain is DelegatingHandler { InnerHandler: { } inner }) {
				chain = inner;
			}

			return (protector, chain);
		} finally {
			Environment.SetEnvironmentVariable(FakeSeamGateSpec._HostVar, previousHost);
			Environment.SetEnvironmentVariable("DOTNET_ENVIRONMENT", previousDotnet);
			Environment.SetEnvironmentVariable(FakeSeamGateSpec._FlagVar, previousFlag);
		}
	}
}
