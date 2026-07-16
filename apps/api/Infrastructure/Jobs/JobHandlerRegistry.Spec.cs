using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

public sealed class JobHandlerRegistrySpec {
	[Fact]
	public void ItShouldRejectDuplicateJobTypes() {
		var act = () => new JobHandlerRegistry([
			new StubHandler("email.tenant-invitation.v1"),
			new StubHandler("email.tenant-invitation.v1")
		]);

		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*Duplicate job handler*email.tenant-invitation.v1*");
	}

	[Fact]
	public void ItShouldResolveARegisteredJobTypeAndRejectAnUnknownOne() {
		var handler = new StubHandler("email.staff-invitation.v1");
		var registry = new JobHandlerRegistry([handler]);

		registry.TryResolve("email.staff-invitation.v1", out var resolved).Should().BeTrue();
		resolved.Should().BeSameAs(handler);

		registry.TryResolve("email.staff-invitation.v2", out _).Should().BeFalse();
		registry.RegisteredJobTypes.Should().BeEquivalentTo(["email.staff-invitation.v1"]);
	}

	private sealed class StubHandler : IJobHandler {
		public string JobType { get; }

		public StubHandler(string jobType) {
			JobType = jobType;
		}

		public Task<JobOutcome> HandleAsync(
			JobContext context,
			CancellationToken cancellationToken
		) {
			return Task.FromResult<JobOutcome>(JobOutcome.Succeeded);
		}
	}
}
