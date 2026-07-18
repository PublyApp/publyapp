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
using PublyApp.Api.Modules.Tenants.Services;
using PublyApp.Api.Modules.Users.Services;
using PublyApp.Api.Modules.Users.Validation;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public record BulkCreateInvitationsForTenantAsStaffItem {
	public required string Email { get; init; }
	public required string AccountLevel { get; init; }
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

public record BulkCreateTenantInvitationsForTenantAsStaffBody {
	public JsonElement Invitations { get; init; }

	private List<BulkCreateInvitationsForTenantAsStaffItem> _invitations = [];
	private bool _invitationsParsed;

	private List<BulkCreateInvitationsForTenantAsStaffItem> ParseInvitations() {
		var invitations = new List<BulkCreateInvitationsForTenantAsStaffItem>();

		foreach (var invitationItem in Invitations.EnumerateArray()) {
			var emailElement = invitationItem.GetProperty("email");
			var accountLevelElement = invitationItem.GetProperty("accountLevel");
			var profileIdsElement = invitationItem.TryGetProperty("profileIds", out var profileIdsProperty)
				? profileIdsProperty
				: new JsonElement();

			invitations.Add(new BulkCreateInvitationsForTenantAsStaffItem {
				Email = emailElement.GetString() ?? string.Empty,
				AccountLevel = accountLevelElement.GetString() ?? string.Empty,
				ProfileIds = profileIdsElement,
			});
		}

		return invitations;
	}

	public List<BulkCreateInvitationsForTenantAsStaffItem> GetInvitations() {
		if (_invitationsParsed) {
			return _invitations;
		}

		_invitations = ParseInvitations();
		_invitationsParsed = true;
		return _invitations;
	}
}

public record BulkCreateTenantInvitationsForTenantAsStaffCreated {
	public required int SucceededCount { get; init; }
	public required int FailedCount { get; init; }
	public required List<BulkCreateTenantInvitationsFailedItem> FailedItems { get; init; }
}

public sealed class BulkCreateInvitationsForTenantAsStaffBodyValidator
	: AbstractValidator<BulkCreateTenantInvitationsForTenantAsStaffBody> {
	private readonly TenantInvitationProfileIdsValidator _profileIdsValidator = new();

	public BulkCreateInvitationsForTenantAsStaffBodyValidator() {
		RuleFor(x => x.Invitations)
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
					} else if (!BeValidEmail(emailElement.GetString() ?? string.Empty)) {
						context.AddFailure(
							$"invitations[{index}].email",
							"Invalid email format"
						);
					}

					if (!item.TryGetProperty("accountLevel", out var accountLevelElement)) {
						context.AddFailure(
							$"invitations[{index}].accountLevel",
							"AccountLevel is required"
						);
					} else if (accountLevelElement.ValueKind != JsonValueKind.String) {
						context.AddFailure(
							$"invitations[{index}].accountLevel",
							"AccountLevel must be a string"
						);
					} else if (!string.IsNullOrWhiteSpace(accountLevelElement.GetString())) {
						var parsed = PublyApp.Api.Modules.Users.Entities.UserAccount.ParseLevel(
							accountLevelElement.GetString() ?? string.Empty
						);
						if (parsed is null) {
							context.AddFailure(
								$"invitations[{index}].accountLevel",
								"AccountLevel is invalid"
							);
						}
					} else {
						context.AddFailure(
							$"invitations[{index}].accountLevel",
							"AccountLevel is required"
						);
					}

					if (!item.TryGetProperty("profileIds", out var profileIdsElement)) {
						continue;
					}

					var profileIdsValidation =
						_profileIdsValidator.Validate(profileIdsElement);
					foreach (var failure in profileIdsValidation.Errors) {
						context.AddFailure(
							$"invitations[{index}].profileIds",
							failure.ErrorMessage
						);
					}

					if (profileIdsElement.ValueKind != JsonValueKind.Array) {
						continue;
					}

					var profileIds = profileIdsElement.EnumerateArray().ToList();
					var seenProfileIds = new HashSet<Guid>();
					for (var j = 0; j < profileIds.Count; j++) {
						var profileIdElement = profileIds[j];
						if (profileIdElement.ValueKind != JsonValueKind.String
							|| !profileIdElement.TryGetGuid(out var profileId)
						) {
							continue;
						}

						if (!seenProfileIds.Add(profileId)) {
							context.AddFailure(
								$"invitations[{index}].profileIds[{j}]",
								"Duplicate profileId is not allowed"
							);
						}
					}
				}
			});
	}

	private static bool BeValidEmail(string email) {
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
		AppBadRequestHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromBody] BulkCreateTenantInvitationsForTenantAsStaffBody body,
		[FromServices] IRequestAuthContext authContext,
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

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

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

		var allProfileIds = invitations
			.SelectMany(invitation => invitation.GetProfileIds())
			.Distinct()
			.ToList();

		var existingInvitationEmails = await invitationService.GetPendingTenantInvitationEmailsAsync(
			uniqueEmails,
			tenantIdGuid,
			cancellationToken
		);
		var validProfileIds = allProfileIds.Count > 0
			? await invitationService.ValidateTenantProfilesAsync(
				tenantIdGuid,
				allProfileIds,
				cancellationToken
			)
			: [];

		var validProfileIdSet = validProfileIds.ToHashSet();
		var existingInvitationEmailSet = existingInvitationEmails.ToHashSet(StringComparer.OrdinalIgnoreCase);
		var seenEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
		var succeededInvitations = new List<(
			Guid InvitationId,
			string Email,
			string AccountLevel
		)>();

		for (var i = 0; i < invitations.Count; i++) {
			var invitation = invitations[i];
			var email = invitation.Email;
			var profileIds = invitation.GetProfileIds();
			var invalidProfileIds = profileIds
				.Distinct()
				.Where(profileId => !validProfileIdSet.Contains(profileId))
				.ToList();
			var parsedAccountLevel = PublyApp.Api.Modules.Users.Entities.UserAccount.ParseLevel(
				invitation.AccountLevel
			);

			if (!seenEmails.Add(email)) {
				failedItems.Add(new BulkCreateTenantInvitationsFailedItem(
					i,
					email,
					"Duplicate email in request",
					ResponseKeys.BadRequest.Value
				));
				continue;
			}

			if (invalidProfileIds.Count > 0) {
				failedItems.Add(new BulkCreateTenantInvitationsFailedItem(
					i,
					email,
					$"One or more profileIds are invalid for tenant {tenantIdGuid}",
					ResponseKeys.NotFound.Value
				));
				continue;
			}

			if (parsedAccountLevel is null) {
				failedItems.Add(new BulkCreateTenantInvitationsFailedItem(
					i,
					email,
					"Invalid account level",
					ResponseKeys.BadRequest.Value
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
					ProfileIds: profileIds,
					AccountLevel: parsedAccountLevel.Value,
					InvitedByUserId: account.UserId
				);

				var (createdInvitation, _) = await invitationService.CreateTenantInvitationAsync(
					createArgs,
					cancellationToken
				);

				succeededInvitationIds.Add(createdInvitation.GetRequiredId());
				succeededInvitations.Add((
					createdInvitation.GetRequiredId(),
					email,
					invitation.AccountLevel
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
								invitation.AccountLevel,
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
