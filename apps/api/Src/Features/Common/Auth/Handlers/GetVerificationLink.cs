using FluentValidation;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using MainApi.Src.Features.Common.User;
using MainApi.Localization;

namespace MainApi.Src.Features.Common.Auth.Handlers;

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
			BadRequest<ApiResponse>
		>
	> HandleGetVerificationLink(
		[AsParameters] GetVerificationLinkQuery query,
		[FromServices] ILogger<GetVerificationLink> logger,
		[FromServices] IUserService UserService,
		CancellationToken cancellationToken
	) {
		var userId = query.GetUserId();

		if (userId == Guid.Empty) {
			// user id is invalid but for security reasons we do not disclose that
			// This also save unnecessary database queries
			logger.LogDebug("Invalid user ID: {@UserId}", userId);
			return TypedResults.BadRequest(
				ApiResponse.Create("User not found", ResponseKeys.UserNotFound)
			);
		}

		var user = await UserService.GetUserByIdAsync(userId, cancellationToken);

		if (user is null) {
			return TypedResults.BadRequest(ApiResponse.Create("User not found", ResponseKeys.UserNotFound));
		}

		var link = AuthUtils.CreateVerificationUrl(user.GetRequiredId().ToString(), user.Email);

		return TypedResults.Ok(new GetVerificationLinkResult { Link = link });
	}
}
