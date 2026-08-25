namespace PublyApp.Api.Modules.Messaging.Entities;

/// <summary>
/// Controlled vocabulary for <see cref="EmailLogEvidenceEvent.ActorKind"/>(issue #866,
/// jobs design §4.4/K-6): WHO produced a provider-evidence transition when no human is
/// involved. A provider webhook or reconciliation import has no user and the shipped
/// audit_logs table requires one (user_id NOT NULL FK) — so the evidence row NAMES its
/// author with this vocabulary plus <see cref="EmailLogEvidenceEvent.ActorId"/> instead.
/// Never null, never a fabricated users.id (R10-3/O30 shape).
/// </summary>
public static class EmailLogActorKinds {
	/// <summary>An authenticated, idempotently processed provider webhook (§4.4).</summary>
	public const string ProviderWebhook = "provider_webhook";

	/// <summary>An import of provider-side logs reconciling historical rows (§4.4).</summary>
	public const string ProviderReconciliation = "provider_reconciliation";
}
