namespace PublyApp.Api.Modules.Publishing.Providers;

/// <summary>
/// Classified outcome of one provider delivery attempt (Epic D §3): the caller maps
/// each kind onto exactly one domain status — success kinds land Published, account
/// failures pause the publication and flag the account NeedsReconnect, content
/// failures fail without retry, transient failures go back to the jobs engine.
/// Causes are human-readable, sanitised, and never carry secrets.
/// </summary>
public abstract record PublishResult {
	/// <summary>A fresh record was created.</summary>
	public sealed record Published(string RecordId, string RecordUrl) : PublishResult;

	/// <summary>
	/// The deterministic record key collided with an EXISTING record (a previous
	/// attempt created it, then timed out). Treated as SUCCESS carrying THAT record's
	/// identity — never a duplicate.
	/// </summary>
	public sealed record AlreadyExistsTreatedAsPublished(string RecordId, string RecordUrl)
		: PublishResult;

	/// <summary>The credential/session was refused: reconnect the account.</summary>
	public sealed record AccountFailure(string Cause) : PublishResult;

	/// <summary>The content itself was refused (e.g. too long): retrying cannot help.</summary>
	public sealed record ContentFailure(string Cause) : PublishResult;

	/// <summary>Server or transport trouble: retry later with backoff.</summary>
	public sealed record TransientFailure(string Cause) : PublishResult;
}
