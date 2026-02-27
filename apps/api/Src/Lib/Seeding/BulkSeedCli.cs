using MainApi.Src.Data.DbContext;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace MainApi.Src.Lib.Seeding;

/// <summary>
/// CLI entry points for bulk seeding operations.
/// </summary>
public static class BulkSeedCli {
	public static bool TryRun(string[] args) {
		if (args.Length == 0) {
			return false;
		}

		return args[0] switch {
			"seed-bulk" => RunBulkSeed(args),
			"seed-bulk-reset" => RunBulkReset(args),
			_ => false
		};
	}

	private static bool RunBulkSeed(string[] args) {
		// Safety check: require Development env or --force for bulk seed operations
		if (!IsOperationAllowed(command: "seed-bulk", isDestructiveOperation: false, args)) {
			return true; // Return true to indicate we handled the command (just blocked it)
		}

		var builder = WebApplication.CreateBuilder(args);
		builder.Logging.ClearProviders();
		builder.Logging.AddConsole().SetMinimumLevel(LogLevel.None);
		builder.Services.AddDbContext<MainApiDbContext>(options => {
			var env = AppEnvironment.Instance;
			options.UseNpgsql(env.POSTGRES_CONNECTION_STRING);
			options.LogTo(_ => { }, LogLevel.None);
			options.UseLoggerFactory(NullLoggerFactory.Instance);
		});

		var app = builder.Build();
		using var scope = app.Services.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();
		var seeder = new BulkSeeder();

		Console.WriteLine("Starting bulk seed operation...");
		seeder.SeedBulkAsync(dbContext).GetAwaiter().GetResult();
		Console.WriteLine("Bulk seed completed!");

		return true;
	}

	private static bool RunBulkReset(string[] args) {
		// Safety check: require Development env or --force for destructive operations
		if (!IsOperationAllowed(command: "seed-bulk-reset", isDestructiveOperation: true, args)) {
			return true; // Return true to indicate we handled the command (just blocked it)
		}

		var builder = WebApplication.CreateBuilder(args);
		builder.Logging.ClearProviders();
		builder.Logging.AddConsole().SetMinimumLevel(LogLevel.None);
		builder.Services.AddDbContext<MainApiDbContext>(options => {
			var env = AppEnvironment.Instance;
			options.UseNpgsql(env.POSTGRES_CONNECTION_STRING);
			options.LogTo(_ => { }, LogLevel.None);
			options.UseLoggerFactory(NullLoggerFactory.Instance);
		});

		var app = builder.Build();
		using var scope = app.Services.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();
		var seeder = new BulkSeeder();

		Console.WriteLine("Starting bulk data cleanup...");
		seeder.ClearBulkDataAsync(dbContext).GetAwaiter().GetResult();
		Console.WriteLine("Bulk data cleanup completed!");

		return true;
	}

	private static bool IsOperationAllowed(string command, bool isDestructiveOperation, string[] args) {
		var isDevelopment = AppEnvironment.IsDevelopment;
		var hasForceFlag = args.Contains("--force", StringComparer.OrdinalIgnoreCase);

		if (isDevelopment || hasForceFlag) {
			return true;
		}

		if (isDestructiveOperation) {
			Console.Error.WriteLine($"Error: '{command}' is a destructive operation.");
		} else {
			Console.Error.WriteLine($"Error: '{command}' is a test-only operation.");
		}
		Console.Error.WriteLine("Safety check failed. This command requires either:");
		Console.Error.WriteLine("  1. Running in Development environment, OR");
		Console.Error.WriteLine("  2. Passing --force flag");
		Console.Error.WriteLine();
		Console.Error.WriteLine("Examples:");
		Console.Error.WriteLine($"  make seed-bulk-reset ASPNETCORE_ENVIRONMENT=Development");
		Console.Error.WriteLine("  dotnet run -- seed-bulk-reset --force");

		return false;
	}
}
