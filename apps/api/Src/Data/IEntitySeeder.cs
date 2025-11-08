using MainApi.Src.Data.DbContext;

namespace MainApi.Src.Data;

/// <summary>
/// Marker interface for entity seeders.
/// Each entity should have a corresponding seeder class that implements this interface.
/// </summary>
public interface IEntitySeeder {
	/// <summary>
	/// Determines the execution order for the seeder. Lower numbers run first.
	/// </summary>
	int Order { get; }

	/// <summary>
	/// Seeds data for the entity in the database.
	/// </summary>
	Task SeedAsync(MainApiDbContext dbContext, CancellationToken cancellationToken = default);
}

