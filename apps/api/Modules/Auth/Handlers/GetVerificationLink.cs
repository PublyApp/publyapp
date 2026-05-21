using FluentValidation;

using MainApi.Localization;
using MainApi.Lib.ProblemResults;
using MainApi.Lib.Validation;
using MainApi.Modules.Auth.Utils;
using MainApi.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Modules.Auth.Handlers;

public class GetVerificationLinkQuery {
	[FromQuery(Name = "user_id")]
	public string UserId { get; set; } = string.Empty;

	public Guid GetUserId() {
		return Guid.TryParse(UserId, out var userId) ? userId : Guid.Empty;
	}
}

public class GetVerificationLinkQueryValidator : AbstractValidator<GetVerificationLinkQuery> {
	public GetVerificationLinkQueryValidator() {
		RuleFor(x => x.UserId)
			.NotEmpty()
			.WithMessage("user_id is required")
			.Must(QueryPredicates.BeValidNullableGuid)
			.WithMessage("user_id must be a valid GUID");
	}
}

public class GetVerificationLinkResult {
	public required string Link { get; set; }
}

public class GetVerificationLink {
	public async static Task<
		Results<
			Ok<GetVerificationLinkResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult
		>
	> HandleGetVerificationLink(
		[AsParameters] GetVerificationLinkQuery query,
		[FromServices] ILogger<GetVerificationLink> logger,
		[FromServices] IUserService UserService,
		CancellationToken cancellationToken
	) {
		var userId = query.GetUserId();

		// Endpoint query validation normally rejects malformed
		// user_id before this handler; this guard is
		// defense-in-depth for direct calls or missing filters.
		if (userId == Guid.Empty) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"Invalid user ID: {@UserId}",
					userId
				);
			}

			return TypedProblems.BadRequest(
				"Invalid user ID",
				ResponseKeys.BadRequest
			);
		}

		var user = await UserService.GetUserByIdAsync(
			userId, cancellationToken
		);

		if (user is null) {
			return TypedProblems.NotFound(
				"User not found",
				ResponseKeys.NotFound
			);
		}

		var link = AuthUtils.CreateVerificationUrl(user.GetRequiredId().ToString(), user.Email);

		return TypedResults.Ok(new GetVerificationLinkResult { Link = link });
	}
}
