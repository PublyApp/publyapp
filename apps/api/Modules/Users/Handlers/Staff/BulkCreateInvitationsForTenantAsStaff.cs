using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Invitations.Services;
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Tenants.Services;
using PublyApp.Api.Modules.Users.Services;
using PublyApp.Api.Modules.Users.Validation;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public record BulkCreateInvitationsForTenantAsStaffItem {
	public required string Email { get; init; }
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

public record BulkCreateTenantInvitationsForTenantAsStaffBody {
	public JsonElement Invitations { get; init; }

	private List<BulkCreateInvitationsForTenantAsStaffItem> _Invitations = [];
	private bool _InvitationsParsed;

	private List<BulkCreateInvitationsForTenantAsStaffItem> _ParseInvitations() {
		var invitations = new List<BulkCreateInvitationsForTenantAsStaffItem>();

		foreach (var invitationItem in this.Invitations.EnumerateArray()) {
			var emailElement = invitationItem.GetProperty("email");
			var roleIdsElement = invitationItem.TryGetProperty("roleIds", out var roleIdsProperty)
				? roleIdsProperty
				: new JsonElement();

			invitations.Add(new BulkCreateInvitationsForTenantAsStaffItem {
				Email = emailElement.GetString() ?? string.Empty,
				RoleIds = roleIdsElement,
			});
		}

		return invitations;
	}

	public List<BulkCreateInvitationsForTenantAsStaffItem> GetInvitations() {
		if (this._InvitationsParsed) {
			return this._Invitations;
		}

		this._Invitations = this._ParseInvitations();
		this._InvitationsParsed = true;
		return this._Invitations;
	}
}

public record BulkCreateTenantInvitationsForTenantAsStaffCreated {
	public required int SucceededCount { get; init; }
	public required int FailedCount { get; init; }
	public required List<BulkCreateTenantInvitationsFailedItem> FailedItems { get; init; }
}

public sealed class BulkCreateInvitationsForTenantAsStaffBodyValidator
	: AbstractValidator<BulkCreateTenantInvitationsForTenantAsStaffBody> {
	private readonly TenantInvitationRoleIdsValidator _RoleIdsValidator = new();

	public BulkCreateInvitationsForTenantAsStaffBodyValidator() {
		this.RuleFor(x => x.Invitations)
			.Custom((element, context) => {
				if (element.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null) {
					context.AddFailure("Invitations is required");
					return;
				}

				if (element.ValueKind != JsonValueKind.Array) {
					context.AddFailure("Invitations must be an array");
					return;
				}

				var array = element.EnumerateArray().ToList();
				var maxSize = AppEnvironment.Instance.MAX_BULK_INVITATIONS_SIZE;

				if (array.Count == 0) {
					context.AddFailure("Invitations array cannot be empty");
					return;
				}

				if (array.Count > maxSize) {
					context.AddFailure(
						$"Invitations array cannot contain more than {maxSize} items"
					);
					return;
				}

				for (var i = 0; i < array.Count; i++) {
					var item = array[i];
					var index = i;

					if (item.ValueKind != JsonValueKind.Object) {
						context.AddFailure(
							$"invitations[{index}]",
							$"Invitation at index {index} must be an object"
						);
						continue;
					}

					if (!item.TryGetProperty("email", out var emailElement)) {
						context.AddFailure(
							$"invitations[{index}].email",
							"Email is required"
						);
					} else if (emailElement.ValueKind != JsonValueKind.String) {
						context.AddFailure(
							$"invitations[{index}].email",
							"Email must be a string"
						);
					} else if (!BulkCreateInvitationsForTenantAsStaffBodyValidator._BeValidEmail(emailElement.GetString() ?? string.Empty)) {
						context.AddFailure(
							$"invitations[{index}].email",
							"Invalid email format"
						);
					}



					if (!item.TryGetProperty("roleIds", out var roleIdsElement)) {
						continue;
					}

					var roleIdsValidation =
						this._RoleIdsValidator.Validate(roleIdsElement);
					foreach (var failure in roleIdsValidation.Errors) {
						context.AddFailure(
							$"invitations[{index}].roleIds",
							failure.ErrorMessage
						);
					}

					if (roleIdsElement.ValueKind != JsonValueKind.Array) {
						continue;
					}

					var roleIds = roleIdsElement.EnumerateArray().ToList();
					var seenRoleIds = new HashSet<Guid>();
					for (var j = 0; j < roleIds.Count; j++) {
						var roleIdElement = roleIds[j];
						if (roleIdElement.ValueKind != JsonValueKind.String
							|| !roleIdElement.TryGetGuid(out var roleId)
						) {
							continue;
						}

						if (!seenRoleIds.Add(roleId)) {
							context.AddFailure(
								$"invitations[{index}].roleIds[{j}]",
								"Duplicate roleId is not allowed"
							);
						}
					}
				}
			});
	}

	private static bool _BeValidEmail(string email) {
		if (string.IsNullOrWhiteSpace(email)) {
			return false;
		}

		try {
			return System.Net.Mail.MailAddress.TryCreate(email, out _);
		} catch {
			return false;
		}
	}
}

public sealed class BulkCreateInvitationsForTenantAsStaff {
	public static async Task<Results<
		Ok<BulkCreateTenantInvitationsForTenantAsStaffCreated>,
		AppBadRequestHttpResult,
		AppForbiddenHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromBody] BulkCreateTenantInvitationsForTenantAsStaffBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IRoleAssignmentGuard roleAssignmentGuard,
		[FromServices] IInvitationService invitationService,
		[FromServices] IAccountService accountService,
		[FromServices] ITenantService tenantService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] ILogger<BulkCreateInvitationsForTenantAsStaff> logger,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenantId",
				ResponseKeys.MalformedId
			);
		}

		var account = authContext.GetRequiredStaffAccount();

		var tenant = await tenantService.GetTenantByIdIncludingSuspendedAsync(
			tenantIdGuid,
			cancellationToken
		);
		if (tenant is null) {
			return TypedProblems.BadRequest(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}

		var invitations = body.GetInvitations();
		if (invitations.Count == 0) {
			return TypedResults.Ok(new BulkCreateTenantInvitationsForTenantAsStaffCreated {
				SucceededCount = 0,
				FailedCount = 0,
				FailedItems = [],
			});
		}

		var failedItems = new List<BulkCreateTenantInvitationsFailedItem>();
		var succeededInvitationIds = new List<Guid>();

		var uniqueEmails = invitations
			.Select(invitation => invitation.Email)
			.Distinct(StringComparer.OrdinalIgnoreCase)
			.ToList();

		var allRoleIds = invitations
			.SelectMany(invitation => invitation.GetRoleIds())
			.Distinct()
			.ToList();

		var existingInvitationEmails = await invitationService.GetPendingTenantInvitationEmailsAsync(
			uniqueEmails,
			tenantIdGuid,
			cancellationToken
		);
		var actor = authContext.GetRequiredStaffAccount();
		if (!await roleAssignmentGuard.CanAssignRolesAsync(
			actor.UserId,
			allRoleIds,
			cancellationToken
		)) {
			return TypedProblems.Forbidden(
				"Only a full-access staff member can assign the full-access role",
				ResponseKeys.Forbidden
			);
		}

		var validRoleIds = allRoleIds.Count > 0
			? await invitationService.ValidateTenantRolesAsync(
				tenantIdGuid,
				allRoleIds,
				cancellationToken
			)
			: [];

		var validRoleIdSet = validRoleIds.ToHashSet();
		var existingInvitationEmailSet = existingInvitationEmails.ToHashSet(StringComparer.OrdinalIgnoreCase);
		var seenEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
		var succeededInvitations = new List<(Guid InvitationId, string Email)>();
		for (var i = 0; i < invitations.Count; i++) {
			var invitation = invitations[i];
			var email = invitation.Email;
			var roleIds = invitation.GetRoleIds();
			var invalidRoleIds = roleIds
				.Distinct()
				.Where(roleId => !validRoleIdSet.Contains(roleId))
				.ToList();
			if (!seenEmails.Add(email)) {
				failedItems.Add(new BulkCreateTenantInvitationsFailedItem(
					i,
					email,
					"Duplicate email in request",
					ResponseKeys.BadRequest.Value
				));
				continue;
			}

			if (invalidRoleIds.Count > 0) {
				failedItems.Add(new BulkCreateTenantInvitationsFailedItem(
					i,
					email,
					$"One or more roleIds are invalid for tenant {tenantIdGuid}",
					ResponseKeys.NotFound.Value
				));
				continue;
			}

			try {
				var invitationTarget =
					await accountService.ResolveTenantInvitationTargetByEmailAsync(
						email,
						tenantIdGuid,
						cancellationToken
					);

				if (invitationTarget
					is ResolveTenantInvitationTargetByEmailResult.UserHasStaffAccount
				) {
					failedItems.Add(new BulkCreateTenantInvitationsFailedItem(
						i,
						email,
						"This user already has a Staff account",
						ResponseKeys.UserHasStaffAccount.Value
					));
					continue;
				}

				if (invitationTarget
					is ResolveTenantInvitationTargetByEmailResult.UserAlreadyMemberOfTenant
				) {
					failedItems.Add(new BulkCreateTenantInvitationsFailedItem(
						i,
						email,
						"User is already member of tenant",
						ResponseKeys.UserAlreadyMemberOfTenant.Value
					));
					continue;
				}

				if (existingInvitationEmailSet.Contains(email)) {
					failedItems.Add(new BulkCreateTenantInvitationsFailedItem(
						i,
						email,
						"Pending invitation exists for this tenant",
						ResponseKeys.PendingInvitationExists.Value
					));
					continue;
				}

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
					failedItems.Add(new BulkCreateTenantInvitationsFailedItem(
						i,
						email,
						invalidAssignment.Reason,
						invalidAssignment.TranslationKey.Value
					));
					continue;
				}
				if (createResult is not CreateTenantInvitationResult.Success success) {
					throw new InvalidOperationException(
						"Tenant invitation creation returned an unsupported result"
					);
				}
				var createdInvitation = success.Invitation;

				succeededInvitationIds.Add(createdInvitation.GetRequiredId());
				succeededInvitations.Add((
					createdInvitation.GetRequiredId(),
					email
				));
			} catch (Exception ex) {
				logger.LogWarning(
					ex,
					"Failed tenant bulk invitation for {Email} at index {Index}",
					email,
					i
				);
				failedItems.Add(new BulkCreateTenantInvitationsFailedItem(
					i,
					email,
					"Unable to create invitation",
					ResponseKeys.InternalServerError.Value
				));
			}
		}

		if (succeededInvitationIds.Count > 0) {
			try {
				await auditLogService.LogManyAsync(
					succeededInvitations
						.Select(invitation => new CreateAuditLogArgs(
							UserId: account.UserId,
							Action: AuditActions.InvitationCreated,
							TargetId: invitation.InvitationId,
							Details: new {
								invitation.Email,
								TenantId = tenantIdGuid,
								RoleIds = invitations.First(x => x.Email == invitation.Email).GetRoleIds(),
								Scope = "Tenant"
							}
						))
						.ToList(),
					cancellationToken
				);
			} catch (Exception ex) {
				logger.LogWarning(
					ex,
					"Failed to write audit log entries for bulk tenant invitation creation"
				);
			}
		}

		return TypedResults.Ok(new BulkCreateTenantInvitationsForTenantAsStaffCreated {
			SucceededCount = succeededInvitationIds.Count,
			FailedCount = failedItems.Count,
			FailedItems = failedItems,
		});
	}
}
