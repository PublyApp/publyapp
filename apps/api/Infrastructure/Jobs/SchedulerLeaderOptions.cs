namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Injected configuration for <see cref="SchedulerLeaderService"/>. The connection string
/// is passed in (rather than read from AppEnvironment inside the service) so specs can
/// point a leader at the Testcontainers database; in the app it is wired from
/// AppEnvironment.POSTGRES_CONNECTION_STRING (design §5.2).
/// </summary>
public sealed record SchedulerLeaderOptions {
	public required string ConnectionString { get; init; }
}
