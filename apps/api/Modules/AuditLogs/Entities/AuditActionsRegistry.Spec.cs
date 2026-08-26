
using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Modules.AuditLogs.Entities;

public sealed class AuditActionsRegistrySpec {
	[Fact]
	public void ItShouldExposeAllAuditActionConstantsSortedAlphabetically() {
		var all = AuditActionsRegistry.All;

		all.Should().Contain(AuditActions.LoginSucceeded);
		all.Should().Contain(AuditActions.LoginFailed);
		all.Should().Contain(AuditActions.InvitationCreated);
		all.Should().BeInAscendingOrder();
		all.Should().OnlyHaveUniqueItems();
	}

	[Theory]
	[InlineData("auth.login.succeeded")]
	[InlineData("invitation.created")]
	public void ItShouldReturnTrueWhenActionIsKnown(string action) {
		AuditActionsRegistry.IsKnown(action).Should().BeTrue();
	}

	[Theory]
	[InlineData("totally.fake")]
	[InlineData("")]
	[InlineData("AUTH.LOGIN.SUCCEEDED")]
	public void ItShouldReturnFalseWhenActionIsUnknown(string action) {
		// Audit action keys are exact persisted contract
		// values; case variants are intentionally rejected.
		AuditActionsRegistry.IsKnown(action).Should().BeFalse();
	}

	// A5 (#636): DLQ requeue + system_job_definitions dashboard mutations land as
	// five new audit-action constants; this is the single failing-test file for
	// Task 1 step 1 of the A5 plan.
	[Fact]
	public void ItShouldExposeTheJobsA5AuditActions() {
		AuditActionsRegistry.All.Should().Contain(AuditActions.JobDeadLetterRequeued);
		AuditActionsRegistry.All.Should().Contain(AuditActions.JobSystemJobEnabled);
		AuditActionsRegistry.All.Should().Contain(AuditActions.JobSystemJobDisabled);
		AuditActionsRegistry.All.Should().Contain(AuditActions.JobSystemJobCronUpdated);
		AuditActionsRegistry.All.Should().Contain(AuditActions.JobSystemJobTriggered);
	}
}
