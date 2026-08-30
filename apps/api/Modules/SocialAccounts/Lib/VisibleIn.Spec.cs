using FluentAssertions;

using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Lib;

public sealed class VisibleInSpec {
	private static SocialAccount Active() {
		return new SocialAccount {
			TenantId = Guid.NewGuid(),
			ExternalAccountId = "did:plc:abc",
			DisplayHandle = "@x",
			ProtectedCredentials = "x",
			Status = SocialAccountStatus.Active,
		};
	}

	[Fact]
	public void ItShouldBeVisibleEverywhereWhenUnattached() {
		var account = Active();
		// No SocialAccountProject rows -> VisibleIn true for any project.
		VisibleIn.Visible(account, Guid.NewGuid()).Should().BeTrue();
	}

	[Fact]
	public void ItShouldBeInvisibleForAProjectItIsNotAttachedTo() {
		var account = Active();
		var attached = Guid.NewGuid();
		var other = Guid.NewGuid();
		// Simulate attachment by giving the account one project link.
		account.Projects = new List<SocialAccountProject> {
			new SocialAccountProject { SocialAccountId = account.SafeId(), ProjectId = attached },
		};
		VisibleIn.Visible(account, other).Should().BeFalse();
		VisibleIn.Visible(account, attached).Should().BeTrue();
	}

	[Fact]
	public void ItShouldBeInvisibleWhenNotActive() {
		var account = Active();
		account.Status = SocialAccountStatus.NeedsReconnect;
		VisibleIn.Visible(account, Guid.NewGuid()).Should().BeFalse();
	}
}
