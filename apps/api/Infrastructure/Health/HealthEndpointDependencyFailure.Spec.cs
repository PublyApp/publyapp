using System.Net;
using System.Text.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Mvc.Testing;

using PublyApp.Api.Lib.Testing.Fakes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;

using Xunit;

namespace PublyApp.Api.Infrastructure.Health;

/// <summary>
/// Exercises the dependency failure through the real unauthenticated endpoint
/// without an <see cref="ApiFixture"/>. The endpoint must be able to report a
/// database outage even when the test database itself is unavailable.
/// </summary>
public sealed class HealthEndpointDependencyFailureSpec {
	[Fact]
	public async Task ItShouldReturnASafeBodyAndOneStructuredWarningWhenTheDatabaseIsUnreachable() {
		var loggerProvider = new CapturingLoggerProvider();
		var storageRoot = Path.Combine(
			Path.GetTempPath(), $"publyapp-health-storage-{Guid.NewGuid():N}"
		);
		var unreachableConnection =
			"Host=127.0.0.1;Port=1;Database=unreachable;Username=test;Password=test;"
			+ "Timeout=1;Command Timeout=1";

		try {
			await using var factory = new ApiFactory(
				unreachableConnection,
				storageRoot,
				loggerProvider: loggerProvider
			);
			using var http = factory.CreateClient(
				new WebApplicationFactoryClientOptions { HandleCookies = false }
			);

			for (var attempt = 0; attempt < 3; attempt++) {
				using var response = await http.GetAsync("/health/ready");
				var body = await response.Content.ReadAsStringAsync();

				response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
				HealthTestHelper.AssertPublicHealthBody(body);
				body.Should().Contain(
					"The application cannot read or write the database right now."
				);
				var report = JsonSerializer.Deserialize<HealthTestHelper.HealthReportJson>(
					body,
					HealthTestHelper.JsonOptions
				);
				report.Should().NotBeNull();
				Assert.NotNull(report);
				report.Checks.Should().ContainSingle(check =>
					check.Name == "application readiness"
					&& check.Status == "Unhealthy"
					&& check.Description ==
						"The application cannot read or write the database right now."
				);
			}

			var warning = loggerProvider.Warnings.Should().ContainSingle(
				"repeated unauthenticated probes must not amplify the protected warning log"
			).Subject;
			warning.Message.Should().Contain("database");
			warning.State.Should().Contain(pair =>
				pair.Key == "HealthCheck" && Equals(pair.Value, "application readiness")
			);
			warning.State.Should().Contain(pair =>
				pair.Key == "FailureReason" && Equals(pair.Value, "database_unreachable")
			);
		} finally {
			if (Directory.Exists(storageRoot)) {
				Directory.Delete(storageRoot, recursive: true);
			}
		}
	}
}
