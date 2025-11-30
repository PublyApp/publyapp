using FluentValidation;
using MainApi.Localization;
using MainApi.Src.Features.Common.Invitation;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Common.Auth.Handlers;

public class CheckInvitationTokenQuery {
	public required string Id { get; set; }
	public required string Token { get; set; }
}

public class CheckInvitationTokenQueryValidator : AbstractValidator<CheckInvitationTokenQuery> {
	public CheckInvitationTokenQueryValidator() {
		RuleFor(x => x.Id)
			.NotEmpty().WithMessage("ID is required")
			.Must(id => CryptoUtils.IsValidEncryptedString(id)).WithMessage("Invalid ID format");

		RuleFor(x => x.Token)
			.NotEmpty().WithMessage("Token is required");
	}
}

public class CheckInvitationTokenResult {
	public string Status { get; set; } = "success";
	public string Email { get; set; } = string.Empty;
}

public static class CheckInvitationToken {
	public static async Task<
		Results<
			Ok<CheckInvitationTokenResult>,
			BadRequest<ApiResponse>
		>
	> HandleCheckInvitationToken(
		[AsParameters] CheckInvitationTokenQuery query,
		[FromServices] IInvitationService invitationService,
		[FromServices] ILoggerFactory loggerFactory,
		CancellationToken cancellationToken
	) {
		var logger = loggerFactory.CreateLogger(nameof(CheckInvitationToken));

		string id = query.Id;
		string token = query.Token;

		// Decrypt the ID to get email
		string email;
		try {
			email = CryptoUtils.DecryptString(id).ToLowerInvariant();
		} catch {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Invalid or expired invitation token",
				ResponseKeys.InvalidInvitationToken
			));
		}

		// Query invitation by token
		var invitation = await invitationService.GetInvitationByTokenAsync(token, cancellationToken);

		if (invitation is null) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Invalid or expired invitation token",
				ResponseKeys.InvalidInvitationToken
			));
		}

		// check if invitation is for the given email
		if (string.Equals(invitation.Email, email, StringComparison.OrdinalIgnoreCase) is false) {
			logger.LogDebug("Invalid invitation token: @{LogData}", new {
				Email = email,
				InvitationEmail = invitation.Email,
			});
			return TypedResults.BadRequest(ApiResponse.Create(
				"Invalid or expired invitation token",
				ResponseKeys.InvalidInvitationToken
			));
		}

		return TypedResults.Ok(new CheckInvitationTokenResult {
			Status = "success",
			Email = email
		});
	}
}

