using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

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

	// Unit tests of the removal HELPER itself, kept as fast synthetic-input regression tests.
	// They prove RemoveWorkerHostedServices does what it claims against each registration
	// shape it must recognize — they are NOT a substitute for the host guard above: none of
	// them constructs an ApiFactory, so none can see a host that stopped calling the helper.

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

	// Hole 2 (issue #548 review): an ImplementationInstance registration has
	// ImplementationType == null, so a predicate matching only on ImplementationType would
	// silently skip it and the live singleton instance would start in the integration host.
	[Fact]
	public void ItShouldRemoveInvitationEmailDispatcherRegisteredAsAnInstance() {
		ServiceCollection services = [];

		using var scopeFactoryProvider = new ServiceCollection().BuildServiceProvider();
		var dispatcherInstance = new InvitationEmailOutboxDispatcher(
			scopeFactoryProvider.GetRequiredService<IServiceScopeFactory>(),
			new InvitationEmailOutboxSignal(),
			NullLogger<InvitationEmailOutboxDispatcher>.Instance
		);
		services.AddSingleton<IHostedService>(dispatcherInstance);

		ApiFactory.RemoveWorkerHostedServices(services);

		services.Should().NotContain(descriptor =>
			descriptor.ServiceType == typeof(IHostedService)
			&& descriptor.ImplementationInstance is InvitationEmailOutboxDispatcher
		);
	}

	// Hole 2 (issue #548 review, round 2) — KNOWN, ACCEPTED GAP, not a wanted outcome: registering
	// through an ImplementationFactory — for example, registering the concrete singleton and then
	// adding a hosted-service factory that resolves it — also yields ImplementationType == null,
	// just like an ImplementationInstance registration. Round 1 closed this by resolving the
	// factory (in isolation, against a throwaway provider) purely to inspect the produced type;
	// round 2's re-review found that unsafe — it executes arbitrary application code for every
	// factory-shaped IHostedService descriptor, and a legitimate one-shot factory that rejects a
	// second invocation broke every ApiFixture consumer once the real host invoked it again (see
	// ResolveHostedServiceImplementationType's XML doc in ApiFactory.cs for the full account).
	//
	// Round 2 deletes that probe and accepts the gap: RemoveWorkerHostedServices does NOT strip a
	// factory-registered dispatcher descriptor. This test pins that limitation directly against
	// the helper. The backstop is the actual-host guard above,
	// ItShouldNeverResolveALiveInvitationEmailOutboxDispatcherInTheIntegrationHost: if the
	// PRODUCTION registration (JobsServiceRegistration.cs) ever became factory-shaped, that guard
	// resolves IHostedService from the real, started host and fails loudly on the live dispatcher.
	//
	// A host-level test proving the same thing directly — build a host where the dispatcher is
	// ALREADY factory-shaped at the moment ApiFactory.ConfigureWebHost calls
	// RemoveWorkerHostedServices, then assert live resolution — is not achievable through the only
	// public seam for layering configuration onto an ApiFactory-built host: WithWebHostBuilder
	// always applies its extra configuration AFTER the base ConfigureWebHost (and therefore after
	// RemoveWorkerHostedServices has already run), so a descriptor added through it was never
	// visible to removal at all — regardless of whether removal can handle factories. (Confirmed
	// by reinstating the deleted round-1 probe and observing that a WithWebHostBuilder-based
	// version of this test still passed: it was pinning nothing.) Making the registration visible
	// BEFORE removal would require adding a test-only pre-removal hook to ApiFactory itself,
	// contorting shared test wiring — used by every other ApiFixture consumer, including specs
	// that run in parallel across test classes — for the sake of one test. This unit test is the
	// honest alternative: it exercises RemoveWorkerHostedServices against the exact registration
	// shape production would produce if InvitationEmailOutboxDispatcher were ever registered
	// through a factory, without claiming to exercise the real host.
	[Fact]
	public void ItShouldNotRemoveInvitationEmailDispatcherWhenRegisteredThroughAnImplementationFactory() {
		ServiceCollection services = [];
		services.AddSingleton<IInvitationEmailOutboxSignal, InvitationEmailOutboxSignal>();
		services.AddSingleton<ILogger<InvitationEmailOutboxDispatcher>>(
			NullLogger<InvitationEmailOutboxDispatcher>.Instance);
		services.AddSingleton<InvitationEmailOutboxDispatcher>();
		services.AddSingleton<IHostedService>(
			sp => sp.GetRequiredService<InvitationEmailOutboxDispatcher>());

		ApiFactory.RemoveWorkerHostedServices(services);

		services.Should().Contain(descriptor =>
			descriptor.ServiceType == typeof(IHostedService)
			&& descriptor.ImplementationFactory != null,
			"RemoveWorkerHostedServices deliberately never invokes ImplementationFactory "
			+ "delegates (issue #548 review, round 2) — a factory-registered dispatcher is a "
			+ "known, accepted gap in this helper, caught instead by the real-host guard "
			+ "ItShouldNeverResolveALiveInvitationEmailOutboxDispatcherInTheIntegrationHost "
			+ "against the real production registration"
		);
	}
}
