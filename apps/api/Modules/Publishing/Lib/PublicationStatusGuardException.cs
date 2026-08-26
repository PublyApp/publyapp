using PublyApp.Api.Modules.Publishing.Entities;

namespace PublyApp.Api.Modules.Publishing.Lib;

/// <summary>
/// Domain refusal raised by <see cref="PublicationStatusWriteGuard"/> (#1446):
/// a Publication.Status write that did not come from
/// PublicationStatusTransitionService reached the save boundary. Thrown BEFORE
/// any database write, so an illegal write can never land partially.
///
/// The Message names the publication id and the refused old → new statuses in
/// stable PII-free plain words plus the next action, per the transparent
/// failure causes owner rule. A dedicated domain type keeps these refusals
/// greppable and distinct from accidental BCL infrastructure errors, mirroring
/// Messaging's EmailLogActorException precedent.
/// </summary>
public sealed class PublicationStatusGuardException : Exception {
	public PublicationStatusGuardException(string message) : base(message) {
	}

	internal static PublicationStatusGuardException ForTrackedWrite(
		Guid publicationId,
		PublicationStatus currentStatus,
		PublicationStatus proposedStatus
	) {
		return new PublicationStatusGuardException(
			$"Publication {publicationId}: refusing to change Status from "
				+ $"'{currentStatus}' to '{proposedStatus}' at save time — this write was "
				+ "not written through the transition service "
				+ "(PublicationStatusTransitionService is the only Status writer, #1446)."
		);
	}
}
