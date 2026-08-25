namespace PublyApp.Api.Modules.Messaging.Entities;

/// <summary>
/// Domain refusal raised when an <see cref="EmailLogActor"/> cannot be built
/// (#866 round 2): an empty/whitespace or over-bound author correlation id.
/// Thrown by the factory methods BEFORE any database write, so a refused actor
/// can never leave a half-written evidence trail.
///
/// The Message is STABLE and PII-free plain words that name what is missing and
/// why ("id is required: every email_log evidence row names its author (#866)."),
/// per the transparent-failure-causes owner rule — operators read the reason and
/// the next action without decoding a BCL argument error. A dedicated domain
/// type keeps these refusals greppable and distinct from accidental BCL
/// <c>ArgumentException</c>s raised by infrastructure code.
/// </summary>
public sealed class EmailLogActorException : Exception {
	public EmailLogActorException(string message) : base(message) {
	}
}
