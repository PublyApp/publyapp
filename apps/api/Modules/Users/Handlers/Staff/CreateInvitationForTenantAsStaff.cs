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
using PublyApp.Api.Modules.Invitations.Services;
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Tenants.Services;
using PublyApp.Api.Modules.Users.Services;
using PublyApp.Api.Modules.Users.Validation;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public record CreateInvitationForTenantAsStaffBody {
	// Do not mark JsonElement fields as C# required here: missing JSON properties must
	// reach FluentValidation so clients receive the repo-standard 422 validation problem.
	public JsonElement Email { get; init; }
	public JsonElement RoleIds { get; init; }

	public List<Guid> GetRoleIds() {
		if (this.RoleIds.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null) {
			return [];
		}

		var roleIds = new List<Guid>();
		foreach (var roleId in this.RoleIds.EnumerateArray()) {
			roleIds.Add(roleId.GetGuid());
		}

		return roleIds;
	}
}

public record InvitationCreatedForTenant {
	public required Guid InvitationId { get; init; }
	public DateTime ExpiresAt { get; init; }
}

public class CreateInvitationForTenantAsStaffBodyValidator
	: AbstractValidator<CreateInvitationForTenantAsStaffBody> {
	public CreateInvitationForTenantAsStaffBodyValidator() {
		this.RuleFor(x => x.Email)
			.MustBeRequiredEmail();

		this.RuleFor(x => x.RoleIds)
			.SetValidator(new TenantInvitationRoleIdsValidator())
			.When(x =>
				x.RoleIds.ValueKind
					is not JsonValueKind.Undefined
					and not JsonValueKind.Null
			);

		this.RuleFor(x => x.RoleIds)
			.Custom((element, context) => {
				if (element.ValueKind != JsonValueKind.Array) {
					return;
				}

				var roleIds = element.EnumerateArray().ToList();
				var seenRoleIds = new HashSet<Guid>();
				for (var i = 0; i < roleIds.Count; i++) {
					var roleIdElement = roleIds[i];

					if (roleIdElement.ValueKind != JsonValueKind.String
						|| !roleIdElement.TryGetGuid(out var roleId)
					) {
						continue;
					}

					if (!seenRoleIds.Add(roleId)) {
						context.AddFailure(
							$"RoleIds[{i}]",
							"Duplicate roleId is not allowed"
						);
					}
				}
			});
	}
}

public sealed class CreateInvitationForTenantAsStaff {
	public static async Task<Results<
		Created<InvitationCreatedForTenant>,
		AppBadRequestHttpResult,
		AppValidationProblemHttpResult,
		AppForbiddenHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromBody] CreateInvitationForTenantAsStaffBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IInvitationService invitationService,
		[FromServices] IAccountService accountService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRoleAssignmentGuard roleAssignmentGuard,
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
		var roleIds = body.GetRoleIds();

		// Privilege escalation guard (#2289): inviting someone with the tenant's full-access
		// role delivers that role on acceptance, so only a full-access actor may issue it.
		if (!await roleAssignmentGuard.CanAssignRolesAsync(
			authContext.GetRequiredStaffAccount().UserId,
			roleIds,
			cancellationToken
		)) {
			return TypedProblems.Forbidden(
				"Only a full-access staff member can assign the full-access role",
				ResponseKeys.Forbidden
			);
		}

		if (roleIds.Count > 0) {
			var validRoleIds = await invitationService.ValidateTenantRolesAsync(
				tenantIdGuid,
				roleIds,
				cancellationToken
			);

			var missingRoleIds = roleIds
				.Distinct()
				.Where(roleId => !validRoleIds.Contains(roleId))
				.ToList();

			if (missingRoleIds.Count > 0) {
				var missing = missingRoleIds.ToDictionary(
					missingRoleId => missingRoleId.ToString(),
					missingRoleId => new[] { $"{missingRoleId} is not a valid tenant role id" }
				);

				return TypedProblems.ValidationProblem(
					"One or more roleIds are invalid for this tenant",
					ResponseKeys.NotFound,
					missing
				);
			}
		}

		// Check if tenant exists (including suspended)
		var tenant = await tenantService.GetTenantByIdIncludingSuspendedAsync(tenantIdGuid, cancellationToken);
		if (tenant is null) {
			return TypedProblems.BadRequest(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}

		// Existing non-staff users can be invited to another tenant.
		// The only create-time blockers are staff-account exclusivity and
		// already being a member of the target tenant.
		var invitationTarget = await accountService.ResolveTenantInvitationTargetByEmailAsync(
			email,
			tenantIdGuid,
			cancellationToken
		);

		if (invitationTarget
			is ResolveTenantInvitationTargetByEmailResult.UserHasStaffAccount) {
			return TypedProblems.BadRequest(
				"This user already has a Staff account. Staff and Tenant accounts are mutually exclusive.",
				ResponseKeys.UserHasStaffAccount
			);
		}

		if (invitationTarget
			is ResolveTenantInvitationTargetByEmailResult.UserAlreadyMemberOfTenant) {
			return TypedProblems.BadRequest(
				"User is already member of tenant",
				ResponseKeys.UserAlreadyMemberOfTenant
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
		var account = authContext.GetRequiredStaffAccount();

		// Create the invitation. Persists a durable email outbox row in the same
		// transaction as the invitation (round-5 API F3); InvitationEmailOutboxDispatcher
		// delivers it out-of-band, so there is nothing to schedule here.
		var createArgs = new CreateTenantInvitationArgs(
			Email: email,
			TenantId: tenantIdGuid,
			TenantName: tenant.Name,
			RoleIds: roleIds,
			InvitedByUserId: account.UserId
		);
		var createResult = await invitationService.CreateTenantInvitationAsync(
			createArgs,
			cancellationToken
		);
		if (createResult
			is CreateTenantInvitationResult.InvalidRoleAssignment invalidAssignment
		) {
			return TypedProblems.ValidationProblem(
				invalidAssignment.Reason,
				invalidAssignment.TranslationKey,
				new Dictionary<string, string[]> {
					["roleIds"] = [invalidAssignment.Reason],
				}
			);
		}
		if (createResult is not CreateTenantInvitationResult.Success success) {
			throw new InvalidOperationException(
				"Tenant invitation creation returned an unsupported result"
			);
		}
		var createdInvitation = success.Invitation;

		// Audit log
		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.InvitationCreated,
				TargetId: createdInvitation.GetRequiredId(),
				Details: new {
					Email = email,
					TenantId = tenantIdGuid,
					RoleIds = roleIds,
					Scope = "Tenant"
				}
			),
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
