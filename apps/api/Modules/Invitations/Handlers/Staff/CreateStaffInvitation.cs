using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Invitations.Services;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Invitations.Handlers.Staff;

public record CreateStaffInvitationBody {
	public required JsonElement Email { get; init; }
	public required JsonElement ProfileId { get; init; }
}

public record InvitationCreated {
	public required Guid InvitationId { get; init; }
	public required string Token { get; init; }
	public required DateTime ExpiresAt { get; init; }
}

public class CreateStaffInvitationBodyValidator
	: AbstractValidator<CreateStaffInvitationBody> {
	public CreateStaffInvitationBodyValidator() {
		RuleFor(x => x.Email)
			.MustBeRequiredEmail();

		RuleFor(x => x.ProfileId).Custom((element, context) => {
			if (element.ValueKind
				is JsonValueKind.Undefined
				or JsonValueKind.Null) {
				context.AddFailure("ProfileId is required");
				return;
			}
			if (element.ValueKind != JsonValueKind.String) {
				context.AddFailure("ProfileId must be a string");
				return;
			}
			var str = element.GetString();
			if (string.IsNullOrWhiteSpace(str)) {
				context.AddFailure("ProfileId must not be empty");
				return;
			}
			if (!Guid.TryParse(str, out _)) {
				context.AddFailure("ProfileId must be a valid GUID");
			}
		});
	}
}

public sealed class CreateStaffInvitation {
	public static async Task<Results<
		Created<InvitationCreated>,
		AppBadRequestHttpResult,
		AppForbiddenHttpResult
	>> Handle(
		[FromBody] CreateStaffInvitationBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IInvitationService invitationService,
		[FromServices] IAccountService accountService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		// IMPOSSIBLE STATE: Staff endpoint without staff account
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		// Extract values after validation
		var email = body.Email.GetValueAsString();
		var profileId = Guid.Parse(body.ProfileId.GetValueAsString());

		// Validate profile via service
		var profile = await invitationService.GetStaffProfileAsync(
			profileId,
			cancellationToken
		);
		if (profile is null) {
			return TypedProblems.BadRequest("Profile not found", ResponseKeys.NotFound);
		}

		// Check if user exists first - this determines whether we need to check for account conflicts
		var userExists = await invitationService.UserExistsAsync(
			email,
			cancellationToken
		);
		if (userExists) {
			// User exists - check for scope conflicts (more specific error)
			// Only query accounts if user exists (saves a query for new-email invites)
			var hasTenantOrProjectAccounts = await accountService.HasTenantOrProjectAccountsByEmailAsync(
				email,
				cancellationToken
			);
			if (hasTenantOrProjectAccounts) {
				return TypedProblems.BadRequest(
					"This user already has tenant or project accounts. Staff and tenant/project accounts are mutually exclusive.",
					ResponseKeys.UserHasTenantOrProjectAccounts
				);
			}

			// User exists but no conflicts - still can't invite existing users
			return TypedProblems.BadRequest(
				"User already exists",
				ResponseKeys.UserAlreadyExists
			);
		}

		// Check for pending invitation via service
		var pendingExists = await invitationService.PendingInvitationExistsAsync(
			email,
			InvitationScope.Staff,
			cancellationToken
		);
		if (pendingExists) {
			return TypedProblems.BadRequest(
				"Pending invitation exists",
				ResponseKeys.PendingInvitationExists
			);
		}

		// Create invitation via service (wrap single profileId in list for new API)
		var createArgs = new CreateStaffInvitationArgs(
			Email: email,
			ProfileIds: [profileId],
			InvitedByUserId: account.UserId
		);
		var (invitation, token) = await invitationService.CreateStaffInvitationAsync(
			createArgs,
			cancellationToken
		);

		// Invitation creation persisted a durable email outbox row in the same
		// transaction (round-5 API F3); InvitationEmailOutboxDispatcher delivers it
		// out-of-band, so there is nothing to schedule here.

		// Audit log
		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.InvitationCreated,
				TargetId: invitation.GetRequiredId(),
				Details: new { Email = email, ProfileId = profileId, Scope = "Staff" }
			),
			cancellationToken
		);

		return TypedResults.Created(
			(string?)null,
			new InvitationCreated {
				InvitationId = invitation
					.GetRequiredId(),
				Token = token,
				ExpiresAt = invitation.ExpiresAt
			}
		);
	}
}
