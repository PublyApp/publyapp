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
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;
using PublyApp.Api.Modules.Users.Validation;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

/// <summary>
/// Result for getting a tenant user by ID.
/// </summary>
public class TenantUserDetailsResult {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? FirstName { get; set; }
	public string? LastName { get; set; }
	public string? AvatarUrl { get; set; }
	public AccountLevel Level { get; set; }
	public TenantUserStatus Status { get; set; }
	public Guid? TenantId { get; set; }
	public DateTime CreatedAt { get; set; }
	public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// Updates a tenant user's profile and/or account level.
/// </summary>
public class UpdateTenantUserAsStaffBody {
	// User profile fields
	public JsonElement FirstName { get; init; }
	public JsonElement LastName { get; init; }
	public JsonElement AvatarUrl { get; init; }

	// UserAccount fields
	public JsonElement? Level { get; set; }

	// Helper methods
	public PatchField<string?> GetFirstName() {
		return this.FirstName.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(this.FirstName.GetValueAsString()),
			JsonValueKind.Object
				or JsonValueKind.Array
				or JsonValueKind.Number
				or JsonValueKind.True
				or JsonValueKind.False => throw new InvalidOperationException(
					"FirstName must be a string, null, or omitted"
				),
			_ => throw new ArgumentOutOfRangeException(
				nameof(this.FirstName),
				this.FirstName.ValueKind,
				$"Unhandled JsonValueKind: {this.FirstName.ValueKind}"
			),
		};
	}

	public PatchField<string?> GetLastName() {
		return this.LastName.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(this.LastName.GetValueAsString()),
			JsonValueKind.Object
				or JsonValueKind.Array
				or JsonValueKind.Number
				or JsonValueKind.True
				or JsonValueKind.False => throw new InvalidOperationException(
					"LastName must be a string, null, or omitted"
				),
			_ => throw new ArgumentOutOfRangeException(
				nameof(this.LastName),
				this.LastName.ValueKind,
				$"Unhandled JsonValueKind: {this.LastName.ValueKind}"
			),
		};
	}

	public PatchField<string?> GetAvatarUrl() {
		return this.AvatarUrl.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(this.AvatarUrl.GetValueAsString()),
			JsonValueKind.Object
				or JsonValueKind.Array
				or JsonValueKind.Number
				or JsonValueKind.True
				or JsonValueKind.False => throw new InvalidOperationException(
					"AvatarUrl must be a string, null, or omitted"
				),
			_ => throw new ArgumentOutOfRangeException(
				nameof(this.AvatarUrl),
				this.AvatarUrl.ValueKind,
				$"Unhandled JsonValueKind: {this.AvatarUrl.ValueKind}"
			),
		};
	}

	public string? GetLevel() {
		return this.Level?.GetValueAsStringOrNull();
	}
}

public class UpdateTenantUserAsStaffBodyValidator
	: AbstractValidator<UpdateTenantUserAsStaffBody> {
	public UpdateTenantUserAsStaffBodyValidator() {
		this.RuleFor(x => x.FirstName)
			.MustBePatchFieldString(
				"FirstName",
				UserValidationRules.FirstNameMaxLength
			);

		this.RuleFor(x => x.LastName)
			.MustBePatchFieldString(
				"LastName",
				UserValidationRules.LastNameMaxLength
			);

		this.RuleFor(x => x.AvatarUrl)
			.MustBePatchFieldUrl(
				"AvatarUrl",
				UserValidationRules.AvatarUrlMaxLength
			);

		this.RuleFor(x => x.Level).Custom((element, context) => {
			if (element is null) {
				return;
			}
			var kind = element.Value.ValueKind;
			if (kind == JsonValueKind.Null) {
				return;
			}
			if (kind != JsonValueKind.String
				|| element.Value.GetString() is not ("Admin" or "User")) {
				context.AddFailure("Level must be 'Admin' or 'User'");
			}
		});
	}
}

public sealed class UpdateTenantUserAsStaff {
	public static async Task<Results<
		Ok<TenantUserDetailsResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromRoute] string userId,
		[FromBody] UpdateTenantUserAsStaffBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ITenantUserMembershipService tenantUserMembershipService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] ILogger<UpdateTenantUserAsStaff> logger,
		CancellationToken cancellationToken = default
	) {
		// Validate tenantId
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenantId",
				ResponseKeys.MalformedId
			);
		}

		// Validate userId
		if (!Guid.TryParse(userId, out var userIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid userId",
				ResponseKeys.MalformedId
			);
		}

		var firstName = body.GetFirstName();
		var lastName = body.GetLastName();
		var avatarUrl = body.GetAvatarUrl();
		var level = body.GetLevel();

		// Check if there's anything to update
		if (!firstName.IsPresent
			&& !lastName.IsPresent
			&& !avatarUrl.IsPresent
			&& level is null) {
			return TypedProblems.BadRequest(
				"No fields to update",
				ResponseKeys.BadRequest
			);
		}

		var updateDocument = new UpdateTenantUserDocument {
			FirstName = firstName,
			LastName = lastName,
			AvatarUrl = avatarUrl,
			Level = level,
		};

		var result = await tenantUserMembershipService.UpdateTenantUserAsync(
			tenantIdGuid,
			userIdGuid,
			updateDocument,
			cancellationToken
		);

		if (result is UpdateTenantUserResult.Success success) {
			if (logger.IsEnabled(LogLevel.Information)) {
				logger.LogInformation(
					"User {UserId} updated in tenant {TenantId}",
					userIdGuid,
					tenantIdGuid
				);
			}

			var account = authContext.GetRequiredStaffAccount();

			await auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: AuditActions.TenantUserUpdated,
					TargetId: userIdGuid,
					Details: new {
						TenantId = tenantIdGuid,
						TenantUserId = userIdGuid,
						UpdatedByUserId = account.UserId,
						UpdatedFields = new {
							FirstName = firstName.IsPresent,
							LastName = lastName.IsPresent,
							AvatarUrl = avatarUrl.IsPresent,
							Level = level is not null,
						}
					}
				),
				cancellationToken
			);

			var userData = success.UserData;
			return TypedResults.Ok(
				new TenantUserDetailsResult {
					Id = userData.User.GetRequiredId(),
					Email = userData.User.Email,
					FirstName = userData.User.FirstName,
					LastName = userData.User.LastName,
					AvatarUrl = userData.User.AvatarUrl,
					Level = userData.AccountLevel,
					Status = UserAccount.GetTenantStatus(
						userData.User.Status,
						userData.Account.Status
					),
					TenantId = userData.Account.TenantId,
					CreatedAt = userData.User.CreatedAt,
					UpdatedAt = userData.User.UpdatedAt,
				}
			);
		}

		if (result is UpdateTenantUserResult.NotFound) {
			return TypedProblems.NotFound(
				"User not found in tenant",
				ResponseKeys.NotFound
			);
		}

		if (result is UpdateTenantUserResult.CannotDemoteLastAdmin) {
			return TypedProblems.BadRequest(
				"Cannot demote the last admin from the tenant",
				ResponseKeys.CannotDemoteLastAdmin
			);
		}

		return TypedProblems.BadRequest(
			"Failed to update user",
			ResponseKeys.BadRequest
		);
	}
}
