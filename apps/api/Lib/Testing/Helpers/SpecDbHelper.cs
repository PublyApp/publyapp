using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;

namespace PublyApp.Api.Lib.Testing.Helpers;

/// <summary>
/// AppDbContext factories shared by specs that need a context outside the
/// fixture's request scope. Each method was lifted byte-for-byte from the
/// private helper it replaces.
/// </summary>
internal static class SpecDbHelper {
	/// <summary>
	/// New context built from a fresh async scope's connection string
	/// (Publishing job specs).
	/// </summary>
	public static async Task<AppDbContext> OpenNewDbContextAsync(ApiFixture fixture) {
		await using var scope = fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	/// <summary>Staff job handler specs.</summary>
	public static async Task<AppDbContext> CreateDbContextForJobsAsync(ApiFixture fixture) {
		await using var scope = fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was null."
			);
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString).Options
		);
	}

	/// <summary>Retention job specs.</summary>
	public static async Task<AppDbContext> CreateDbContextForRetentionAsync(ApiFixture fixture) {
		await using var scope = fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).Options
		);
	}

	/// <summary>Connection string read through the fixture's OpenDb handle.</summary>
	public static async Task<string> GetConnectionStringAsync(ApiFixture fixture) {
		await using var db = fixture.OpenDb();
		var connectionString = db.Context.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
		}

		return connectionString;
	}

	/// <summary>Sync context factory (AuditLog, Impersonation, Email job specs).</summary>
	public static AppDbContext CreateDbContext(ApiFixture fixture) {
		using var scope = fixture.Factory.Services.CreateScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	/// <summary>Quartz job specs.</summary>
	public static async Task<AppDbContext> CreateDbContextForQuartzAsync(ApiFixture fixture) {
		await using var scope = fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was unexpectedly null.");
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	/// <summary>Connection string read through a fresh async scope.</summary>
	public static async Task<string> GetConnectionStringFromScopeAsync(ApiFixture fixture) {
		await using var scope = fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
		}

		return connectionString;
	}

	/// <summary>Context factory with an optional save-changes interceptor.</summary>
	public static async Task<AppDbContext> CreateDbContextWithInterceptorAsync(
		ApiFixture fixture,
		SaveChangesInterceptor? interceptor = null
	) {
		await using var scope = fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString);
		if (interceptor is not null) {
			options.AddInterceptors(interceptor);
		}

		return new AppDbContext(options.Options);
	}

	/// <summary>Query service specs.</summary>
	public static async Task<AppDbContext> CreateDbContextForQueryServicesAsync(ApiFixture fixture) {
		await using var scope = fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString);
		return new AppDbContext(options.Options);
	}

	/// <summary>Upload job specs.</summary>
	public static async Task<AppDbContext> CreateDbContextForUploadsAsync(ApiFixture fixture) {
		await using var scope = fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();
		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was null."
			);
		}
		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).Options
		);
	}

	/// <summary>Base connection string from a sync scope.</summary>
	public static string GetBaseConnectionString(ApiFixture fixture) {
		using var scope = fixture.Factory.Services.CreateScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		return connectionString;
	}

	/// <summary>Test connection string from a sync scope.</summary>
	public static string GetTestConnectionString(ApiFixture fixture) {
		using var scope = fixture.Factory.Services.CreateScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was unexpectedly null.");
		}

		return connectionString;
	}
}
