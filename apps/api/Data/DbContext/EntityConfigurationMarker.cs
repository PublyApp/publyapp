using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Data.DbContext;

/// <summary>
/// Marks an entity after its assembly-discovered configuration has run.
/// </summary>
public static class EntityConfigurationMarker {
	public const string AnnotationName = "PublyApp:EntityConfiguration";

	public static void Mark<TEntity>(EntityTypeBuilder<TEntity> builder) where TEntity : class {
		builder.HasAnnotation(AnnotationName, typeof(TEntity).Name);
	}
}
