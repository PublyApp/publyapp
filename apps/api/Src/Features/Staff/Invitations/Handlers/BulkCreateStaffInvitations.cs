using System.Text.Json;
using FluentValidation;
using MainApi.Localization;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Common.Invitation;
using MainApi.Src.Features.Staff.Audit;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Features.Staff.Invitations.Handlers;

public record BulkCreateStaffInvitationsBody {
	public required JsonElement Invitations { get; init; }
}

public record BulkStaffInvitationsCreated {
	public required int Created { get; init; }
}

public class BulkCreateStaffInvitationsBodyValidator
	: AbstractValidator<BulkCreateStaffInvitationsBody> {
	public BulkCreateStaffInvitationsBodyValidator(IOptions<AppSettings> appSettings) {
		RuleFor(x => x.Invitations)
			.NotNull()
			.WithMessage("Invitations is required")
			.Custom((element, context) => {
				if (element.ValueKind != JsonValueKind.Array) {
					context.AddFailure("Invitations must be an array");
					return;
				}

				var array = element.EnumerateArray().ToList();
				var maxSize = appSettings.Value.MAX_BULK_INVITATIONS_SIZE;

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
							} else if (!BeValidEmail(email)) {
								context.AddFailure(
									$"invitations[{index}].email",
									"Invalid email format"
								);
							}
						}
					}

					// Validate profileIds
					if (!item.TryGetProperty("profileIds", out var profileIdsElement)) {
						context.AddFailure(
							$"invitations[{index}].profileIds",
							"ProfileIds is required"
						);
					} else {
						if (profileIdsElement.ValueKind != JsonValueKind.Array) {
							context.AddFailure(
								$"invitations[{index}].profileIds",
								"ProfileIds must be an array"
							);
						} else {
							var profileIdsArray = profileIdsElement.EnumerateArray().ToList();
							if (profileIdsArray.Count == 0) {
								context.AddFailure(
									$"invitations[{index}].profileIds",
									"At least one profile ID is required"
								);
							} else {
								for (var j = 0; j < profileIdsArray.Count; j++) {
									var profileIdElement = profileIdsArray[j];
									if (profileIdElement.ValueKind != JsonValueKind.String) {
										context.AddFailure(
											$"invitations[{index}].profileIds[{j}]",
											"ProfileId must be a string"
										);
									} else {
										var profileIdStr = profileIdElement.GetString();
										if (!Guid.TryParse(profileIdStr, out _)) {
											context.AddFailure(
												$"invitations[{index}].profileIds[{j}]",
												"ProfileId must be a valid GUID"
											);
										}
									}
								}
							}
						}
					}
				}
			});
	}

	private bool BeValidEmail(string email) {
		if (string.IsNullOrWhiteSpace(email)) return false;
		try {
			return System.Net.Mail.MailAddress.TryCreate(email, out _);
		} catch {
			return false;
		}
	}
}

public static class BulkCreateStaffInvitations {
	public static async Task<Results<
		Ok<BulkStaffInvitationsCreated>,
		BadRequest<ApiResponse>,
		JsonHttpResult<ApiResponse>
	>> HandleBulkCreateStaffInvitations(
		[FromServices] IAuthContext authContext,
		[FromServices] IInvitationService invitationService,
		[FromServices] IAuditLogService auditLogService,
		[FromBody] BulkCreateStaffInvitationsBody request,
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

		// Parse JsonElement into typed list
		var invitations = new List<BulkStaffInvitationItem>();
		foreach (var item in request.Invitations.EnumerateArray()) {
			var email = item.GetProperty("email").GetString()!;
			var profileIds = item.GetProperty("profileIds")
				.EnumerateArray()
				.Select(e => Guid.Parse(e.GetString()!))
				.ToList();

			invitations.Add(new BulkStaffInvitationItem {
				Email = email,
				ProfileIds = profileIds
			});
		}

		// Check for duplicate emails within the batch
		var duplicates = invitations
			.GroupBy(x => x.Email, StringComparer.OrdinalIgnoreCase)
			.Where(g => g.Count() > 1)
			.Select(g => g.Key)
			.ToList();

		if (duplicates.Any()) {
			return TypedResults.BadRequest(
				ApiResponse.Create(
					$"Duplicate email(s) found in batch: {string.Join(", ", duplicates)}",
					ResponseKeys.RequestBodyValidationFailed
				)
			);
		}

		// Extract all unique emails and profile IDs for batch validation
		var uniqueEmails = invitations.Select(i => i.Email).Distinct().ToList();
		var allProfileIds = invitations.SelectMany(i => i.ProfileIds).Distinct().ToList();

		// Batch validate all emails (2 queries total, not N queries)
		var existingUserEmails = await invitationService.GetExistingUserEmailsAsync(
			uniqueEmails,
			cancellationToken
		);

		if (existingUserEmails.Any()) {
			return TypedResults.BadRequest(
				ApiResponse.Create(
					$"User(s) already exist: {string.Join(", ", existingUserEmails)}",
					ResponseKeys.UserAlreadyExists
				)
			);
		}

		var existingInvitationEmails = await invitationService.GetPendingInvitationEmailsAsync(
			uniqueEmails,
			InvitationScope.Staff,
			cancellationToken
		);

		if (existingInvitationEmails.Any()) {
			return TypedResults.BadRequest(
				ApiResponse.Create(
					$"Pending invitation(s) exist: {string.Join(", ", existingInvitationEmails)}",
					ResponseKeys.PendingInvitationExists
				)
			);
		}

		// Batch validate all profiles (1 query total, not N queries)
		var validProfileIds = await invitationService.ValidateStaffProfilesAsync(
			allProfileIds,
			cancellationToken
		);

		var missingProfileIds = allProfileIds.Except(validProfileIds).ToList();

		if (missingProfileIds.Any()) {
			return TypedResults.BadRequest(
				ApiResponse.Create(
					$"Profile(s) not found: {string.Join(", ", missingProfileIds)}",
					ResponseKeys.NotFound
				)
			);
		}

		// Call the service to create invitations
		var created = await invitationService.BulkCreateStaffInvitationsAsync(
			invitations,
			account.UserId,
			cancellationToken
		);

		// Audit logging
		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.InvitationCreated,
			null, // Bulk operation has no single target
			new { Count = created, Scope = "Staff" },
			cancellationToken
		);

		// Return success response
		return TypedResults.Ok(new BulkStaffInvitationsCreated {
			Created = created
		});
	}
}


