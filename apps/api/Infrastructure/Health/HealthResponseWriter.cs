using System.Text.Json;
using System.Text.Json.Serialization;

using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace PublyApp.Api.Infrastructure.Health;

/// <summary>
/// Renders readiness reports as JSON on the /health endpoints instead of the
/// framework default, which writes only the single word "Unhealthy" — a status
/// without a cause. The api/worker readiness guard (issue #1716) must NAME the
/// cause in the rendered state: the JSON carries the overall status and, per
/// check, the status and the plain-words description of what is wrong.
/// <para>
/// Issue #2037: every endpoint served here is unauthenticated and rate-limit
/// exempt. The writer therefore renders only what is safe for the PUBLIC
/// surface — the failing check name, its status, and a product-language
/// description. Operational detail that the underlying
/// <see cref="HealthCheckResult"/> carries in its <c>Data</c> dictionary
/// (job types, queue depths, ages, thresholds) is NOT serialized: that detail
/// lives on the protected logger so an operator can read it from the durable
/// log stream, not from the JSON returned to anyone.
/// </para>
/// </summary>
public static class HealthResponseWriter {
	private static readonly JsonSerializerOptions SerializerOptions = new() {
		PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
		WriteIndented = false,
		DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
	};

	/// <summary>
	/// Writes <c>{ status, checks: [{ name, status, description }] }</c> with
	/// <c>application/json</c>. Hung on the readiness endpoints only; liveness
	/// keeps the framework default (one probe is enough, and liveness must stay
	/// cheap by design).
	/// </summary>
	public static async Task WriteAsync(
		HttpContext httpContext,
		HealthReport healthReport
	) {
		httpContext.Response.ContentType = "application/json";

		var payload = new {
			status = healthReport.Status.ToString(),
			checks = healthReport.Entries.Select(entry => {
				var summary = HealthCheckMessages.GetPublicSummary(
					entry.Key,
					entry.Value.Status,
					entry.Value.Description
				);

				return new {
					name = summary.Name,
					status = entry.Value.Status.ToString(),
					description = summary.Description,
				};
			}),
		};

		await JsonSerializer.SerializeAsync(
			httpContext.Response.Body,
			payload,
			SerializerOptions,
			httpContext.RequestAborted
		);
	}
}
