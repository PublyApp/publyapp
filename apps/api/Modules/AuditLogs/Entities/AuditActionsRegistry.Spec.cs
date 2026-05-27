
using FluentAssertions;

using Xunit;

namespace MainApi.Modules.AuditLogs.Entities;
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
}
