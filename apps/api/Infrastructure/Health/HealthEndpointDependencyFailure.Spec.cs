using System.Net;
using System.Text.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Logging;

using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Publishing.Jobs;

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
				AssertPublicHealthBody(body);
				body.Should().Contain(
					"The application cannot read or write the database right now."
				);
				var report = JsonSerializer.Deserialize<HealthReportJson>(body, JsonOptions);
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

	private static readonly string[] ForbiddenPublicBodySubstrings = [
		"database_migrations",
		"job_queue_drain",
		"internal_registration_name",
		"internal exception",
		"job_queue",
		"APP_ROLE=worker",
		"worker process",
		"docker compose ps",
		"ss -tlnp",
		PublishingJobs.PublishPublicationV1JobType,
		"PublishPublicationV1",
		"\"stalledJobCount\"",
		"\"oldestJobType\"",
		"\"oldestJobAgeSeconds\"",
		"\"stallThresholdSeconds\"",
		"next_attempt_at",
		"last_error",
		"\"data\"",
		"\"exception\"",
		"\"count\"",
		"\"age\"",
	];
	private static readonly JsonSerializerOptions JsonOptions = new() {
		PropertyNameCaseInsensitive = true,
	};

	private static void AssertPublicHealthBody(string body) {
		foreach (var forbidden in ForbiddenPublicBodySubstrings) {
			body.Contains(forbidden, StringComparison.OrdinalIgnoreCase).Should().BeFalse(
				$"the complete public health body must not leak '{forbidden}'"
			);
		}

		using var document = JsonDocument.Parse(body);
		var rootProperties = document.RootElement.EnumerateObject()
			.Select(property => property.Name)
			.ToList();
		rootProperties.Should().BeEquivalentTo(["status", "checks"]);

		foreach (var check in document.RootElement.GetProperty("checks").EnumerateArray()) {
			var checkProperties = check.EnumerateObject()
				.Select(property => property.Name)
				.ToList();
			checkProperties.Should().BeEquivalentTo(["name", "status", "description"]);
		}
	}

	private sealed class HealthReportJson {
		public string? Status { get; set; }
		public IReadOnlyList<HealthCheckJson>? Checks { get; set; }
	}

	private sealed class HealthCheckJson {
		public string? Name { get; set; }
		public string? Status { get; set; }
		public string? Description { get; set; }
	}

	private sealed class CapturingLoggerProvider : ILoggerProvider {
		public List<CapturedLog> Entries { get; } = [];

		public IReadOnlyList<CapturedLog> Warnings {
			get {
				return Entries.Where(entry => entry.Level == LogLevel.Warning).ToList();
			}
		}

		public ILogger CreateLogger(string categoryName) {
			return new CapturingLogger(this, categoryName);
		}

		public void Dispose() {
		}

		private sealed class CapturingLogger(
			CapturingLoggerProvider provider,
			string categoryName
		) : ILogger {
			public IDisposable BeginScope<TState>(TState state) where TState : notnull {
				return NullScope.Instance;
			}

			public bool IsEnabled(LogLevel logLevel) {
				return true;
			}

			public void Log<TState>(
				LogLevel logLevel,
				EventId eventId,
				TState state,
				Exception? exception,
				Func<TState, Exception?, string> formatter
			) {
				var structuredState = state is IEnumerable<KeyValuePair<string, object?>> values
					? values.ToList()
					: [];
				provider.Entries.Add(new CapturedLog(
					logLevel,
					categoryName,
					formatter(state, exception),
					structuredState,
					exception
				));
			}
		}

		private sealed class NullScope : IDisposable {
			public static readonly NullScope Instance = new();

			public void Dispose() {
			}
		}
	}

	private sealed record CapturedLog(
		LogLevel Level,
		string Category,
		string Message,
		IReadOnlyList<KeyValuePair<string, object?>> State,
		Exception? Exception
	);
}
