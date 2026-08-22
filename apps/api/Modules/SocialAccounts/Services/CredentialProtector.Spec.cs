using FluentAssertions;
using Microsoft.AspNetCore.DataProtection;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;
using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

public sealed class CredentialProtectorSpec {
	private static CredentialProtector Provider() {
		return new CredentialProtector(DataProtectionProvider.Create("test"));
	}

	[Fact]
	public void ItShouldRoundTripTheSecretForEachProviderPurpose() {
		var protector = Provider();
		var clear = "app-password-secret";

		var protectedValue = protector.Protect(clear, SocialProvider.Bluesky);
		protectedValue.Should().NotBe(clear);

		protector.Unprotect(protectedValue, SocialProvider.Bluesky).Should().Be(clear);
	}

	[Fact]
	public void ItShouldReturnNullWithoutThrowingWhenTheBlobIsGarbage() {
		var protector = Provider();
		protector.Unprotect("not-a-valid-token", SocialProvider.Bluesky).Should().BeNull();
	}
}
