using FluentAssertions;

using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Jobs.Seeders;
using PublyApp.Api.Modules.Messaging.Jobs;

using Xunit;

namespace PublyApp.Api.Modules.Jobs;

// #1510 (plan #365, Phase C review): the retention sweep must be registered as
// disable-protected alongside email-prepared-sends-retention, and the current
// protection registry must not silently rot. This spec pins the two properties
// that make the registry a registry rather than a decorative list:
//   1. every protected key is a REAL handler JobKey constant that the seeder
//      actually declares (a dangling literal protects nothing);
//   2. the privacy-load-bearing sweep is protected while housekeeping sweeps
//      (session cleanup) stay operator-disableable — the policy boundary from
//      the K-3 rationale.
public sealed class SystemJobDisableProtectionSpec {
	[Fact]
	public void ItShouldOnlyProtectRealJobKeysThatTheSeederDeclares() {
		var seedableKeys = SystemJobDefinitionSeeder
			.GetCodeDefinedDefaults()
			.Select(definition => definition.JobKey)
			.ToHashSet(StringComparer.Ordinal);

		// The protected literal must reference the live constant — a typo or a
		// dangling string would silently disable the protection.
		SystemJobDisableProtection.IsDisableProtected(
			EmailPreparedSendsRetentionHandler.JobKey
		).Should().BeTrue();

		// And the key it protects must actually be a system job definition the
		// seeder ships — protecting a key nobody can define is a false promise.
		seedableKeys.Should().Contain(
			EmailPreparedSendsRetentionHandler.JobKey,
			"[#1510] a disable-protected key with no seedable definition would "
			+ "announce protection over a job that cannot exist"
		);
	}

	[Fact]
	public void ItShouldKeepHousekeepingSweepsOperatorDisableable() {
		// K-3 boundary: only the privacy-load-bearing prepared-sends sweep is
		// protectable; session cleanup carries no sensitive bytes and must stay
		// freely operator-disableable.
		SystemJobDisableProtection.IsDisableProtected(
			CleanupExpiredSessionsHandler.JobKey
		).Should().BeFalse(
			"[#1510] a housekeeping sweep must remain disableable — a guard that "
			+ "blocks everything would break legitimate ops"
		);
	}
}
