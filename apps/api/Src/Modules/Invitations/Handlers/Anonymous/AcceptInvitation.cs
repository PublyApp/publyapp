using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Auth.Services;
using MainApi.Src.Modules.Auth.Utils;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Invitations.Services;
using MainApi.Src.Modules.Users.Entities;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using UserEntity = MainApi.Src.Modules.Users.Entities.User;

namespace MainApi.Src.Modules.Invitations.Handlers.Anonymous;

public record AcceptInvitationBody {
	public required JsonElement FirstName { get; init; }
	public required JsonElement LastName { get; init; }
	public required JsonElement Password { get; init; }
}

public record InvitationAccepted {
	public required Guid UserId { get; init; }
	public Guid? TenantId { get; init; }
	public required string SessionToken { get; init; }
	public required DateTime SessionExpiresAt { get; init; }
	public required double SessionExpiresInMs { get; init; }
}

public class AcceptInvitationBodyValidator : AbstractValidator<AcceptInvitationBody> {
	public AcceptInvitationBodyValidator() {
		RuleFor(x => x.FirstName)
			.Must(e => e.ValueKind == JsonValueKind.String)
			.WithMessage("FirstName must be a string")
			.Must(e => !string.IsNullOrWhiteSpace(e.GetString()))
			.WithMessage("FirstName is required");

		RuleFor(x => x.LastName)
			.Must(e => e.ValueKind == JsonValueKind.String)
			.WithMessage("LastName must be a string")
			.Must(e => !string.IsNullOrWhiteSpace(e.GetString()))
			.WithMessage("LastName is required");

		RuleFor(x => x.Password)
			.Must(e => e.ValueKind == JsonValueKind.String)
			.WithMessage("Password must be a string")
			.Must(e => !string.IsNullOrWhiteSpace(e.GetString()))
			.WithMessage("Password is required")
			.Must(e => {
				var str = e.GetString();
				return str is not null
					&& str.Length >= 8;
			})
			.WithMessage(
				"Password must be at least "
				+ "8 characters"
			);
	}
}

public static class AcceptInvitation {
	public static async Task<Results<
		Ok<InvitationAccepted>,
		AppNotFoundHttpResult,
		AppBadRequestHttpResult
	>> HandleAcceptInvitation(
		[FromRoute] string token,
		[FromBody] AcceptInvitationBody body,
		[FromServices] IInvitationService invitationService,
		[FromServices] ISessionService sessionService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IAccountService accountService,
		CancellationToken cancellationToken = default
	) {
		// Validate invitation
		var invitation = await invitationService.GetInvitationByTokenAsync(
			token,
			cancellationToken
		);

		if (invitation is null) {
			return TypedProblems.NotFound("Invitation not found", ResponseKeys.NotFound);
		}

		// Check if user already exists
		var userExists = await invitationService.UserExistsAsync(
			invitation.Email,
			cancellationToken
		);

		if (userExists) {
			// Check for scope conflicts to provide more specific error message
			// Business rule: staff and tenant/project accounts are mutually exclusive
			if (invitation.Scope == InvitationScope.Staff) {
				var hasTenantOrProjectAccounts = await accountService
					.HasTenantOrProjectAccountsByEmailAsync(invitation.Email, cancellationToken);
				if (hasTenantOrProjectAccounts) {
					return TypedProblems.BadRequest(
						"This user already has tenant or project accounts. Staff and tenant/project accounts are mutually exclusive.",
						ResponseKeys.UserHasTenantOrProjectAccounts
					);
				}
			} else if (invitation.Scope == InvitationScope.Tenant) {
				var hasStaffAccount = await accountService
					.HasStaffAccountByEmailAsync(invitation.Email, cancellationToken);
				if (hasStaffAccount) {
					return TypedProblems.BadRequest(
						"This user already has a staff account. Staff and tenant/project accounts are mutually exclusive.",
						ResponseKeys.UserHasStaffAccount
					);
				}
			}

			// User exists but no scope conflict - still can't accept (invitations are for new users)
			return TypedProblems.BadRequest(
				"User already exists",
				ResponseKeys.UserAlreadyExists
			);
		}

		// Extract values after validation
		var firstName = body.FirstName.GetValueAsString();
		var lastName = body.LastName.GetValueAsString();
		var password = body.Password.GetValueAsString();
		var passwordHash = PasswordUtils.HashPassword(password);

		// Call appropriate service based on invitation scope
		UserEntity user;
		if (invitation.Scope == InvitationScope.Staff) {
			user = await invitationService.AcceptStaffInvitationAsync(
				invitation,
				firstName,
				lastName,
				passwordHash,
				cancellationToken
			);
		} else if (invitation.Scope == InvitationScope.Tenant) {
			user = await invitationService.AcceptTenantInvitationAsync(
				invitation,
				firstName,
				lastName,
				passwordHash,
				cancellationToken
			);
		} else {
			throw new InvalidOperationException(
				$"Unsupported invitation scope: {invitation.Scope}"
			);
		}

		var session = await sessionService.CreateSessionForUser(
			user,
			cancellationToken
		);

		// Log with appropriate audit action based on scope
		var auditAction = invitation.Scope == InvitationScope.Staff
			? AuditActions.InvitationAccepted
			: AuditActions.TenantInvitationAccepted;

		var auditData = invitation.Scope == InvitationScope.Staff
			? new {
				Email = invitation.Email,
				TenantId = (Guid?)null,
				AccountLevel = (string?)null
			}
			: new {
				Email = invitation.Email,
				TenantId = invitation.TenantId,
				AccountLevel = (string?)(invitation.AccountLevel ?? AccountLevel.User).ToString()
			};

		await auditLogService.LogAsync(
			user.GetRequiredId(),
			auditAction,
			invitation.GetRequiredId(),
			auditData,
			cancellationToken
		);

		return TypedResults.Ok(new InvitationAccepted {
			UserId = user.GetRequiredId(),
			TenantId = invitation.TenantId,
			SessionToken = session.Token,
			SessionExpiresAt = session.ExpiresAt,
			SessionExpiresInMs = (session.ExpiresAt - DateTime.UtcNow).TotalMilliseconds
		});
	}
}
