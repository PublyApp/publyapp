using System.Diagnostics;
using System.Text.Json;

using FluentAssertions;

using Npgsql;

using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

// Production-only seeding gate probe:
// a dedicated external process is required because testing fixtures pin
// ASPNETCORE_ENVIRONMENT=Testing process-wide. This spec verifies the
// production branch at runtime: demo seeders are absent, essentials run.
public sealed class SeederGateProbeSpec {
	[Fact]
	public async Task ItShouldExcludeDemoSeedersUnderProductionAndSeedEssentials() {
		var container = await PostgresContainerFixture.GetSharedAsync();

		var dbName = $"seed_gate_prod_{Guid.NewGuid():N}";
		var dbBuilder = new NpgsqlConnectionStringBuilder(
			container.AdminConnectionString
		) {
			Database = dbName,
			Pooling = false,
		};

		await using var adminConnection = new NpgsqlConnection(container.AdminConnectionString);
		await adminConnection.OpenAsync();

		try {
			await using var createCommand = new NpgsqlCommand(
				$"CREATE DATABASE {dbName}",
				adminConnection
			);
			await createCommand.ExecuteNonQueryAsync();

			var results = await RunSeederGateProbeAsync(dbBuilder.ConnectionString);

			results.ExitCode.Should().Be(0, "the seed gate should pass in Production");
			results.Payload.Should().NotBeNull("the probe should emit a JSON result payload");
			results.Payload!.DemoSeedersExcluded.Should().BeTrue();
			results.Payload.HasSeededPermissions.Should().BeTrue();
			results.Payload.HasStaffOwnerProfile.Should().BeTrue();
			results.Payload.HasSystemJobDefinitions.Should().BeTrue();
			results.Payload.HasOwnerUser.Should().BeTrue();
			results.Payload.HasOwnerAccount.Should().BeTrue();
			results.Payload.OwnerPasswordIsNotSeedPassword.Should().BeTrue();
		} finally {
			await DropDatabaseIfExistsAsync(adminConnection, dbName);
		}
	}

	private static async Task<(int ExitCode, SeederGatePayload? Payload)> RunSeederGateProbeAsync(
		string connectionString
	) {
		var assemblyPath = typeof(PublyApp.Api.Program).Assembly.Location;

		var startInfo = new ProcessStartInfo {
			FileName = Environment.ProcessPath ?? "dotnet",
			RedirectStandardOutput = true,
			RedirectStandardError = true,
			UseShellExecute = false,
			WorkingDirectory = Path.GetDirectoryName(assemblyPath),
		};
		startInfo.ArgumentList.Add("exec");
		startInfo.ArgumentList.Add(assemblyPath);
		startInfo.ArgumentList.Add("--assert-production-seeds");

		startInfo.Environment["ASPNETCORE_ENVIRONMENT"] = EnvironmentNames.Production;
		startInfo.Environment.Remove("DOTNET_ENVIRONMENT");
		startInfo.Environment["APP_ROLE"] = "api";
		startInfo.Environment["POSTGRES_CONNECTION_STRING"] = connectionString;

		var process = Process.Start(startInfo);
		if (process is null) {
			throw new InvalidOperationException("Failed to launch seeding gate probe process.");
		}

		using var _ = process;
		var stdout = process.StandardOutput.ReadToEnd();
		var stderr = process.StandardError.ReadToEnd();

		process.WaitForExit(milliseconds: 180_000).Should().BeTrue(
			"the production probe should finish quickly"
		);

		var payloadLine = stdout
			.Split(
				['\r', '\n'],
				StringSplitOptions.RemoveEmptyEntries
			)
			.FirstOrDefault(line => line.StartsWith("SEED_GATE_RESULT:", StringComparison.Ordinal));

		SeederGatePayload? payload = null;
		if (payloadLine is not null) {
			payload = JsonSerializer.Deserialize<SeederGatePayload>(
				payloadLine["SEED_GATE_RESULT:".Length..]
			);
		}

		process.ExitCode.Should().Be(
			0,
			"probe process must exit with 0 when all seeding assertions pass; "
				+ $"stdout: {stdout} stderr: {stderr}"
		);
		return (process.ExitCode, payload);
	}

	private static async Task DropDatabaseIfExistsAsync(
		NpgsqlConnection adminConnection,
		string dbName
	) {
		await using var terminateCommand = new NpgsqlCommand(
			$"""
				SELECT pg_terminate_backend(pid)
				FROM pg_stat_activity
				WHERE datname = @name
					AND pid <> pg_backend_pid()
			""",
			adminConnection
		);
		terminateCommand.Parameters.AddWithValue("name", dbName);
		await terminateCommand.ExecuteNonQueryAsync();

		await using var cleanupCommand = new NpgsqlCommand(
			$"DROP DATABASE IF EXISTS {dbName}",
			adminConnection
		);
		await cleanupCommand.ExecuteNonQueryAsync();
	}

	private sealed record SeederGatePayload(
		bool DemoSeedersExcluded,
		bool HasSeededPermissions,
		bool HasStaffOwnerProfile,
		bool HasSystemJobDefinitions,
		bool HasOwnerUser,
		bool HasOwnerAccount,
		bool OwnerPasswordIsNotSeedPassword
	);
}
