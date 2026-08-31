using System.Text.Encodings.Web;
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
/// </summary>
public static class HealthResponseWriter {
	private static readonly JsonSerializerOptions SerializerOptions = new() {
		// HealthCheckResult descriptions contain backticks and quotes for
		// container/process names; the encoder must not mangle them.
		Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
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
			checks = healthReport.Entries.Select(entry => new {
				name = entry.Key,
				status = entry.Value.Status.ToString(),
				description = entry.Value.Description,
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
