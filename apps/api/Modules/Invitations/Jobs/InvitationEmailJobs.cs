using PublyApp.Api.Infrastructure.Jobs;

namespace PublyApp.Api.Modules.Invitations.Jobs;

/// <summary>
/// Payload for <c>email.tenant-invitation.v1</c> (design §5.4, F2). IDs only — the
/// handler reloads the invitation (email, token, account level, tenant name) fresh at
/// send time, which is both the eligibility recheck (#811) and staleness-proof. The
/// member is <c>required</c> so <see cref="JobJson"/> throws on a missing field instead
/// of materializing <c>Guid.Empty</c>; the enqueuer additionally rejects empty IDs. The
/// fold migration emits exactly this camelCase wire shape: <c>{"invitationId":"…"}</c>.
/// </summary>
public sealed record TenantInvitationEmailPayload {
	public required Guid InvitationId { get; init; }
}

/// <summary>Payload for <c>email.staff-invitation.v1</c> — IDs only, same contract.</summary>
public sealed record StaffInvitationEmailPayload {
	public required Guid InvitationId { get; init; }
}

/// <summary>
/// The invitation-domain email job definition catalog (design §5.1/§5.4, F15/F14).
/// Producers enqueue ONLY through these definitions via <see cref="IJobEnqueuer"/>;
/// each owns its versioned <c>job_type</c>, elevated email priority (§4.1), and
/// retry ceiling.
/// </summary>
public static class InvitationEmailJobs {
	// Elevated so transactional emails are claimed ahead of bulk work (design §4.1).
	private const int EmailPriority = 100;

	public static readonly JobDefinition<TenantInvitationEmailPayload> TenantInvitationV1 =
		new() {
			JobType = "email.tenant-invitation.v1",
			Priority = EmailPriority
		};

	public static readonly JobDefinition<StaffInvitationEmailPayload> StaffInvitationV1 =
		new() {
			JobType = "email.staff-invitation.v1",
			Priority = EmailPriority
		};
}
