using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Users.Entities;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

/// <summary>
/// Result for getting a tenant user by ID.
/// </summary>
public class TenantUserDetailsResult {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? FirstName { get; set; }
	public string? LastName { get; set; }
	public string? AvatarUrl { get; set; }
	public string Level { get; set; } = string.Empty;
	public string Status { get; set; } = string.Empty;
	public bool IsSuspended { get; set; }
	public Guid? TenantId { get; set; }
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
	public PatchField<string?> GetFirstName() =>
		FirstName.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(FirstName.GetValueAsString()),
			_ => throw new InvalidOperationException("FirstName must be a string, null, or omitted"),
		};

	public PatchField<string?> GetLastName() =>
		LastName.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(LastName.GetValueAsString()),
			_ => throw new InvalidOperationException("LastName must be a string, null, or omitted"),
		};

	public PatchField<string?> GetAvatarUrl() {
		return AvatarUrl.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(AvatarUrl.GetValueAsString()),
			_ => throw new InvalidOperationException("AvatarUrl must be a string, null, or omitted"),
		};
	}

	public string? GetLevel() => Level?.GetValueAsStringOrNull();
}

public class UpdateTenantUserAsStaffBodyValidator
	: AbstractValidator<UpdateTenantUserAsStaffBody> {
	public UpdateTenantUserAsStaffBodyValidator() {
		RuleFor(x => x.FirstName)
			.MustBePatchFieldString("FirstName");

		RuleFor(x => x.LastName)
			.MustBePatchFieldString("LastName");

		RuleFor(x => x.AvatarUrl)
			.MustBePatchFieldUrl("AvatarUrl");

		RuleFor(x => x.Level)
			.Must(e => {
				if (e is null) return true;
				var element = e.Value;
				if (element.ValueKind == JsonValueKind.Null) return true;
				if (element.ValueKind != JsonValueKind.String) return false;
				var value = element.GetString();
				return value == "Admin" || value == "User";
			})
			.WithMessage("Level must be 'Admin' or 'User'");
	}
}

public class UpdateTenantUserAsStaff {
	public static async Task<Results<
		Ok<TenantUserDetailsResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleUpdateTenantUserAsStaff(
		[FromRoute] string tenantId,
		[FromRoute] string userId,
		[FromBody] UpdateTenantUserAsStaffBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IUserService userService,
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

		// Check if there's anything to update
		if (!body.GetFirstName().IsPresent
			&& !body.GetLastName().IsPresent
			&& !body.GetAvatarUrl().IsPresent
			&& body.GetLevel() is null) {
			return TypedProblems.BadRequest(
				"No fields to update",
				ResponseKeys.BadRequest
			);
		}

		var updateDocument = new UpdateTenantUserDocument {
			FirstName = body.GetFirstName(),
			LastName = body.GetLastName(),
			AvatarUrl = body.GetAvatarUrl(),
			Level = body.GetLevel(),
		};

		var result = await userService.UpdateTenantUserAsync(
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

			var account = authContext.AccountStaff;
			if (account is null) {
				throw new InvalidOperationException(
					"Staff account not found in auth context. "
					+ "Ensure the endpoint has "
					+ ".WithPermission() middleware."
				);
			}

			await auditLogService.LogAsync(
				account.UserId,
				AuditActions.TenantUserUpdated,
				userIdGuid,
				new {
					TenantId = tenantIdGuid,
					TenantUserId = userIdGuid,
					UpdatedByUserId = account.UserId,
					UpdatedFields = new {
						FirstName = body.GetFirstName().IsPresent,
						LastName = body.GetLastName().IsPresent,
						AvatarUrl = body.GetAvatarUrl().IsPresent,
						Level = body.GetLevel() is not null,
					}
				},
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
					Level = UserAccount.GetLevelDescription(userData.AccountLevel),
					Status = UserAccount.GetStatusDescription(
						UserAccount.GetTenantStatus(
							userData.User.IsSuspended,
							userData.Account.IsSuspended
						)
					),
					IsSuspended = userData.Account.IsSuspended,
					TenantId = userData.Account.TenantId,
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
