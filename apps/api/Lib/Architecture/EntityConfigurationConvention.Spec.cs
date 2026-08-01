using System.Reflection;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Guards that every DbSet entity was configured by EF's assembly discovery rather than
/// merely having a configuration type somewhere in the assembly.
/// </summary>
public sealed class EntityConfigurationConventionSpec {
	static EntityConfigurationConventionSpec() {
		AppEnvironment.Initialize();
	}

	[Fact]
	public void ItShouldApplyAConfigurationToEveryDbSetEntity() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=entity_configuration_guard")
			.Options;

		using var dbContext = new AppDbContext(options);
		var dbSetEntities = typeof(AppDbContext)
			.GetProperties(BindingFlags.Public | BindingFlags.Instance)
			.Where(property => property.PropertyType.IsGenericType)
			.Where(property => property.PropertyType.GetGenericTypeDefinition() == typeof(DbSet<>))
			.Select(property => property.PropertyType.GetGenericArguments()[0])
			.ToList();

		_ = dbSetEntities.Should().NotBeEmpty(
			"the DbSet scan must find entities; an empty scan would make this guard vacuous."
		);

		var missingConfigurations = dbSetEntities
			.Where(entityType => {
				var entity = dbContext.Model.FindEntityType(entityType);
				return entity is null
					|| entity.FindAnnotation(EntityConfigurationMarker.AnnotationName)?.Value
						is not string marker
					|| marker != entityType.Name;
			})
			.Select(entityType => entityType.FullName ?? entityType.Name)
			.OrderBy(name => name, StringComparer.Ordinal)
			.ToList();

		_ = missingConfigurations.Should().BeEmpty(
			"every DbSet entity must have its public parameterless IEntityTypeConfiguration "
			+ "discovered and applied to the built EF model"
		);
	}
}
