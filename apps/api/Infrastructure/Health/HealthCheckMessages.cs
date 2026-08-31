namespace PublyApp.Api.Infrastructure.Health;

/// <summary>
/// The sentences every health check shares, so ONE root cause reads the SAME
/// on every surface (issue #1716, review round 2): two checks reporting the
/// same problem with two wordings is the opposite of a transparent cause.
/// </summary>
public static class HealthCheckMessages {
	/// <summary>
	/// The database cannot be reached (or its state cannot be read). Used by
	/// both database_migrations (readiness) and job_queue_drain (drain);
	/// identical wording means an operator never reads two sentences for one
	/// problem.
	/// </summary>
	public const string DatabaseUnreachable =
		"The database is unreachable or its state could not be read.";
}
