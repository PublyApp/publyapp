using System.Security.Cryptography;

using FluentAssertions;

using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

/// <summary>
/// Pure unit specs for the Data Protection-backed token protector. Uses an EPHEMERAL
/// key ring (default in-memory) — key-ring persistence is a deployment concern covered
/// by Lib/ServiceRegistration.cs; what matters here is the crypto contract: round trip,
/// tamper detection, and purpose isolation.
/// </summary>
public sealed class TokenProtectorSpec {
	private static TokenProtector CreateProtector() {
		var services = new ServiceCollection();
		services.AddDataProtection();
		return new TokenProtector(
			services.BuildServiceProvider().GetRequiredService<IDataProtectionProvider>()
		);
	}

	[Fact]
	public void ItShouldRoundTripPlaintextWithTheSamePurpose() {
		var protector = CreateProtector();

		var protectedPayload = protector.Protect("bluesky.credentials", "access-token-secret");
		var roundTripped = protector.Unprotect("bluesky.credentials", protectedPayload);

		roundTripped.Should().Be("access-token-secret");
		protectedPayload.Should().NotContain("access-token-secret");
	}

	[Fact]
	public void ItShouldFailUnprotectWhenThePayloadIsTampered() {
		var protector = CreateProtector();
		var protectedPayload = protector.Protect("bluesky.credentials", "access-token-secret");

		// Flip a character in the middle of the opaque payload (adversarial mutation).
		var middle = protectedPayload.Length / 2;
		var swapped = protectedPayload[middle] == 'A' ? 'B' : 'A';
		var tampered = string.Create(
			protectedPayload.Length,
			(protectedPayload, swapped, middle),
			static (span, state) => {
				state.protectedPayload.AsSpan().CopyTo(span);
				span[state.middle] = state.swapped;
			}
		);

		var act = () => protector.Unprotect("bluesky.credentials", tampered);

		act.Should().Throw<CryptographicException>();
	}

	[Fact]
	public void ItShouldNotUnprotectAcrossPurposes() {
		var protector = CreateProtector();
		var protectedPayload = protector.Protect("bluesky.credentials", "access-token-secret");

		var act = () => protector.Unprotect("mastodon.credentials", protectedPayload);

		act.Should().Throw<CryptographicException>();
	}

	[Theory]
	[InlineData("")]
	[InlineData("   ")]
	public void ItShouldRejectEmptyPurposeOnProtect(string purpose) {
		var protector = CreateProtector();

		var act = () => protector.Protect(purpose, "access-token-secret");

		act.Should().Throw<ArgumentException>();
	}
}
