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

public class CheckInvitationToken {
	public static async Task<
		Results<
			Ok<CheckInvitationTokenResult>,
			BadRequest<ApiResponse>
		>
	> HandleCheckInvitationToken(
		[AsParameters] CheckInvitationTokenQuery query,
		[FromServices] IInvitationService invitationService,
		CancellationToken cancellationToken
	) {
		string id = query.Id;
		string token = query.Token;

		// Decrypt the ID to get email
		string email;
		try {
			email = CryptoUtils.DecryptString(id);
		} catch {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Invalid or expired password reset token",
				ResponseKeys.InvalidPasswordResetToken
			));
		}

		// Query user by email and password reset token
		var invitation = await invitationService.ValidateInvitationTokenAsync(token, cancellationToken);

		if (invitation is null) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Invalid or expired invitation token",
				ResponseKeys.InvalidInvitationToken
			));
		}

		// check if invitation is for the given email
		if (invitation.Email != email) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Invalid invitation token",
				ResponseKeys.InvalidInvitationToken
			));
		}

		return TypedResults.Ok(new CheckInvitationTokenResult {
			Status = "success",
			Email = email
		});
	}
}

