using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

public sealed class JobHandlerRegistrySpec {
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
