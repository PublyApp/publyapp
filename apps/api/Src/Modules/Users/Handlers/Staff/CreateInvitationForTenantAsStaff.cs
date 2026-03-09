using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Invitations.Services;
using MainApi.Src.Modules.Tenants.Services;
using MainApi.Src.Modules.Users.Entities;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public record CreateInvitationForTenantAsStaffBody {
	public required JsonElement Email { get; init; }
	public required JsonElement AccountLevel { get; init; }
}

public record InvitationCreatedForTenant {
	public required Guid InvitationId { get; init; }
	public DateTime ExpiresAt { get; init; }
}

public class CreateInvitationForTenantAsStaffBodyValidator
	: AbstractValidator<CreateInvitationForTenantAsStaffBody> {
	public CreateInvitationForTenantAsStaffBodyValidator() {
		RuleFor(x => x.Email)
			.MustBeRequiredEmail();

		RuleFor(x => x.AccountLevel)
			.MustBeRequiredString("AccountLevel")
			.Must(e => {
				if (e.ValueKind != JsonValueKind.String) {
					return false;
				}
				var value = e.GetString();
				return value == "Admin" || value == "User";
			})
			.WithMessage("AccountLevel must be 'Admin' or 'User'");
	}
}

public static class CreateInvitationForTenantAsStaff {
	public static async Task<Results<
		Created<InvitationCreatedForTenant>,
		AppBadRequestHttpResult
	>> HandleCreateInvitationForTenantAsStaff(
		[FromRoute] string tenantId,
		[FromBody] CreateInvitationForTenantAsStaffBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IInvitationService invitationService,
		[FromServices] IAccountService accountService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] ITenantService tenantService,
		CancellationToken cancellationToken = default
	) {
		// Validate tenantId
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenantId",
				ResponseKeys.MalformedId
			);
		}

		// Extract values after validation
		var email = body.Email.GetValueAsString();
		var accountLevelStr = body.AccountLevel.GetValueAsString();
		var accountLevel = accountLevelStr == "Admin" ? AccountLevel.Admin : AccountLevel.User;

		// Check if tenant exists (including suspended)
		var tenant = await tenantService.GetTenantByIdIncludingSuspendedAsync(tenantIdGuid, cancellationToken);
		if (tenant is null) {
			return TypedProblems.BadRequest(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}

		// Check if user exists - mutual exclusivity (Staff vs Tenant)
		var userExists = await invitationService.UserExistsAsync(
			email,
			cancellationToken
		);
		if (userExists) {
			// Check if user has staff account (mutually exclusive)
			var hasStaffAccount = await accountService.HasStaffAccountByEmailAsync(
				email,
				cancellationToken
			);
			if (hasStaffAccount) {
				return TypedProblems.BadRequest(
					"This user already has a Staff account. Staff and Tenant accounts are mutually exclusive.",
					ResponseKeys.UserHasStaffAccount
				);
			}

			return TypedProblems.BadRequest(
				"User already exists",
				ResponseKeys.UserAlreadyExists
			);
		}

		// Check for pending invitation for this tenant
		var pendingExists = await invitationService.PendingTenantInvitationExistsAsync(
			email,
			tenantIdGuid,
			cancellationToken
		);
		if (pendingExists) {
			return TypedProblems.BadRequest(
				"Pending invitation exists for this tenant",
				ResponseKeys.PendingInvitationExists
			);
		}

		// Get the staff user ID who is inviting
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		// Determine profile IDs based on account level
		// Admin users don't need profiles (they have all rights)
		// Non-admin users: pass empty list - profile assignment happens after acceptance
		List<Guid> profileIds = accountLevel == AccountLevel.Admin
			? new List<Guid>()
			: new List<Guid>(); // Empty for now - can be enhanced later

		// Create the invitation
		var (invitation, _) = await invitationService.CreateTenantInvitationAsync(
			email,
			tenantIdGuid,
			profileIds,
			account.UserId,
			cancellationToken
		);
		var createdInvitation = invitation;

		// Store account level on the invitation
		createdInvitation.AccountLevel = accountLevel;

		// TODO: Send invitation email (requires adding SendInvitationToJoinTenantEmailAsync to IEmailService)

		// Audit log
		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.InvitationCreated,
			createdInvitation.GetRequiredId(),
			new {
				Email = email,
				TenantId = tenantIdGuid,
				AccountLevel = accountLevelStr,
				Scope = "Tenant"
			},
			cancellationToken
		);

		return TypedResults.Created(
			(string?)null,
			new InvitationCreatedForTenant {
				InvitationId = createdInvitation.GetRequiredId(),
				ExpiresAt = createdInvitation.ExpiresAt
			}
		);
	}
}
