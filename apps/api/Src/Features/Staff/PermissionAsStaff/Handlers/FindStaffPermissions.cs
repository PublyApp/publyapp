using FluentValidation;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Staff.PermissionAsStaff.Handlers;

public class FindStaffPermissionsQuery {
	public string? Language { get; set; }

	public string GetLanguage() {
		if (string.IsNullOrEmpty(Language)) {
			return SupportedLanguage.English;
		}

		var language = SupportedLanguage.All
			.FirstOrDefault(l => string.Compare(l, Language, StringComparison.OrdinalIgnoreCase) == 0);

		if (language is null) {
			throw new ArgumentException($"Invalid language: {Language}");
		}

		return language;
	}
}

public class FindStaffPermissionsQueryValidator : AbstractValidator<FindStaffPermissionsQuery> {
	public FindStaffPermissionsQueryValidator() {
		RuleFor(x => x.Language)
			.Must(l => SupportedLanguage.All.Contains(l, StringComparer.OrdinalIgnoreCase))
			.WithMessage("Language must be one of the following: " + string.Join(", ", SupportedLanguage.All))
			.When(x => !string.IsNullOrEmpty(x.Language));
	}
}

public class FindStaffPermissions {
	public static async Task<
			Results<
				Ok<
					Dictionary<
						string, // slice key prefix
						Dictionary<string, PermissionAsStaffItem> // permission key -> permission item
					>
				>,
				BadRequest<ApiResponse>
			>
		> HandleFindStaffPermissions(
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
