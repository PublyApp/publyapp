using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Lib;

/// <summary>
/// Maps a <see cref="PublishContentFailure"/> onto the 422 problem the three
/// publish entry points share: a typed translation key plus the machine-readable
/// <c>provider</c>, <c>limit</c>, <c>actual</c> and <c>unit</c> members.
/// </summary>
public static class PublishContentProblems {
	public static AppValidationProblemHttpResult ToProblem(
		PublishContentFailure failure
	) {
		var key = PublishContentProblems._KeyFor(failure.Kind);
		var extensions = new Dictionary<string, object?> {
			["provider"] = failure.Provider,
			["limit"] = failure.Limit,
			["actual"] = failure.Actual,
			["unit"] = failure.Unit,
		};
		if (failure.ImageIndex > 0) {
			extensions["imageIndex"] = failure.ImageIndex;
			extensions["contentType"] = failure.ContentType;
		}

		return TypedProblems.ValidationProblem(
			failure.Cause,
			key,
			new Dictionary<string, string[]> { ["body"] = [failure.Cause] },
			extensions
		);
	}

	private static TranslationKey _KeyFor(PublishContentFailureKind kind) {
		if (kind == PublishContentFailureKind.Empty) {
			return ResponseKeys.PublishContentEmpty;
		}

		if (kind == PublishContentFailureKind.TooManyImages) {
			return ResponseKeys.PublishImagesTooMany;
		}

		if (kind == PublishContentFailureKind.UnsupportedImageType) {
			return ResponseKeys.PublishImageUnsupportedType;
		}

		return ResponseKeys.PublishContentTooLong;
	}
}
