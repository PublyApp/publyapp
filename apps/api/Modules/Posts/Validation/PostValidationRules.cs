using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;

namespace PublyApp.Api.Modules.Posts.Validation;

/// <summary>
/// Post domain validation bounds. Mirrors the #1135 role-fields mechanism:
/// max lengths are validator-side constants, not EF column bounds, so the
/// database schema stays permissive while the API contract is bounded here.
/// </summary>
public static class PostValidationRules {
	// Long-form social/blog content; consistent with the repo's existing
	// scale (Message 2000, Description 1024) but generous for article bodies.
	// Storage guard for the DRAFT body only (#2169): publish/schedule limits are
	// per provider (Publishing/Providers/Capabilities/ProviderCapabilityRegistry.cs), not this constant.
	public const int BodyMaxLength = 20_000;
	// A thread is 1..25 segments: the first is Post.Body, at most 24 follow-ups (#2171).
	public const int MaxSegments = 25;
	public const int MaxFollowUpSegments = PostValidationRules.MaxSegments - 1;
	public const int SearchMaxLength = 256;

	// Alt text rides on the attached image row; bounded here like every other
	// wire field so the DB column stays permissive while the contract is not.
	public const int ImageAltTextMaxLength = 1_000;

	/// <summary>
	/// A blank follow-up is refused with the segment named (1-based number in the thread,
	/// so numbering never shifts), never dropped silently on save (#2181).
	/// </summary>
	public static AppValidationProblemHttpResult? FindBlankSegment(IReadOnlyList<string>? segments) {
		if (segments is null) {
			return null;
		}

		for (var index = 0; index < segments.Count; index++) {
			if (!string.IsNullOrWhiteSpace(segments[index])) {
				continue;
			}

			var number = index + 2;
			var message = $"Segment {number} is empty. Write some text or remove it.";
			return TypedProblems.ValidationProblem(
				message,
				ResponseKeys.PostSegmentBlank,
				new Dictionary<string, string[]> {
					["segments"] = [message],
				},
				new Dictionary<string, object?> {
					["segmentNumber"] = number,
				}
			);
		}

		return null;
	}
}
