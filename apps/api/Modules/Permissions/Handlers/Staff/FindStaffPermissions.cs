using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Modules.Permissions.Services;

namespace PublyApp.Api.Modules.Permissions.Handlers.Staff;

public class FindStaffPermissionsQuery {
	[FromQuery(Name = "language")]
	public string? Language { get; set; }

	public string GetLanguage() {
		if (string.IsNullOrEmpty(Language)) {
			return SupportedLanguage.English;
		}

		var language = SupportedLanguage.All
			.FirstOrDefault(l =>
				string.Equals(l, Language, StringComparison.OrdinalIgnoreCase)
			);

		if (language is null) {
			throw new ArgumentException($"Invalid language: {Language}");
		}

		return language;
	}
}

/// <summary>
/// Keeps staff permission localization queries constrained to supported languages at the request
/// boundary. Follows the JsonElementRules.* convention in docs/guides/validator-conventions.md.
/// </summary>
public class FindStaffPermissionsQueryValidator : AbstractValidator<FindStaffPermissionsQuery> {
	public FindStaffPermissionsQueryValidator() {
		// Inline rule: no JsonElementRules.* equivalent for query-string language allowlists.
		//   See docs/guides/validator-conventions.md; extract if this shape repeats.
		RuleFor(x => x.Language)
			.Must(BeSupportedLanguage)
			.WithMessage(
				"Language must be one of the following: "
				+ string.Join(", ", SupportedLanguage.All)
			)
			.When(HasLanguage);
	}

	private static bool BeSupportedLanguage(string? language) {
		return SupportedLanguage.All
			.Contains(language, StringComparer.OrdinalIgnoreCase);
	}

	private static bool HasLanguage(FindStaffPermissionsQuery query) {
		return !string.IsNullOrEmpty(query.Language);
	}
}

public sealed class FindStaffPermissions {
	public static async Task<
			Results<
				Ok<
					Dictionary<
						string, // slice key prefix
						Dictionary<string, PermissionAsStaffItem> // permission key -> permission item
					>
				>,
				AppBadRequestHttpResult
			>
		> Handle(
		[FromServices] IPermissionAsStaffService permissionAsStaffService,
		[AsParameters] FindStaffPermissionsQuery findStaffPermissionsQuery,
		CancellationToken cancellationToken
	) {
		var language = findStaffPermissionsQuery.GetLanguage();

		var permissions = await permissionAsStaffService.FindStaffPermissionsAsync(
			language,
			cancellationToken: cancellationToken
		);

		return TypedResults.Ok(permissions);
	}
}
