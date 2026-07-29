using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

// Guard for issue #548 (review MAJOR finding): three other specs — CreateStaffProfile.Spec's
// exact `Be(Pending)` assertion, the removed `NextAttemptAt = ...AddDays(1)` workaround, and
// the migration spec's removed ten-attempt retry loop — are only safe to write deterministically
// because no LIVE InvitationEmailOutboxDispatcher ever runs inside the integration test host.
// This class proves that invariant on the ACTUAL host, not on a model of it.
public sealed class ApiFactoryHostedServiceGuardSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public ApiFactoryHostedServiceGuardSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	// THE guard. Resolves the REAL IEnumerable<IHostedService> from the initialized ApiFactory
	// host — the exact collection Host.StartAsync would start — and asserts no resolved
	// INSTANCE is InvitationEmailOutboxDispatcher. Descriptors are the model of what a host
	// might run; resolved instances are the artifact of what it actually would. Only the
	// artifact can be trusted here: a future refactor that drops the
	// RemoveWorkerHostedServices(services) call from ApiFactory.ConfigureWebHost, or that
	// registers the dispatcher through an implementation factory/instance rather than
	// AddHostedService<T>(), changes what this resolves and must fail this test — see
	// AppRoleCompositionSpec for the same resolved-instance-over-descriptor principle applied
	// to the api/worker role split.
	[Fact]
	public void ItShouldNeverResolveALiveInvitationEmailOutboxDispatcherInTheIntegrationHost() {
		var resolvedHostedServices = _fixture.Factory.Services
			.GetServices<IHostedService>()
			.ToList();

		resolvedHostedServices.Should().NotBeEmpty(
			"the integration host still resolves ordinary hosted services (e.g. the web host's "
			+ "own server); an empty collection would mean this control is vacuous rather than "
			+ "green"
		);

		resolvedHostedServices.Should().NotContain(
			hostedService => hostedService is InvitationEmailOutboxDispatcher,
			"a live InvitationEmailOutboxDispatcher running inside the integration test host "
			+ "would claim due outbox rows and race CreateStaffProfile.Spec's exact Pending "
			+ "assertion, the removed AddDays(1) workaround, and the migration retry loop all "
			+ "at once (issue #548)"
		);
	}

	// Unit test of the removal HELPER's own predicate, kept as a fast synthetic-input
	// regression test. It proves RemoveWorkerHostedServices does what it claims against inputs
	// shaped exactly like its own expectations — it is NOT a substitute for the host guard
	// above: it never constructs an ApiFactory, so it cannot see a host that stopped calling
	// the helper, and it repeats the helper's own ImplementationType predicate, so it cannot
	// see a registration shape (factory/instance) the predicate does not recognize.
	[Fact]
	public void ItShouldRemoveInvitationEmailDispatcherFromIntegrationHost() {
		ServiceCollection services = [];
		services.AddHostedService<InvitationEmailOutboxDispatcher>();

		ApiFactory.RemoveWorkerHostedServices(services);

		services.Should().NotContain(descriptor =>
			descriptor.ServiceType == typeof(IHostedService)
			&& descriptor.ImplementationType == typeof(InvitationEmailOutboxDispatcher)
		);
	}
}
