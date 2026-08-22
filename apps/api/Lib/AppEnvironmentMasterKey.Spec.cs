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
}
