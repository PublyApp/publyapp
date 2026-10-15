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

		var details = ValidationProblemDetails.Create(
			failure.Cause,
			key,
			new Dictionary<string, string[]> { ["body"] = [failure.Cause] }
		);
		details.Extensions["provider"] = failure.Provider;
		details.Extensions["limit"] = failure.Limit;
		details.Extensions["actual"] = failure.Actual;
		details.Extensions["unit"] = failure.Unit;

		return new AppValidationProblemHttpResult(details);
	}
}
