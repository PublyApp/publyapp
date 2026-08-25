using PublyApp.Api.Modules.Messaging.Entities;

namespace PublyApp.Api.Modules.Messaging.Services;

/// <summary>
/// Marker for §4.4 <c>email_log</c> evidence-transition contracts (#866 round-1): every
/// type carrying the identity + evidence of one transition implements this interface.
/// The architecture guard (<c>EmailEvidenceAuditActorGuardSpec</c>) enumerates EVERY
/// implementor in the API assembly and requires a required, init-only
/// <see cref="EmailLogActor"/> <c>Actor</c> member — so a transition added later
/// without a named author goes red in CI naming the type, not just at review.
/// </summary>
public interface IEmailLogTransition {
}
