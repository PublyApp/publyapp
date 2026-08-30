using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib;

public sealed class AppEnvironmentMasterKeySpec {
	[Fact]
	public void ItShouldExposeA32ByteMasterKeyWhenTheVariableIsValidBase64() {
		// AppEnvironment.Instance is initialized once at assembly load from
		// .env.development (see Lib/Testing/Fixtures/TestEnvironment.Bootstrap). The
		// SOCIAL_ACCOUNTS_MASTER_KEY it reads is the committed placeholder in
		// .env.example — materialized to .env.development in CI, and present in local
		// .env.development. The boot wiring (Task 7) fails fast if the key is missing,
		// so the placeholder keeps the whole test assembly bootable.
		var key = AppEnvironment.Instance.SocialAccountsMasterKey;

		key.Should().HaveCountGreaterOrEqualTo(32);
	}

	[Fact]
	public void ItShouldThrowWhenTheVariableIsMissing() {
		var act = WrapParseMasterKey("SOCIAL_ACCOUNTS_MASTER_KEY", string.Empty);
		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*required*");
	}

	[Fact]
	public void ItShouldThrowWhenTheKeyIsTooShort() {
		// 16 bytes instead of 32
		var shortKey = Convert.ToBase64String(new byte[16]);
		var act = WrapParseMasterKey("SOCIAL_ACCOUNTS_MASTER_KEY", shortKey);
		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*32 bytes*");
	}

	[Fact]
	public void ItShouldThrowWhenTheKeyIsNotValidBase64() {
		var act = WrapParseMasterKey(
			"SOCIAL_ACCOUNTS_MASTER_KEY",
			"not-valid-base64!!!"
		);
		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*base64*");
	}

	private static byte[] InvokeParseMasterKey(
		string name, string value
	) {
		var method = typeof(AppEnvironment).GetMethod(
			"ParseMasterKey",
			System.Reflection.BindingFlags.NonPublic
				| System.Reflection.BindingFlags.Static
		)!;
		return (byte[])method.Invoke(null, [name, value])!;
	}

	/// <summary>
	/// Invokes ParseMasterKey and unwraps TargetInvocationException so
	/// FluentAssertions .Throw&lt;T&gt; matches the real inner exception.
	/// </summary>
	private static Action WrapParseMasterKey(string name, string value) {
		return () => {
			try {
				InvokeParseMasterKey(name, value);
			} catch (System.Reflection.TargetInvocationException ex)
				when (ex.InnerException is not null) {
				throw ex.InnerException;
			}
		};
	}
}
