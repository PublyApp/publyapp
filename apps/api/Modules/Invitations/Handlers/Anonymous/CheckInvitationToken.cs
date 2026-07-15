using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Invitations.Services;

namespace PublyApp.Api.Modules.Invitations.Handlers.Anonymous;

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

public sealed class CheckInvitationToken {
	public static async Task<
		Results<
			Ok<CheckInvitationTokenResult>,
			AppBadRequestHttpResult
		>
	> Handle(
		[AsParameters] CheckInvitationTokenQuery query,
		[FromServices] IInvitationQueryService invitationQueryService,
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
		var lookup = await invitationQueryService.GetInvitationTokenStatusAsync(token, cancellationToken);

		if (lookup.Status == InvitationTokenStatus.NotFound || lookup.Invitation is null) {
			return TypedProblems.BadRequest(
				"Invalid or expired invitation token",
				ResponseKeys.InvalidInvitationToken
			);
		}

		var invitation = lookup.Invitation;

		// check if invitation is for the given email
		if (!string.Equals(invitation.Email, email, StringComparison.OrdinalIgnoreCase)) {
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

		if (lookup.Status == InvitationTokenStatus.AlreadyAccepted) {
			return TypedProblems.BadRequest(
				"This invitation has already been accepted",
				ResponseKeys.InvitationTokenAlreadyAccepted
			);
		}

		if (lookup.Status == InvitationTokenStatus.Expired) {
			return TypedProblems.BadRequest(
				"This invitation has expired",
				ResponseKeys.InvitationTokenExpired
			);
		}

		if (lookup.Status == InvitationTokenStatus.Revoked) {
			return TypedProblems.BadRequest(
				"This invitation has been revoked",
				ResponseKeys.InvitationTokenRevoked
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
