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
		var key = failure.Kind == PublishContentFailureKind.Empty
			? ResponseKeys.PublishContentEmpty
			: ResponseKeys.PublishContentTooLong;

		return TypedProblems.ValidationProblem(
			failure.Cause,
			key,
			new Dictionary<string, string[]> { ["body"] = [failure.Cause] },
			new Dictionary<string, object?> {
				["provider"] = failure.Provider,
				["limit"] = failure.Limit,
				["actual"] = failure.Actual,
				["unit"] = failure.Unit,
			}
		);
	}
}
