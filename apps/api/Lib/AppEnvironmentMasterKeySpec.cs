using FluentAssertions;
using Xunit;

namespace PublyApp.Api.Lib;

public sealed class AppEnvironmentMasterKeySpec {
	[Fact]
	public void ItShouldExposeA32ByteMasterKeyWhenTheVariableIsValidBase64() {
		var key = AppEnvironment.Instance.SocialAccountsMasterKey;
		key.Should().HaveCountGreaterOrEqualTo(32);
	}

	[Fact]
	public void ItShouldThrowWhenTheVariableIsMissing() {
		var act = () => InvokeParseMasterKey("SOCIAL_ACCOUNTS_MASTER_KEY", string.Empty);
		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*required*");
	}

	[Fact]
	public void ItShouldThrowWhenTheKeyIsTooShort() {
		var shortKey = Convert.ToBase64String(new byte[16]);
		var act = () => InvokeParseMasterKey("SOCIAL_ACCOUNTS_MASTER_KEY", shortKey);
		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*32 bytes*");
	}

	[Fact]
	public void ItShouldThrowWhenTheKeyIsNotValidBase64() {
		var act = () => InvokeParseMasterKey("SOCIAL_ACCOUNTS_MASTER_KEY", "not-valid-base64!!!");
		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*base64*");
	}

	private static byte[] InvokeParseMasterKey(string name, string value) {
		var method = typeof(AppEnvironment).GetMethod(
			"ParseMasterKey",
			System.Reflection.BindingFlags.NonPublic
				| System.Reflection.BindingFlags.Static
		)!;
		return (byte[])method.Invoke(null, [name, value])!;
	}
}