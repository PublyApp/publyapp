using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Modules.Permissions.Services;

namespace PublyApp.Api.Modules.Permissions.Handlers.Staff;

public class FindTenantPermissionsQuery {
	// Keep the wire name lowercase to match repo query-parameter conventions and Kiota output.
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

public class FindTenantPermissionsQueryValidator : AbstractValidator<FindTenantPermissionsQuery> {
	public FindTenantPermissionsQueryValidator() {
		RuleFor(x => x.Language)
			.Must(l =>
				SupportedLanguage.All.Contains(l, StringComparer.OrdinalIgnoreCase)
			)
			.WithMessage(
				"Language must be one of the following: "
				+ string.Join(", ", SupportedLanguage.All)
			)
			.When(x => !string.IsNullOrEmpty(x.Language));
	}
}

public sealed class FindTenantPermissions {
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
		[AsParameters] FindTenantPermissionsQuery findTenantPermissionsQuery,
		CancellationToken cancellationToken
	) {
		var language = findTenantPermissionsQuery.GetLanguage();

		// The staff UI consumes this catalog as backend-owned metadata rather than maintaining
		// a frontend enum copy of tenant permissions.
		var permissions = await permissionAsStaffService.FindTenantPermissionsAsync(
			language,
			cancellationToken: cancellationToken
		);

		return TypedResults.Ok(permissions);
	}
}
