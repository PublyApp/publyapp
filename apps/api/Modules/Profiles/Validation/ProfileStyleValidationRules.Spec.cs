using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Validation;

public sealed class ProfileStyleValidationRulesSpec {
	[Fact]
	public void ItShouldLoadTheScopeNeutralEmbeddedProfileIconCatalogue() {
		var assembly = typeof(ProfileStyleValidationRules).Assembly;
		var resourceNames = assembly.GetManifestResourceNames();

		resourceNames.Should().Contain("PublyApp.ProfileIcons.json");
		resourceNames.Should().NotContain("PublyApp.TenantProfileIcons.json");
		ProfileStyleValidationRules.Icons.Should().HaveCount(16);
		ProfileStyleValidationRules.Icons.Should().Contain("shield-check");
		ProfileStyleValidationRules.Icons.Should().Contain("building");
		ProfileStyleValidationRules.Tones.Should().BeEquivalentTo(
			["0", "1", "2", "3", "4", "5", "6", "7"]
		);
	}
}
