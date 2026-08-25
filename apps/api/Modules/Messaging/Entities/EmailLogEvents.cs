namespace PublyApp.Api.Modules.Messaging.Entities;

/// <summary>
/// Wire vocabulary for <see cref="EmailLogEvidenceEvent.Event"/> values (issue #866,
/// jobs design §4.4 — the job_dead_letter_events vocabulary pattern, R10-3/O30).
/// Centralized so producers and specs never spell the strings inline. Values pair 1:1
/// with the §4.4 edge that justifies the transition; the webhook packet adds its
/// delivery/bounce/complaint events here.
/// </summary>
public static class EmailLogEvents {
	/// <summary>
	/// Provider-side evidence of acceptance reconciled onto a
	/// <see cref="EmailLogOutcome.LegacySubmissionUnverified"/> row (§4.4's first allowed
	/// edge). The webhook packet owns the delivered/bounced/complaint event values.
	/// </summary>
	public const string ProviderAcceptanceConfirmed = "email_log.provider_acceptance.confirmed";
}
