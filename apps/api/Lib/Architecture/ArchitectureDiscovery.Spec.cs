using System.Runtime.CompilerServices;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Modules.Auth.Handlers;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

public sealed class ArchitectureDiscoverySpec {
	[Fact]
	public void ItShouldIncludeRealApiTypes() {
		ArchitectureDiscovery
			.EnumerateApiTypes()
			.Should()
			.Contain(typeof(GetUserTenants));
	}

	[Fact]
	public void ItShouldIncludeAuthoredOpenApiExtensionTypes() {
		ArchitectureDiscovery
			.EnumerateApiTypes()
			.Should()
			.Contain(typeof(OpenApiExtensions));
	}

	[Fact]
	public void ItShouldExcludeEfMigrationTypes() {
		ArchitectureDiscovery
			.EnumerateApiTypes()
			.Should()
			.NotContain(type =>
				type.Namespace == "PublyApp.Api.Migrations");
	}

	[Fact]
	public void ItShouldExcludeEfMigrationImplementationTypes() {
		ArchitectureDiscovery
			.EnumerateApiTypes()
			.Should()
			.NotContain(typeof(PublyApp.Api.Migrations.Init));
	}

	[Fact]
	public void ItShouldExcludeMicrosoftTypes() {
		ArchitectureDiscovery
			.EnumerateApiTypes()
			.Should()
			.NotContain(typeof(DbContext));
	}

	[Fact]
	public void ItShouldExcludeCompilerGeneratedTypes() {
		var compilerGeneratedTypes = typeof(Program)
			.Assembly
			.GetTypes()
			.Where(type =>
				type.IsDefined(
					typeof(CompilerGeneratedAttribute),
					inherit: false
				)
				|| type.Name.Contains('<', StringComparison.Ordinal))
			.ToList();

		compilerGeneratedTypes.Should().NotBeEmpty(
			"the API assembly should contain compiler-generated async/lambda types "
			+ "so this exclusion is exercised."
		);

		ArchitectureDiscovery
			.EnumerateApiTypes()
			.Should()
			.NotContain(compilerGeneratedTypes);
	}

	[Fact]
	public void ItShouldDiscoverHandlerEntrypoints() {
		ArchitectureDiscovery
			.EnumerateHandlerEntrypoints()
			.Should()
			.HaveCountGreaterThanOrEqualTo(10);
	}
}
