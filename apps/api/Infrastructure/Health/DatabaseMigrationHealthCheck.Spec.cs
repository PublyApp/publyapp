using System.Text.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging;

using PublyApp.Api.Lib.Testing.Fakes;

using Xunit;

namespace PublyApp.Api.Infrastructure.Health;

public sealed class DatabaseMigrationHealthCheckSpec {
	[Fact]
	public void ItShouldBoundPendingMigrationDiagnosticsWithoutLosingTheTotalCount() {
		var longMigrationName =
			"20260905_pending_migration_2\n"
			+ new string('x', DatabaseMigrationReadinessResult.MaxPendingMigrationNameLength);
		var pendingMigrations = new[] {
			"20260905_pending_migration_1",
			longMigrationName,
		}.Concat(Enumerable.Range(3, 6).Select(index =>
			$"20260905_pending_migration_{index}"
		));

		var result = DatabaseMigrationReadinessResult.FromPendingMigrations(pendingMigrations);

		result.IsReady.Should().BeFalse();
		result.PendingMigrationCount.Should().Be(8);
		result.PendingMigrationNames.Should().HaveCount(5);
		result.PendingMigrationNames.Should().Contain("20260905_pending_migration_1");
		result.PendingMigrationNames.Should().OnlyContain(name =>
			name.Length <= DatabaseMigrationReadinessResult.MaxPendingMigrationNameLength
			&& name.All(character => !char.IsControl(character))
		);
		result.PendingMigrationNamesTruncated.Should().BeTrue();
	}

	[Fact]
	public async Task ItShouldLogPendingMigrationContextOnlyInProtectedWarningState() {
		var pendingMigrations = DatabaseMigrationReadinessResult.FromPendingMigrations([
			"20260905_add_publication_status",
			"20260905_add_publication_indexes",
		]);
		var logger = new CapturingLogger<DatabaseMigrationHealthCheck>();
		var check = new DatabaseMigrationHealthCheck(
			new StubMigrationReadiness(pendingMigrations),
			logger,
			new HealthCheckLogGate()
		);

		var result = await check.CheckHealthAsync(new HealthCheckContext());

		result.Status.Should().Be(HealthStatus.Unhealthy);
		result.Data.Should().BeEmpty();
		var warning = logger.Entries.Should().ContainSingle().Subject;
		warning.Level.Should().Be(LogLevel.Warning);
		warning.State.Should().Contain(pair =>
			pair.Key == "PendingMigrationCount" && Equals(pair.Value, 2)
		);
		warning.State.Should().Contain(pair =>
			pair.Key == "PendingMigrationNames"
			&& Equals(
				pair.Value,
				"20260905_add_publication_status, 20260905_add_publication_indexes"
			)
		);
		warning.State.Should().Contain(pair =>
			pair.Key == "PendingMigrationNamesTruncated" && Equals(pair.Value, false)
		);

		var context = new DefaultHttpContext();
		context.Response.Body = new MemoryStream();
		var report = new HealthReport(
			new Dictionary<string, HealthReportEntry> {
				[HealthCheckMessages.DatabaseMigrationRegistrationName] = new(
					result.Status,
					HealthCheckMessages.ApplicationNotReady,
					TimeSpan.Zero,
					exception: null,
					data: null
				),
			},
			TimeSpan.Zero
		);

		await HealthResponseWriter.WriteAsync(context, report);
		context.Response.Body.Position = 0;
		var body = await new StreamReader(context.Response.Body).ReadToEndAsync();

		body.Should().NotContain("20260905_add_publication_status");
		body.Should().NotContain("PendingMigrationCount");
		JsonDocument.Parse(body).RootElement.GetProperty("checks").GetArrayLength()
			.Should().Be(1);
	}

	private sealed class StubMigrationReadiness(
		DatabaseMigrationReadinessResult result
	) : IDatabaseMigrationReadiness {
		public Task<DatabaseMigrationReadinessResult> IsReadyAsync(
			CancellationToken cancellationToken
		) {
			cancellationToken.ThrowIfCancellationRequested();
			return Task.FromResult(result);
		}
	}
}
