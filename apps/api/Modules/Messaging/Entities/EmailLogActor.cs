namespace PublyApp.Api.Modules.Messaging.Entities;

/// <summary>
/// The named author of an <c>email_log</c> provider-evidence transition (issue #866,
/// jobs design §4.4/K-6). A value object, not two free strings: <see cref="Kind"/> can
/// only hold an <see cref="EmailLogActorKinds"/> vocabulary value — the static factories
/// below are the only way to construct either the kind or the actor — and
/// <see cref="Id"/> is non-empty and bounded, enforced in the constructor so an empty or
/// oversized author fails here, before any database write.
/// </summary>
public sealed record EmailLogActor {
	/// <summary>
	/// Upper bound for <see cref="Id"/>: provider event ids and import batch ids are
	/// correlation text (F20) — long enough for any real provider, short enough to bound
	/// the column. Mirrored by the migration's CHECK constraint.
	/// </summary>
	public const int MaxIdLength = 512;

	/// <summary>The vocabulary value persisted as <c>actor_kind</c>.</summary>
	public string Kind { get; }

	/// <summary>The author's correlation text (provider event id / import batch id).</summary>
	public string Id { get; }

	private EmailLogActor(string kind, string id) {
		Kind = kind;
		Id = id;
	}

	/// <summary>An authenticated, idempotently processed provider webhook (§4.4).</summary>
	public static EmailLogActor ProviderWebhook(string id) {
		return new EmailLogActor(EmailLogActorKinds.ProviderWebhook, ValidateId(id));
	}

	/// <summary>An import of provider-side logs reconciling historical rows (§4.4).</summary>
	public static EmailLogActor ProviderReconciliation(string id) {
		return new EmailLogActor(EmailLogActorKinds.ProviderReconciliation, ValidateId(id));
	}

	private static string ValidateId(string id) {
		if (string.IsNullOrWhiteSpace(id)) {
			throw new EmailLogActorException(
				"id is required: every email_log evidence row names its author (#866).");
		}

		if (id.Length > MaxIdLength) {
			throw new EmailLogActorException(
				$"id must be at most {MaxIdLength} characters (got {id.Length}).");
		}

		return id;
	}
}
