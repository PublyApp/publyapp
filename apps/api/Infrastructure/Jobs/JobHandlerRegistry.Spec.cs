using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

public sealed class JobHandlerRegistrySpec {
	// Fail-fast config guard (re-review 1): when DI constructs the registry (scope
	// factory available), every registration is resolved once and its handler's own
	// JobType must match the registered key — drift dies at startup, not dispatch.
	[Fact]
	public void ItShouldFailFastAtBuildWhenARegistrationJobTypeDriftsFromItsHandler() {
		var services = new ServiceCollection();
		services.AddScoped<StubHandler>();
		services.AddSingleton(new JobHandlerRegistration(
			"email.password-reset.v1", sp => sp.GetRequiredService<StubHandler>()
		));
		services.AddSingleton<JobHandlerRegistry>();

		using var provider = services.BuildServiceProvider();

		var act = () => provider.GetRequiredService<JobHandlerRegistry>();

		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*declares JobType*email.staff-invitation.v1*registered for*"
				+ "email.password-reset.v1*");
	}

	[Fact]
	public void ItShouldBuildCleanlyWhenEveryRegistrationMatchesItsHandler() {
		var services = new ServiceCollection();
		services.AddScoped<StubHandler>();
		services.AddSingleton(new JobHandlerRegistration(
			"email.staff-invitation.v1", sp => sp.GetRequiredService<StubHandler>()
		));
		services.AddSingleton<JobHandlerRegistry>();

		using var provider = services.BuildServiceProvider();

		var registry = provider.GetRequiredService<JobHandlerRegistry>();

		registry.RegisteredJobTypes.Should().BeEquivalentTo(["email.staff-invitation.v1"]);
	}
	[Fact]
	public void ItShouldRejectDuplicateJobTypes() {
		var act = () => new JobHandlerRegistry([
			new JobHandlerRegistration("email.tenant-invitation.v1", _ => new StubHandler()),
			new JobHandlerRegistration("email.tenant-invitation.v1", _ => new StubHandler())
		]);

		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*Duplicate job handler*email.tenant-invitation.v1*");
	}

	[Fact]
	public void ItShouldResolveARegisteredJobTypeAndRejectAnUnknownOne() {
		var registration = new JobHandlerRegistration(
			"email.staff-invitation.v1", _ => new StubHandler()
		);
		var registry = new JobHandlerRegistry([registration]);

		registry.TryResolve("email.staff-invitation.v1", out var resolved).Should().BeTrue();
		resolved.Should().BeSameAs(registration);

		registry.TryResolve("email.staff-invitation.v2", out _).Should().BeFalse();
		registry.RegisteredJobTypes.Should().BeEquivalentTo(["email.staff-invitation.v1"]);
	}

	private sealed class StubHandler : IJobHandler {
		public string JobType {
			get { return "email.staff-invitation.v1"; }
		}

		public Task<JobOutcome> HandleAsync(
			JobContext context,
			CancellationToken cancellationToken
		) {
			return Task.FromResult<JobOutcome>(JobOutcome.Succeeded);
		}
	}
}
