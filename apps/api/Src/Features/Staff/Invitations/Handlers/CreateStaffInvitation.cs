using System.Text.Json;
using FluentValidation;
using MainApi.Localization;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Common.Invitation;
using MainApi.Src.Features.Staff.Audit;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Staff.Invitations.Handlers;

public record CreateStaffInvitationBody {
	public required JsonElement Email { get; init; }
	public required JsonElement ProfileId { get; init; }
}

public record InvitationCreated {
	public required Guid InvitationId { get; init; }
	public required string Token { get; init; }
	public required DateTime ExpiresAt { get; init; }
}

public class CreateStaffInvitationBodyValidator : AbstractValidator<CreateStaffInvitationBody> {
	public CreateStaffInvitationBodyValidator() {
		RuleFor(x => x.Email)
			.Must(e => e.ValueKind == JsonValueKind.String)
			.WithMessage("Email must be a string")
			.Must(e => !string.IsNullOrWhiteSpace(e.GetString()))
			.WithMessage("Email is required")
			.Must(BeValidEmail)
			.WithMessage("Invalid email format");

		RuleFor(x => x.ProfileId)
			.Must(e => e.ValueKind == JsonValueKind.String)
			.WithMessage("ProfileId must be a string")
			.Must(BeValidGuid)
			.WithMessage("ProfileId must be a valid GUID");
	}

	private bool BeValidEmail(JsonElement element) {
		if (element.ValueKind != JsonValueKind.String) return false;
		var email = element.GetString();
		if (string.IsNullOrWhiteSpace(email)) return false;
		try {
			return System.Net.Mail.MailAddress.TryCreate(email, out _);
		} catch {
			return false;
		}
	}

	private bool BeValidGuid(JsonElement element) {
		if (element.ValueKind != JsonValueKind.String) return false;
		return Guid.TryParse(element.GetString(), out _);
	}
}

public static class CreateStaffInvitation {
	public static async Task<Results<
		Ok<InvitationCreated>,
		BadRequest<ApiResponse>,
		JsonHttpResult<ApiResponse>
	>> HandleCreateStaffInvitation(
		[FromServices] IAuthContext authContext,
		[FromServices] IInvitationService invitationService,
		[FromServices] IAuditLogService auditLogService,
		[FromBody] CreateStaffInvitationBody request,
		CancellationToken cancellationToken = default
	) {
		// Authorization check
		var account = authContext.AccountStaff;
		if (account is null
			|| account.Scope != AccountScope.Staff
			|| account.Level != AccountLevel.Admin) {
			return TypedResults.Json(
				ApiResponse.Create(
					"User does not have the necessary permissions",
					ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
				),
				statusCode: StatusCodes.Status403Forbidden
			);
		}

		// Extract values after validation
		var email = request.Email.GetString()!;
		var profileId = Guid.Parse(request.ProfileId.GetString()!);

		// Validate profile via service
		var profile = await invitationService.GetStaffProfileAsync(
			profileId,
			cancellationToken
		);
		if (profile is null) {
			return TypedResults.BadRequest(
				ApiResponse.Create("Profile not found", ResponseKeys.NotFound)
			);
		}

		// Check if user exists via service
		var userExists = await invitationService.UserExistsAsync(
			email,
			cancellationToken
		);
		if (userExists) {
			return TypedResults.BadRequest(
				ApiResponse.Create(
					"User already exists",
					ResponseKeys.UserAlreadyExists
				)
			);
		}

		// Check for pending invitation via service
		var pendingExists = await invitationService.PendingInvitationExistsAsync(
			email,
			InvitationScope.Staff,
			cancellationToken
		);
		if (pendingExists) {
			return TypedResults.BadRequest(
				ApiResponse.Create(
					"Pending invitation exists",
					ResponseKeys.PendingInvitationExists
				)
			);
		}

		// Create invitation via service
		var (invitation, token) = await invitationService.CreateStaffInvitationAsync(
			email,
			profileId,
			account.UserId,
			cancellationToken
		);

		// Audit log
		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.InvitationCreated,
			invitation.GetRequiredId(),
			new { Email = email, ProfileId = profileId, Scope = "Staff" },
			cancellationToken
		);

		return TypedResults.Ok(new InvitationCreated {
			InvitationId = invitation.GetRequiredId(),
			Token = token,
			ExpiresAt = invitation.ExpiresAt
		});
	}
}
