using FluentAssertions;

using PublyApp.Api.Lib;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class TenantUserFilterQuerySpec {
	// These validators inherit the pagination validators, which read AppEnvironment. This class
	// uses no database fixture, so nothing else guarantees the environment is initialized: when
	// the parallel scheduler happened to start this class before any fixture-backed class, it
	// failed with "AppEnvironment not initialized". Same pattern as
	// ServiceArgsRecordConventionSpec, which already does this for the same reason.
	static TenantUserFilterQuerySpec() {
		AppEnvironment.Initialize();
	}

	[Fact]
	public void ItShouldAcceptTheSameStatusTokensOnFindAndExportValidators() {
		var findValidator = new FindTenantUsersAsStaffQueryValidator();
		var exportValidator = new ExportTenantUsersAsStaffQueryValidator();

		foreach (var status in TenantUserFilterQuery.AllowedStatusSet) {
			var findResult = findValidator.Validate(
				new FindTenantUsersAsStaffQuery { Status = status }
			);
			var exportResult = exportValidator.Validate(
				new ExportTenantUsersAsStaffQuery { Status = status }
			);

			findResult.IsValid.Should().BeTrue(
				$"'{status}' is in the shared allowlist and Find should accept it"
			);
			exportResult.IsValid.Should().BeTrue(
				$"'{status}' is in the shared allowlist and Export should accept it"
			);
		}
	}

	[Fact]
	public void ItShouldAcceptTheSameLevelTokensOnFindAndExportValidators() {
		var findValidator = new FindTenantUsersAsStaffQueryValidator();
		var exportValidator = new ExportTenantUsersAsStaffQueryValidator();

		foreach (var level in TenantUserFilterQuery.AllowedLevelSet) {
			var findResult = findValidator.Validate(
				new FindTenantUsersAsStaffQuery { Level = level }
			);
			var exportResult = exportValidator.Validate(
				new ExportTenantUsersAsStaffQuery { Level = level }
			);

			findResult.IsValid.Should().BeTrue(
				$"'{level}' is in the shared allowlist and Find should accept it"
			);
			exportResult.IsValid.Should().BeTrue(
				$"'{level}' is in the shared allowlist and Export should accept it"
			);
		}
	}

	[Fact]
	public void ItShouldRejectAnUnknownStatusTokenOnBothValidators() {
		var findValidator = new FindTenantUsersAsStaffQueryValidator();
		var exportValidator = new ExportTenantUsersAsStaffQueryValidator();

		var findResult = findValidator.Validate(
			new FindTenantUsersAsStaffQuery { Status = "invited" }
		);
		var exportResult = exportValidator.Validate(
			new ExportTenantUsersAsStaffQuery { Status = "invited" }
		);

		findResult.IsValid.Should().BeFalse();
		exportResult.IsValid.Should().BeFalse();
	}
}
