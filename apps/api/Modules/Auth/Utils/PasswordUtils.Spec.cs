using System.Security.Cryptography;

using FluentAssertions;

using Microsoft.AspNetCore.Cryptography.KeyDerivation;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Utils;

public sealed class PasswordUtilsSpec {
	private const string _Password = "Correct horse battery 42";

	// The format used before #2468: base64(salt).base64(hash), 100,000 iterations.
	private static string _LegacyHash(string password) {
		var salt = RandomNumberGenerator.GetBytes(16);
		var key = KeyDerivation.Pbkdf2(
			password,
			salt,
			KeyDerivationPrf.HMACSHA256,
			100_000,
			32
		);
		return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(key)}";
	}

	[Fact]
	public void ItShouldUseTheProductionWorkFactorOutsideTestingAndDevelopment() {
		PasswordUtils.ProductionIterations.Should().Be(600_000);
		PasswordUtils.IterationsForEnvironment("Production").Should().Be(600_000);
		PasswordUtils.IterationsForEnvironment("Staging").Should().Be(600_000);
		PasswordUtils.IterationsForEnvironment(null).Should().Be(600_000);
		PasswordUtils.IterationsForEnvironment("Testing").Should().Be(PasswordUtils.ReducedIterations);
		PasswordUtils.IterationsForEnvironment("Development").Should().Be(PasswordUtils.ReducedIterations);
	}

	[Fact]
	public void ItShouldWriteAVersionedHashCarryingTheIterationCount() {
		var hash = PasswordUtils.HashPassword(PasswordUtilsSpec._Password, 600_000);

		var parts = hash.Split('.');
		parts.Should().HaveCount(4);
		parts[0].Should().Be("v2");
		parts[1].Should().Be("600000");
		Convert.FromBase64String(parts[2]).Should().HaveCount(16);
		Convert.FromBase64String(parts[3]).Should().HaveCount(32);
	}

	[Fact]
	public void ItShouldVerifyAProductionCostHashWithoutAskingForARehash() {
		var hash = PasswordUtils.HashPassword(PasswordUtilsSpec._Password, PasswordUtils.ProductionIterations);

		var result = PasswordUtils.VerifyPassword(PasswordUtilsSpec._Password, hash);

		result.Matches.Should().BeTrue();
		// Under the reduced test cost, a 600k hash is above the current policy.
		result.NeedsRehash.Should().BeFalse();
	}

	[Fact]
	public void ItShouldVerifyACurrentHashAndNotAskForARehash() {
		var hash = PasswordUtils.HashPassword(PasswordUtilsSpec._Password);

		var result = PasswordUtils.VerifyPassword(PasswordUtilsSpec._Password, hash);

		result.Should().Be(new PasswordVerification(true, false));
	}

	[Fact]
	public void ItShouldVerifyALegacyHashAndAskForARehash() {
		var result = PasswordUtils.VerifyPassword(PasswordUtilsSpec._Password, PasswordUtilsSpec._LegacyHash(PasswordUtilsSpec._Password));

		result.Should().Be(new PasswordVerification(true, true));
	}

	[Fact]
	public void ItShouldAskForARehashWhenTheCostIsBelowTheCurrentOne() {
		var hash = PasswordUtils.HashPassword(PasswordUtilsSpec._Password, PasswordUtils.CurrentIterations - 1);

		var result = PasswordUtils.VerifyPassword(PasswordUtilsSpec._Password, hash);

		result.Should().Be(new PasswordVerification(true, true));
	}

	[Fact]
	public void ItShouldRejectAWrongPasswordForBothFormats() {
		PasswordUtils.VerifyPassword("nope", PasswordUtils.HashPassword(PasswordUtilsSpec._Password))
			.Should().Be(new PasswordVerification(false, false));
		PasswordUtils.VerifyPassword("nope", PasswordUtilsSpec._LegacyHash(PasswordUtilsSpec._Password))
			.Should().Be(new PasswordVerification(false, false));
	}

	[Theory]
	[InlineData("")]
	[InlineData("garbage")]
	[InlineData("a.b.c")]
	[InlineData("!!!.???")]
	[InlineData("v2.600000.AAAA")]
	[InlineData("v2.abc.AAAA.AAAA")]
	[InlineData("v2.0.AAAA.AAAA")]
	[InlineData("v2.-5.AAAA.AAAA")]
	[InlineData("v3.600000.AAAA.AAAA")]
	[InlineData("v2.600000.!!!.???")]
	public void ItShouldReturnFalseForGarbledHashesWithoutThrowing(string stored) {
		var act = () => PasswordUtils.VerifyPassword(PasswordUtilsSpec._Password, stored);

		act.Should().NotThrow();
		act().Should().Be(new PasswordVerification(false, false));
	}
}
