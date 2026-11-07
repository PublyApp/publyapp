using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Validation;

public sealed class RoleStyleValidationRulesSpec {
	[Fact]
	public void ItShouldLoadTheScopeNeutralEmbeddedRoleIconCatalogue() {
		var assembly = typeof(RoleStyleValidationRules).Assembly;
		var resourceNames = assembly.GetManifestResourceNames();

		resourceNames.Should().Contain("PublyApp.RoleIcons.json");
		resourceNames.Should().NotContain("PublyApp.TenantRoleIcons.json");
		RoleStyleValidationRules.Icons.Should().HaveCount(16);
		RoleStyleValidationRules.Icons.Should().Contain("shield-check");
		RoleStyleValidationRules.Icons.Should().Contain("building");
		RoleStyleValidationRules.Tones.Should().BeEquivalentTo(
			["0", "1", "2", "3", "4", "5", "6", "7"]
		);
	}
}
