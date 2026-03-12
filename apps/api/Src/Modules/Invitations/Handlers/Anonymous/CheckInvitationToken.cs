using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.Invitations.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Invitations.Handlers.Anonymous;

public class CheckInvitationTokenQuery
	: EncryptedIdTokenQuery {
}

public class CheckInvitationTokenQueryValidator
	: EncryptedIdTokenQueryValidator<
		CheckInvitationTokenQuery> {
}

public class CheckInvitationTokenResult {
	public string Status { get; set; } = "success";
	public string Email { get; set; } = string.Empty;
	public bool UserExists { get; set; }
}

public class CheckInvitationToken {
	public static async Task<
		Results<
			Ok<CheckInvitationTokenResult>,
			AppBadRequestHttpResult
		>
	> HandleCheckInvitationToken(
		[AsParameters] CheckInvitationTokenQuery query,
		[FromServices] IInvitationService invitationService,
		[FromServices] ILogger<CheckInvitationToken> logger,
		CancellationToken cancellationToken
	) {
		string id = query.Id;
		string token = query.Token;

		// Decrypt the ID to get email
		string email;
		try {
			email = CryptoUtils.DecryptString(id).ToLowerInvariant();
		} catch {
			return TypedProblems.BadRequest(
				"Invalid or expired invitation token",
				ResponseKeys.InvalidInvitationToken
			);
		}

		// Query invitation by token
		var invitation = await invitationService.GetInvitationByTokenAsync(token, cancellationToken);

		if (invitation is null) {
			return TypedProblems.BadRequest(
				"Invalid or expired invitation token",
				ResponseKeys.InvalidInvitationToken
			);
		}

		// check if invitation is for the given email
		if (string.Equals(invitation.Email, email, StringComparison.OrdinalIgnoreCase) is false) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug("Invalid invitation token: @{LogData}", new {
					Email = email,
					InvitationEmail = invitation.Email,
				});
			}
			return TypedProblems.BadRequest(
				"Invalid or expired invitation token",
				ResponseKeys.InvalidInvitationToken
			);
		}

		var userExists = await invitationService.UserExistsAsync(
			email,
			cancellationToken
		);

		return TypedResults.Ok(new CheckInvitationTokenResult {
			Status = "success",
			Email = email,
			UserExists = userExists
		});
	}
}

