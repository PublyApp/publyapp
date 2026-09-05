using System.Text.Json;

using FluentAssertions;

using PublyApp.Api.Modules.Publishing.Jobs;

namespace PublyApp.Api.Lib.Testing.Helpers;

internal static class HealthTestHelper {
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

	public static readonly JsonSerializerOptions JsonOptions = new() {
		PropertyNameCaseInsensitive = true,
	};

	public static void AssertPublicHealthBody(string body) {
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

	internal sealed class HealthReportJson {
		public string? Status { get; set; }
		public IReadOnlyList<HealthCheckJson>? Checks { get; set; }
	}

	internal sealed class HealthCheckJson {
		public string? Name { get; set; }
		public string? Status { get; set; }
		public string? Description { get; set; }
	}
}
