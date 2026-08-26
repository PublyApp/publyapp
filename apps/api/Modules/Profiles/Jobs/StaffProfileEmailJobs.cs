using PublyApp.Api.Infrastructure.Jobs;

namespace PublyApp.Api.Modules.Profiles.Jobs;

/// <summary>
/// Payload for <c>email.staff-joined-notification.v1</c> (#291). IDs only — the handler
/// reloads the user (email, liveness) fresh at send time, which is the eligibility
/// recheck (#811) and staleness-proof. The member is <c>required</c> so
/// <see cref="JobJson"/> throws on a missing field instead of materializing
/// <c>Guid.Empty</c>; the enqueuer additionally rejects empty IDs. Wire shape:
/// <c>{"userId":"…"}</c>.
/// </summary>
public sealed record StaffJoinedNotificationEmailPayload {
	public required Guid UserId { get; init; }
}

/// <summary>
/// The staff-profile-domain email job definition catalog (#291, following the per-domain
/// catalogs of design §5.1/§5.4). Producers enqueue ONLY through these definitions via
/// <see cref="IJobEnqueuer"/>; each owns its versioned <c>job_type</c>, elevated email
/// priority (§4.1), and payload validation.
/// </summary>
public static class StaffProfileEmailJobs {
	// Elevated so transactional emails are claimed ahead of bulk work (design §4.1).
	private const int EmailPriority = 100;

	public static readonly JobDefinition<StaffJoinedNotificationEmailPayload> StaffJoinedNotificationV1 =
		new() {
			JobType = "email.staff-joined-notification.v1",
			Priority = EmailPriority
		};
}
