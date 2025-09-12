namespace MainApi.Src.Features.Common.Auth.Handlers.GetVerificationLink;

using FluentValidation;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

public class GetVerificationLinkQuery
{
	public Guid UserId { get; set; }
}

public class GetVerificationLinkQueryValidator : AbstractValidator<GetVerificationLinkQuery>
{
	public GetVerificationLinkQueryValidator()
	{
		RuleFor(x => x.UserId)
			.NotEmpty().WithMessage("UserId is required");
	}
}

public class GetVerificationLinkSuccessResult
{
	public required string Link { get; set; }
}

public class GetVerificationLink
{
	public async static Task<Results<Ok<GetVerificationLinkSuccessResult>, BadRequest<ApiResponse>>> HandleGetVerificationLink(
		[AsParameters] GetVerificationLinkQuery query,
		[FromServices] ILogger<GetVerificationLink> logger,
		CancellationToken cancellationToken = default
	)
	{
		await Task.Delay(1000, cancellationToken).ConfigureAwait(false);
		logger.LogDebug("GetVerificationLink: {@logData}", new { query.UserId });
		return TypedResults.Ok(new GetVerificationLinkSuccessResult { Link = "https://example.com" });
	}
}
