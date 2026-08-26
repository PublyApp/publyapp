namespace PublyApp.Api.Modules.Messaging.Entities;

/// <summary>
/// The kind of transactional email a delivery record refers to (design §4.4). Values
/// PRESERVE the shipped <c>InvitationEmailKind { TenantInvitation = 0, StaffInvitation
/// = 1 }</c> so rows back-copied from <c>invitation_email_outbox</c> during the fold
/// (§4.6) keep their meaning; <see cref="PasswordReset"/> extends it for #809.
/// </summary>
public enum EmailKind {
	TenantInvitation = 0,
	StaffInvitation = 1,
	PasswordReset = 2,
	EmailVerification = 3,
	LegacySubmissionUnverified = 4,
	// #291: "you have been added as a staff member" notification, delivered via the
	// job queue (round-7+ API F4). Appended — preserves the fold's 0/1/2/3/4 back-copy
	// mapping for legacy invitation_email_outbox rows.
	StaffJoinedNotification = 5
}

/// <summary>
/// Terminal delivery outcome recorded in <c>email_log</c> (design §4.4). There is no
/// "delivered" — <see cref="Submitted"/> means the provider ACCEPTED the request, not
/// that it reached an inbox (F20 honesty; delivered/bounced needs provider webhooks).
/// </summary>
public enum EmailLogOutcome {
	/// <summary>The provider accepted the request. Only handlers running the corrected
	/// F3 contract (§5.4) ever write this.</summary>
	Submitted = 0,
	CancelledIneligible = 1,
	PermanentlyFailed = 2,

	/// <summary>
	/// A legacy <c>invitation_email_outbox</c> row that the old dispatcher marked
	/// <c>Sent</c>, back-copied by the fold (§4.6, R2-3). NOT evidence of provider
	/// acceptance: F3 records that <c>ResendEmailAdapter</c> returned
	/// <c>Success = false</c> on rejection, <c>EmailService</c> discarded that result, and
	/// the dispatcher marked the row <c>Sent</c> regardless — so such a row may in fact be
	/// a REJECTED send. Mapping it to <see cref="Submitted"/> would manufacture
	/// authoritative success history from rows known not to support it. Rendered as
	/// "legacy — delivery unverified"; no metric counts it as a confirmed submission.
	/// Provider reconciliation may later transition specific rows to
	/// <see cref="Submitted"/> through the audited state machine (§4.4); absent evidence
	/// they stay unverified.
	/// </summary>
	LegacySubmissionUnverified = 3
}
