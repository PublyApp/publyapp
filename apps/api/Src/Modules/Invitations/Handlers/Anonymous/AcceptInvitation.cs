using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Validation;
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
	public JsonElement FirstName { get; init; }
	public JsonElement LastName { get; init; }
	public JsonElement Password { get; init; }
	public JsonElement? UseExistingAccount { get; init; }
}

public record InvitationAccepted {
	public required Guid UserId { get; init; }
	public Guid? TenantId { get; init; }
	public required string SessionToken { get; init; }
	public required DateTime SessionExpiresAt { get; init; }
	public required double SessionExpiresInMs { get; init; }
}

public class AcceptInvitationBodyValidator
	: AbstractValidator<AcceptInvitationBody> {
	public AcceptInvitationBodyValidator() {
		When(
			x => x.UseExistingAccount.GetValueAsBoolean() is false,
			() => {
				RuleFor(x => x.FirstName)
					.MustBeRequiredString("FirstName");

				RuleFor(x => x.LastName)
					.MustBeRequiredString("LastName");

				RuleFor(x => x.Password)
					.MustBeRequiredPassword();
			}
		);
	}
}

public class AcceptInvitation {
	public static async Task<Results<
		Ok<InvitationAccepted>,
		AppNotFoundHttpResult,
		AppBadRequestHttpResult
	>> HandleAcceptInvitation(
		[FromRoute] string token,
		[FromBody] AcceptInvitationBody body,
		HttpContext httpContext,
		[FromServices] IInvitationService invitationService,
		[FromServices] ISessionService sessionService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IAccountService accountService,
		CancellationToken cancellationToken = default
	) {
		var useExistingAccount = body.UseExistingAccount.GetValueAsBoolean();

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
			if (useExistingAccount) {
				if (invitation.Scope != InvitationScope.Tenant) {
					return TypedProblems.BadRequest(
						"Only tenant invitations can be accepted with an existing account",
						ResponseKeys.BadRequest
					);
				}

				var sessionToken = httpContext
					.Request
					.Headers[AppEnvironment.Instance.SESSION_TOKEN_HEADER_KEY]
					.FirstOrDefault();

				if (string.IsNullOrWhiteSpace(sessionToken)) {
					return TypedProblems.BadRequest(
						"Session token is required to accept an invitation with an existing account",
						ResponseKeys.BadRequest
					);
				}

				var sessionData = await sessionService.GetSessionByToken(
					sessionToken,
					cancellationToken
				);

				if (sessionData is null) {
					return TypedProblems.BadRequest(
						"Session token is invalid or expired",
						ResponseKeys.BadRequest
					);
				}

				if (
					!string.Equals(
						sessionData.User.Email,
						invitation.Email,
						StringComparison.OrdinalIgnoreCase
					)
				) {
					return TypedProblems.BadRequest(
						"Invitation email does not match authenticated user",
						ResponseKeys.BadRequest
					);
				}

				var hasStaffAccount = await accountService.HasStaffAccountAsync(
					sessionData.User.GetRequiredId(),
					cancellationToken
				);
				if (hasStaffAccount) {
					return TypedProblems.BadRequest(
						"This user already has a staff account. Staff and tenant/project accounts are mutually exclusive.",
						ResponseKeys.UserHasStaffAccount
					);
				}

				if (invitation.TenantId is Guid tenantId) {
					var hasTenantAccount = await accountService.HasTenantAccountAsync(
						sessionData.User.GetRequiredId(),
						tenantId,
						cancellationToken
					);
					if (hasTenantAccount) {
						return TypedProblems.BadRequest(
							"User is already member of tenant",
							ResponseKeys.UserAlreadyMemberOfTenant
						);
					}
				}

				UserEntity existingUser;
				try {
					existingUser =
						await invitationService.AcceptTenantInvitationForExistingUserAsync(
							invitation,
							sessionData.User.GetRequiredId(),
							cancellationToken
						);
				} catch (InvalidOperationException ex) {
					return TypedProblems.BadRequest(ex.Message, ResponseKeys.BadRequest);
				}

				await auditLogService.LogAsync(
					new CreateAuditLogArgs(
						UserId: existingUser.GetRequiredId(),
						Action: AuditActions.TenantInvitationAccepted,
						TargetId: invitation.GetRequiredId(),
						Details: new {
							Email = invitation.Email,
							TenantId = invitation.TenantId,
							AccountLevel = (string?)(invitation.AccountLevel ?? AccountLevel.User).ToString(),
							AcceptedWithExistingAccount = true
						}
					),
					cancellationToken
				);

				return TypedResults.Ok(new InvitationAccepted {
					UserId = existingUser.GetRequiredId(),
					TenantId = invitation.TenantId,
					SessionToken = sessionData.Session.Token,
					SessionExpiresAt = sessionData.Session.ExpiresAt,
					SessionExpiresInMs =
						(sessionData.Session.ExpiresAt - DateTime.UtcNow).TotalMilliseconds
				});
			}

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
			var acceptArgs = new AcceptStaffInvitationArgs(
				Invitation: invitation,
				FirstName: firstName,
				LastName: lastName,
				PasswordHash: passwordHash
			);
			user = await invitationService.AcceptStaffInvitationAsync(
				acceptArgs,
				cancellationToken
			);
		} else if (invitation.Scope == InvitationScope.Tenant) {
			var acceptArgs = new AcceptTenantInvitationArgs(
				Invitation: invitation,
				FirstName: firstName,
				LastName: lastName,
				PasswordHash: passwordHash
			);
			user = await invitationService.AcceptTenantInvitationAsync(
				acceptArgs,
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
			new CreateAuditLogArgs(
				UserId: user.GetRequiredId(),
				Action: auditAction,
				TargetId: invitation.GetRequiredId(),
				Details: auditData
			),
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
