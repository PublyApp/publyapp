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
using PublyApp.Api.Modules.Tenants.Services;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;
using PublyApp.Api.Modules.Users.Validation;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public record CreateInvitationForTenantAsStaffBody {
	// Do not mark JsonElement fields as C# required here: missing JSON properties must
	// reach FluentValidation so clients receive the repo-standard 422 validation problem.
	public JsonElement Email { get; init; }
	public JsonElement AccountLevel { get; init; }
	public JsonElement ProfileIds { get; init; }

	public List<Guid> GetProfileIds() {
		if (ProfileIds.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null) {
			return [];
		}

		var profileIds = new List<Guid>();
		foreach (var profileId in ProfileIds.EnumerateArray()) {
			profileIds.Add(profileId.GetGuid());
		}

		return profileIds;
	}
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
			.MustBeRequiredAccountLevel();

		RuleFor(x => x.ProfileIds)
			.Custom((element, context) => {
				if (element.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null) {
					return;
				}

				if (element.ValueKind != JsonValueKind.Array) {
					context.AddFailure("ProfileIds", "ProfileIds must be an array");
					return;
				}

				var profileIds = element.EnumerateArray().ToList();
				var maxCount = AppEnvironment.Instance.MAX_BULK_INVITATIONS_SIZE;

				if (profileIds.Count > maxCount) {
					context.AddFailure(
						"ProfileIds",
						$"Maximum {maxCount} ProfileIds allowed"
					);
					return;
				}

				var seenProfileIds = new HashSet<Guid>();
				for (var i = 0; i < profileIds.Count; i++) {
					var profileIdElement = profileIds[i];

					if (profileIdElement.ValueKind != JsonValueKind.String) {
						context.AddFailure(
							$"ProfileIds[{i}]",
							"ProfileId must be a valid GUID"
						);
						continue;
					}

					if (!profileIdElement.TryGetGuid(out var profileId)) {
						context.AddFailure(
							$"ProfileIds[{i}]",
							"ProfileId must be a valid GUID"
						);
						continue;
					}

					if (!seenProfileIds.Add(profileId)) {
						context.AddFailure(
							$"ProfileIds[{i}]",
							"Duplicate profileId is not allowed"
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
		AppValidationProblemHttpResult
	>> Handle(
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
		var parsedAccountLevel = UserAccount.ParseLevel(accountLevelStr);
		if (parsedAccountLevel is null) {
			throw new InvalidOperationException(
				$"AccountLevel '{accountLevelStr}' is invalid after validation"
			);
		}
		var accountLevel = parsedAccountLevel.Value;
		var profileIds = body.GetProfileIds();

		if (profileIds.Count > 0) {
			var validProfileIds = await invitationService.ValidateTenantProfilesAsync(
				tenantIdGuid,
				profileIds,
				cancellationToken
			);

			var missingProfileIds = profileIds
				.Distinct()
				.Where(profileId => !validProfileIds.Contains(profileId))
				.ToList();

			if (missingProfileIds.Count > 0) {
				var missing = missingProfileIds.ToDictionary(
					missingProfileId => missingProfileId.ToString(),
					missingProfileId => new[] { $"{missingProfileId} is not a valid tenant profile id" }
				);

				return TypedProblems.ValidationProblem(
					"One or more profileIds are invalid for this tenant",
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
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		// Create the invitation. Persists a durable email outbox row in the same
		// transaction as the invitation (round-5 API F3); InvitationEmailOutboxDispatcher
		// delivers it out-of-band, so there is nothing to schedule here.
		var createArgs = new CreateTenantInvitationArgs(
			Email: email,
			TenantId: tenantIdGuid,
			TenantName: tenant.Name,
			ProfileIds: profileIds,
			AccountLevel: accountLevel,
			InvitedByUserId: account.UserId
		);
		var (invitation, _) = await invitationService.CreateTenantInvitationAsync(
			createArgs,
			cancellationToken
		);
		var createdInvitation = invitation;

		// Audit log
		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.InvitationCreated,
				TargetId: createdInvitation.GetRequiredId(),
				Details: new {
					Email = email,
					TenantId = tenantIdGuid,
					AccountLevel = accountLevelStr,
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
