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

		var result = protector.Unprotect(protectedValue, SocialProvider.Bluesky);
		result.Outcome.Should().Be(UnprotectOutcome.Ok);
		result.Plaintext.Should().Be(clear);
	}

	[Fact]
	public void ItShouldReportAbsentWithoutThrowingWhenTheInputIsNullOrEmpty() {
		var protector = Provider();

		protector.Unprotect(null, SocialProvider.Bluesky).Outcome
			.Should().Be(UnprotectOutcome.Absent, "no credential stored is not a failure");
		protector.Unprotect("", SocialProvider.Bluesky).Outcome
			.Should().Be(UnprotectOutcome.Absent);
		protector.Unprotect(null, SocialProvider.Bluesky).Plaintext
			.Should().BeNull();
	}

	[Fact]
	public void ItShouldReportTamperedWhenTheBlobIsGarbageInsteadOfSwallowingItIntoNull() {
		var protector = Provider();
		var result = protector.Unprotect("not-a-valid-token", SocialProvider.Bluesky);
		result.Outcome.Should().Be(
			UnprotectOutcome.Tampered,
			"review r3: Unprotect must never conflate an undecryptable blob with absence"
		);
		result.Plaintext.Should().BeNull();
	}

	[Fact]
	public void ItShouldReportTamperedWhenTheBlobWasTruncatedOrBitFlipped() {
		var protector = Provider();
		var protectedValue = protector.Protect("app-password-secret", SocialProvider.Bluesky);

		// Flip one bit in the payload body — GCM authentication must fail.
		var chars = protectedValue.ToCharArray();
		chars[^3] ^= '\x01';
		var corrupted = new string(chars);

		var result = protector.Unprotect(corrupted, SocialProvider.Bluesky);
		result.Outcome.Should().Be(UnprotectOutcome.Tampered);
		result.Plaintext.Should().BeNull();
	}

	[Fact]
	public void ItShouldReportTamperedForACrossPurposePayload() {
		var protector = Provider();
		// Only Bluesky exists today; the purpose string is per-provider by design. A blob
		// minted under another purpose (future provider) or another key must NOT decrypt:
		// assert the tamper branch directly against a foreign-purpose protector.
		var otherPurpose = DataProtectionProvider.Create("test")
			.CreateProtector("social-account-futureprovider-v1");
		var foreignBlob = otherPurpose.Protect("oauth-client-secret");

		var result = protector.Unprotect(foreignBlob, SocialProvider.Bluesky);
		result.Outcome.Should().Be(
			UnprotectOutcome.Tampered,
			"a cross-purpose payload must surface as Tampered, never null"
		);
	}
}
