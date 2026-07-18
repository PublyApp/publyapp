namespace PublyApp.Api.Modules.Messaging.Entities;

/// <summary>
/// Provenance of an <c>email_log</c> row's current outcome (design §4.4) — the
/// <c>evidence_source</c> column's allowed values.
/// </summary>
public static class EmailEvidenceSource {
	/// <summary>
	/// The outcome the send path itself observed (provider acceptance/rejection, an
	/// ineligibility at the locked read, a dead-letter). The column default, and the only
	/// value written on this branch — the fold's back-copied legacy rows included: their
	/// "unverified" nature is carried by
	/// <see cref="EmailLogOutcome.LegacySubmissionUnverified"/>, not by a provenance value.
	/// </summary>
	public const string Local = "local";

	/// <summary>An authenticated, idempotently processed provider webhook (§4.4/§10).</summary>
	public const string ProviderWebhook = "provider_webhook";

	/// <summary>An import of provider-side logs reconciling historical rows (§4.4).</summary>
	public const string ProviderReconciliation = "provider_reconciliation";
}
