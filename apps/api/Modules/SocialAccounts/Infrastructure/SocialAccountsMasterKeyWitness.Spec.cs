using FluentAssertions;

using PublyApp.Api.Lib;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

public sealed class SocialAccountsMasterKeyWitnessSpec {
	[Fact]
	public void ItShouldPassWhenTheMasterKeyIsValid() {
		var key = AppEnvironment.Instance.SocialAccountsMasterKey;
		var act = () => SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable(key);
		act.Should().NotThrow();
	}

	[Fact]
	public void ItShouldThrowWhenTheMasterKeyIsEmpty() {
		var act = () => SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable([]);
		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*missing*");
	}

	[Fact]
	public void ItShouldThrowWhenKeyIsWrongSize() {
		// 15 bytes is not a valid AES key size (valid: 16, 24, 32)
		var shortKey = new byte[15];
		var act = () => SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable(shortKey);
		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*wrong*");
	}
}
