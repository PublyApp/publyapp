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

	// Hole 2 (issue #548 review): registering through an ImplementationFactory — for example,
	// registering the concrete singleton and then adding a hosted-service factory that
	// resolves it — also yields ImplementationType == null. The removal helper must resolve
	// the factory (in isolation, against a throwaway provider) to see the produced type.
	[Fact]
	public void ItShouldRemoveInvitationEmailDispatcherRegisteredThroughAnImplementationFactory() {
		ServiceCollection services = [];
		services.AddSingleton<IInvitationEmailOutboxSignal, InvitationEmailOutboxSignal>();
		services.AddSingleton<ILogger<InvitationEmailOutboxDispatcher>>(
			NullLogger<InvitationEmailOutboxDispatcher>.Instance);
		services.AddSingleton<InvitationEmailOutboxDispatcher>();
		services.AddSingleton<IHostedService>(
			sp => sp.GetRequiredService<InvitationEmailOutboxDispatcher>());

		ApiFactory.RemoveWorkerHostedServices(services);

		services.Should().NotContain(descriptor =>
			descriptor.ServiceType == typeof(IHostedService)
			&& descriptor.ImplementationFactory != null
		);
	}
}
