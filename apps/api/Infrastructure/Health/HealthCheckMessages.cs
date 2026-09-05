using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace PublyApp.Api.Infrastructure.Health;

/// <summary>
/// The sentences every health check shares, so ONE root cause reads the SAME
/// on every surface (issue #1716, review round 2): two checks reporting the
/// same problem with two wordings is the opposite of a transparent cause.
/// <para>
/// Issue #2037: every entry below is the PUBLIC surface. The
/// <c>/health/ready</c>, <c>/health</c>, and <c>/health/drain</c> endpoints are
/// unauthenticated and rate-limit exempt, so the wording has to be safe for an
/// attacker to read. Operational detail (job types, table names, environment
/// variables, deployment commands, counts, ages) belongs on the PROTECTED
/// logger the operator already tails — not in the JSON returned to anyone.
/// </para>
/// </summary>
public static class HealthCheckMessages {
	public const string DatabaseMigrationRegistrationName = "database_migrations";
	public const string JobQueueDrainRegistrationName = "job_queue_drain";

	public const string ApplicationReadinessName = "application readiness";
	public const string PublicationDeliveryName = "scheduled publication delivery";
	public const string GenericHealthName = "application health";

	public const string ApplicationReady =
		"The application is ready to serve traffic.";

	public const string ScheduledPublicationsBeingSent =
		"Scheduled publications are being sent.";

	public const string ScheduledPublicationsNotBeingSent =
		"Scheduled publications are not being sent.";

	public const string GenericHealthStatusUnavailable =
		"The application health status is unavailable.";

	/// <summary>
	/// The database cannot be reached (or its state cannot be read). Used by
	/// both database_migrations (readiness) and job_queue_drain (drain);
	/// identical wording means an operator never reads two sentences for one
	/// problem. Phrased as a product consequence — the application cannot
	/// read or write the database right now — without naming a host, an
	/// implementation, or the failure mode an attacker can probe.
	/// </summary>
	public const string DatabaseUnreachable =
		"The application cannot read or write the database right now.";

	public const string ApplicationNotReady =
		"The application is not ready to serve traffic yet.";

	/// <summary>
	/// Converts an internal registration and its health-check description to a
	/// deliberately small public vocabulary. Unknown registrations and unknown
	/// descriptions use the generic summary rather than falling back to data
	/// supplied by a health check.
	/// </summary>
	public static HealthCheckPublicSummary GetPublicSummary(
		string registrationName,
		HealthStatus status,
		string? description
	) {
		if (registrationName == DatabaseMigrationRegistrationName) {
			if (status == HealthStatus.Healthy && description == ApplicationReady) {
				return new(ApplicationReadinessName, ApplicationReady);
			}

			if (status == HealthStatus.Unhealthy && description == DatabaseUnreachable) {
				return new(ApplicationReadinessName, DatabaseUnreachable);
			}

			if (status == HealthStatus.Unhealthy && description == ApplicationNotReady) {
				return new(ApplicationReadinessName, ApplicationNotReady);
			}
		}

		if (registrationName == JobQueueDrainRegistrationName) {
			if (
				status == HealthStatus.Healthy
				&& description == ScheduledPublicationsBeingSent
			) {
				return new(PublicationDeliveryName, ScheduledPublicationsBeingSent);
			}

			if (
				status == HealthStatus.Unhealthy
				&& description == DatabaseUnreachable
			) {
				return new(PublicationDeliveryName, DatabaseUnreachable);
			}

			if (
				status == HealthStatus.Unhealthy
				&& description == ScheduledPublicationsNotBeingSent
			) {
				return new(PublicationDeliveryName, ScheduledPublicationsNotBeingSent);
			}
		}

		return new(GenericHealthName, GenericHealthStatusUnavailable);
	}
}

public sealed record HealthCheckPublicSummary(string Name, string Description);
