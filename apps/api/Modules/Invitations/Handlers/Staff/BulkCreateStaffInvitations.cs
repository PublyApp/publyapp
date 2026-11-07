using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Invitations.Services;
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Invitations.Handlers.Staff;

public record BulkCreateStaffInvitationsBody {
	public JsonElement Invitations { get; init; }
	// cached parsed invitations
	private List<BulkStaffInvitationItem> _Invitations = new();
	private bool _InvitationsParsed = false;

	private List<BulkStaffInvitationItem> _ParseInvitations() {
		var invitations = new List<BulkStaffInvitationItem>();

		foreach (var item in this.Invitations.EnumerateArray()) {
			var email = item.GetProperty("email")
				.GetString();
			if (email is null) {
				throw new InvalidOperationException(
					"Email is null after validation"
				);
			}

			var roleIds = new List<Guid>();
			foreach (
				var e in item
					.GetProperty("roleIds")
					.EnumerateArray()
			) {
				var roleIdStr = e.GetString();
				if (roleIdStr is null) {
					throw new InvalidOperationException(
						"RoleId is null after "
						+ "validation"
					);
				}
				roleIds.Add(Guid.Parse(roleIdStr));
			}

			invitations.Add(new BulkStaffInvitationItem {
				Email = email,
				RoleIds = roleIds
			});
		}

		return invitations;
	}

	public List<BulkStaffInvitationItem> GetInvitations() {
		if (this._InvitationsParsed) {
			return this._Invitations;
		}

		this._Invitations = this._ParseInvitations();
		this._InvitationsParsed = true;

		return this._Invitations;
	}
}

public record BulkStaffInvitationsCreated {
	public required int Created { get; init; }
}

public class BulkCreateStaffInvitationsBodyValidator
	: AbstractValidator<BulkCreateStaffInvitationsBody> {
	public BulkCreateStaffInvitationsBodyValidator() {
		this.RuleFor(x => x.Invitations)
			.Custom((element, context) => {
				if (element.ValueKind
					is JsonValueKind.Undefined
					or JsonValueKind.Null) {
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

				// Track emails for duplicate detection
				var emailOccurrences = new Dictionary<string, List<int>>(
					StringComparer.OrdinalIgnoreCase
				);

				// Validate each item
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

					// Validate email
					if (!item.TryGetProperty("email", out var emailElement)) {
						context.AddFailure(
							$"invitations[{index}].email",
							"Email is required"
						);
					} else {
						if (emailElement.ValueKind != JsonValueKind.String) {
							context.AddFailure(
								$"invitations[{index}].email",
								"Email must be a string"
							);
						} else {
							var email = emailElement.GetString();
							if (string.IsNullOrWhiteSpace(email)) {
								context.AddFailure(
									$"invitations[{index}].email",
									"Email is required"
								);
							} else if (!BulkCreateStaffInvitationsBodyValidator._BeValidEmail(email)) {
								context.AddFailure(
									$"invitations[{index}].email",
									"Invalid email format"
								);
							} else {
								// Track email occurrences for duplicate check
								if (!emailOccurrences.TryGetValue(email, out var indices)) {
									indices = new List<int>();
									emailOccurrences[email] = indices;
								}
								indices.Add(index);
							}
						}
					}

					// Validate roleIds
					if (!item.TryGetProperty("roleIds", out var roleIdsElement)) {
						context.AddFailure(
							$"invitations[{index}].roleIds",
							"RoleIds is required"
						);
					} else {
						if (roleIdsElement.ValueKind != JsonValueKind.Array) {
							context.AddFailure(
								$"invitations[{index}].roleIds",
								"RoleIds must be an array"
							);
						} else {
							var roleIdsArray = roleIdsElement.EnumerateArray().ToList();
							if (roleIdsArray.Count == 0) {
								context.AddFailure(
									$"invitations[{index}].roleIds",
									"At least one role ID is required"
								);
							} else {
								for (var j = 0; j < roleIdsArray.Count; j++) {
									var roleIdElement = roleIdsArray[j];
									if (roleIdElement.ValueKind != JsonValueKind.String) {
										context.AddFailure(
											$"invitations[{index}].roleIds[{j}]",
											"RoleId must be a string"
										);
									} else {
										var roleIdStr = roleIdElement.GetString();
										if (!Guid.TryParse(roleIdStr, out _)) {
											context.AddFailure(
												$"invitations[{index}].roleIds[{j}]",
												"RoleId must be a valid GUID"
											);
										}
									}
								}
							}
						}
					}
				}

				// Check for duplicate emails after iterating through all items
				var duplicateEmails = emailOccurrences
					.Where(kvp => kvp.Value.Count > 1)
					.Select(kvp => kvp.Key)
					.ToList();

				if (duplicateEmails.Count > 0) {
					var emailList = string.Join(", ", duplicateEmails);
					context.AddFailure(
						"Invitations",
						$"Duplicate email(s) found: {emailList}"
					);
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

public sealed class BulkCreateStaffInvitations {
	public static async Task<Results<
		Created<BulkStaffInvitationsCreated>,
		AppValidationProblemHttpResult,
		AppBadRequestHttpResult,
		AppInternalServerErrorHttpResult,
		AppForbiddenHttpResult
	>> Handle(
		[FromBody] BulkCreateStaffInvitationsBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IRoleAssignmentGuard roleAssignmentGuard,
		[FromServices] IInvitationService invitationService,
		[FromServices] IAccountService accountService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		var account = authContext.AccountStaff;

		// should never happen because handler must be set behind StaffAuthFilter
		if (account is null) {
			return TypedProblems.InternalServerError(
				"Internal server error",
				ResponseKeys.InternalServerError
			);
		}

		// Parse JsonElement into typed list
		var invitations = body.GetInvitations();

		// Extract all unique emails and role IDs for batch validation
		var uniqueEmails = invitations.Select(i => i.Email).Distinct().ToList();
		var allRoleIds = invitations.SelectMany(i => i.RoleIds).Distinct().ToList();

		// Check for scope conflicts - staff invitations can't target users with tenant/project accounts
		var conflictingEmails = await accountService.GetEmailsWithTenantOrProjectAccountsAsync(
			uniqueEmails,
			cancellationToken
		);

		if (conflictingEmails.Count > 0) {
			// Return structured 422 with errors keyed by email for better frontend handling
			// Include email in message so UI can display it even if it only shows values
			var errors = conflictingEmails.ToDictionary(
				email => email,
				email => new[] { $"{email}: User already has tenant or project accounts" }
			);
			return TypedProblems.ValidationProblem(
				"Staff and tenant/project accounts are mutually exclusive",
				ResponseKeys.UserHasTenantOrProjectAccounts,
				errors
			);
		}

		// Batch validate all emails (2 queries total, not N queries)
		var existingUserEmails = await invitationService.GetExistingUserEmailsAsync(
			uniqueEmails,
			cancellationToken
		);

		if (existingUserEmails.Count > 0) {
			var errors = existingUserEmails.ToDictionary(
				email => email,
				email => new[] { $"{email}: User already exists" }
			);
			return TypedProblems.ValidationProblem(
				"One or more users already exist",
				ResponseKeys.UserAlreadyExists,
				errors
			);
		}

		var existingInvitationEmails = await invitationService.GetPendingInvitationEmailsAsync(
			uniqueEmails,
			InvitationScope.Staff,
			cancellationToken
		);

		if (existingInvitationEmails.Count > 0) {
			var errors = existingInvitationEmails.ToDictionary(
				email => email,
				email => new[] { $"{email}: Pending invitation already exists" }
			);
			return TypedProblems.ValidationProblem(
				"One or more pending invitations exist",
				ResponseKeys.PendingInvitationExists,
				errors
			);
		}

		// Batch validate all roles (1 query total, not N queries)
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

		var validRoleIds = await invitationService.ValidateStaffRolesAsync(
			allRoleIds,
			cancellationToken
		);

		var missingRoleIds = allRoleIds.Except(validRoleIds).ToList();

		if (missingRoleIds.Count > 0) {
			var errors = missingRoleIds.ToDictionary(
				id => id.ToString(),
				id => new[] { $"{id}: Role not found" }
			);
			return TypedProblems.ValidationProblem(
				"One or more roles not found",
				ResponseKeys.NotFound,
				errors
			);
		}

		// Call the service to create invitations
		var createArgs = new BulkCreateStaffInvitationsArgs(
			Invitations: invitations,
			InvitedByUserId: account.UserId
		);
		var invitationTokens = await invitationService.BulkCreateStaffInvitationsAsync(
			createArgs,
			cancellationToken
		);

		// Invitation creation persisted a durable email outbox row per invitation in
		// the same transaction (round-5 API F3); InvitationEmailOutboxDispatcher
		// delivers them out-of-band, so there is nothing to schedule here.

		// Audit logging
		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.InvitationCreated,
				TargetId: null, // Bulk operation has no single target
				Details: new { Count = invitationTokens.Count, Scope = "Staff" }
			),
			cancellationToken
		);

		// Return success response
		return TypedResults.Created(
			(string?)null,
			new BulkStaffInvitationsCreated {
				Created = invitationTokens.Count
			}
		);
	}
}
