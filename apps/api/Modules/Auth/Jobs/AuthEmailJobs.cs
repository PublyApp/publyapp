using PublyApp.Api.Infrastructure.Jobs;

namespace PublyApp.Api.Modules.Auth.Jobs;

/// <summary>
/// Payload for <c>email.password-reset.v1</c> (design §5.4, F2/F6). IDs only — the
/// handler reloads the user and its current reset token fresh at send time, which is
/// the token-validity recheck (#811-equivalent) and staleness-proof. <c>required</c> so
/// <see cref="JobJson"/> rejects a missing field; the enqueuer rejects empty IDs. Wire
/// shape: <c>{"userId":"…"}</c>.
/// </summary>
public sealed record PasswordResetEmailPayload {
	public required Guid UserId { get; init; }
}

/// <summary>
/// The auth-domain email job definition catalog (design §5.1/§5.4, F15/F14). #809's
/// password-reset email is enqueued through <see cref="PasswordResetV1"/> inside the
/// transaction-owning <c>PasswordResetService</c>, at elevated email priority (§4.1).
/// </summary>
public static class AuthEmailJobs {
	// Elevated so transactional emails are claimed ahead of bulk work (design §4.1).
	private const int EmailPriority = 100;

	public static readonly JobDefinition<PasswordResetEmailPayload> PasswordResetV1 =
		new() {
			JobType = "email.password-reset.v1",
			Priority = EmailPriority
		};
}
