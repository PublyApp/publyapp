using FluentAssertions;

using PublyApp.Api.Lib.Testing.Helpers;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Utils;

public sealed class PasswordUtilsSpec {
	private const string _Password = "Correct horse battery 42";

	[Fact]
	public void ItShouldUseTheProductionWorkFactorOutsideTesting() {
		PasswordUtils.ProductionIterations.Should().Be(600_000);
		PasswordUtils.IterationsForEnvironment("Production").Should().Be(600_000);
		PasswordUtils.IterationsForEnvironment("Staging").Should().Be(600_000);
		PasswordUtils.IterationsForEnvironment(null).Should().Be(600_000);
		PasswordUtils.IterationsForEnvironment("Testing").Should().Be(PasswordUtils.ReducedIterations);
		PasswordUtils.IterationsForEnvironment("Development").Should().Be(600_000);
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
		// At or above the current cost, so no rehash.
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
		var result = PasswordUtils.VerifyPassword(PasswordUtilsSpec._Password, LegacyPasswordHash.Create(PasswordUtilsSpec._Password));

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
		PasswordUtils.VerifyPassword("nope", LegacyPasswordHash.Create(PasswordUtilsSpec._Password))
			.Should().Be(new PasswordVerification(false, false));
	}

	[Fact]
	public void ItShouldSpendTheCurrentCostOnAWrongPasswordForALegacyHash() {
		var work = new List<int>();

		var result = PasswordUtils.VerifyPassword(
			"nope",
			LegacyPasswordHash.Create(PasswordUtilsSpec._Password),
			PasswordUtils.ProductionIterations,
			work.Add
		);

		result.Should().Be(new PasswordVerification(false, false));
		work.Sum().Should().Be(PasswordUtils.ProductionIterations);
	}

	[Fact]
	public void ItShouldSpendOnlyTheStoredCostOnAWrongPasswordForACurrentHash() {
		var work = new List<int>();
		var hash = PasswordUtils.HashPassword(PasswordUtilsSpec._Password, 5_000);

		_ = PasswordUtils.VerifyPassword("nope", hash, 5_000, work.Add);

		work.Sum().Should().Be(5_000);
	}

	[Fact]
	public void ItShouldRejectAHugeIterationCountWithoutDerivingAnything() {
		var work = new List<int>();

		var result = PasswordUtils.VerifyPassword(
			PasswordUtilsSpec._Password,
			"v2.2147483647.AAAAAAAAAAAAAAAAAAAAAA==.AAAA",
			PasswordUtils.ProductionIterations,
			work.Add
		);

		result.Should().Be(new PasswordVerification(false, false));
		work.Should().BeEmpty();
	}

	[Theory]
	[InlineData(" 600000")]
	[InlineData("+600000")]
	public void ItShouldRejectALaxIterationCount(string count) {
		PasswordUtils.VerifyPassword(
			PasswordUtilsSpec._Password,
			$"v2.{count}.AAAAAAAAAAAAAAAAAAAAAA==.AAAA"
		).Should().Be(new PasswordVerification(false, false));
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
