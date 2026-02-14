using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Auth.Utils;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Auth.Handlers;

public class GetVerificationLinkQuery {
	public string UserId { get; set; } = string.Empty;

	public Guid GetUserId() {
		return Guid.TryParse(UserId, out var userId) ? userId : Guid.Empty;
	}
}

public class GetVerificationLinkQueryValidator : AbstractValidator<GetVerificationLinkQuery> {
	public GetVerificationLinkQueryValidator() {
		RuleFor(x => x.UserId)
			.NotEmpty().WithMessage("UserId is required");
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
