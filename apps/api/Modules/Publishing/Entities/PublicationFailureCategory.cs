using System.Globalization;

using PublyApp.Api.Modules.SocialAccounts.Lib;

namespace PublyApp.Api.Modules.Publishing.Entities;

/// <summary>
/// What the user can do about a Failed or Paused publication (#647): exactly one
/// category, so the UI shows exactly one primary action. Stored as a number
/// (pinned by CK_Publication_FailureCategory); null on every non-failure status
/// and on rows that failed before categories existed (shown as Unknown).
/// </summary>
public enum PublicationFailureCategory {
	/// <summary>Credentials rejected: reconnect the account.</summary>
	Reconnect = 1,
	/// <summary>The provider refused the content: edit the post.</summary>
	FixContent = 2,
	/// <summary>Network / 5xx / rate limit, retries exhausted: retry now.</summary>
	RetryLater = 3,
	/// <summary>The outcome could not be classified: retry now.</summary>
	Unknown = 4,
	/// <summary>
	/// An ambiguous write could not be ruled in or out (#2176): the user checks the
	/// provider profile, then marks the post published or retries.
	/// </summary>
	NeedsReview = 5,
}

public static class PublicationFailureCategoryWire {
	public static string Format(PublicationFailureCategory category) {
		return category switch {
			PublicationFailureCategory.Reconnect => "reconnect",
			PublicationFailureCategory.FixContent => "fix_content",
			PublicationFailureCategory.RetryLater => "retry_later",
			PublicationFailureCategory.Unknown => "unknown",
			PublicationFailureCategory.NeedsReview => "needs_review",
			_ => throw new ArgumentOutOfRangeException(
				nameof(category), category, "Unhandled PublicationFailureCategory"
			),
		};
	}

	/// <summary>
	/// Plain-words cause used when a provider supplied nothing visible (#2013):
	/// Failed/Paused rows never store a blank cause.
	/// </summary>
	public static string GenericCause(PublicationFailureCategory category) {
		return category switch {
			PublicationFailureCategory.Reconnect =>
				"the social account needs reconnecting",
			PublicationFailureCategory.FixContent =>
				"the provider refused the post content",
			PublicationFailureCategory.RetryLater =>
				"the provider could not be reached; try again later",
			PublicationFailureCategory.Unknown =>
				"the outcome could not be classified",
			PublicationFailureCategory.NeedsReview =>
				"it may already be on the provider; check the profile, then mark it published or retry",
			_ => throw new ArgumentOutOfRangeException(
				nameof(category), category, "Unhandled PublicationFailureCategory"
			),
		};
	}

	/// <summary>
	/// The sanitised cause, or the category's generic sentence when nothing visible
	/// survives (empty, whitespace, control or invisible characters only — #2013).
	/// </summary>
	public static string CauseOrGeneric(string? cause, PublicationFailureCategory category) {
		var sanitised = LastErrorSanitiser.Sanitize(cause);
		if (sanitised is not null && PublicationFailureCategoryWire._HasVisibleText(sanitised)) {
			return sanitised;
		}

		return PublicationFailureCategoryWire.GenericCause(category);
	}

	private static bool _HasVisibleText(string? text) {
		return text is not null && text.Any(character =>
			!char.IsWhiteSpace(character)
			&& !char.IsControl(character)
			&& character != '\u2800'
			&& char.GetUnicodeCategory(character) is not (
				UnicodeCategory.Format or UnicodeCategory.OtherNotAssigned
			));
	}
}
