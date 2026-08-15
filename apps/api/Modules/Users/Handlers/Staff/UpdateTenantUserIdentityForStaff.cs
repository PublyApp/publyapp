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
using PublyApp.Api.Modules.Users.Services;
using PublyApp.Api.Modules.Users.Validation;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public class UpdateTenantUserIdentityForStaffBody {
	public JsonElement FirstName { get; init; }
	public JsonElement LastName { get; init; }
	public JsonElement AvatarUrl { get; init; }

	public PatchField<string?> GetFirstName() {
		return FirstName.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(
				FirstName.GetValueAsString()
			),
			JsonValueKind.Object
				or JsonValueKind.Array
				or JsonValueKind.Number
				or JsonValueKind.True
				or JsonValueKind.False => throw new InvalidOperationException(
				"FirstName must be a string, null, or omitted"
			),
			_ => throw new ArgumentOutOfRangeException(
				nameof(FirstName),
				FirstName.ValueKind,
				$"Unhandled JsonValueKind: {FirstName.ValueKind}"
			),
		};
	}

	public PatchField<string?> GetLastName() {
		return LastName.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(
				LastName.GetValueAsString()
			),
			JsonValueKind.Object
				or JsonValueKind.Array
				or JsonValueKind.Number
				or JsonValueKind.True
				or JsonValueKind.False => throw new InvalidOperationException(
				"LastName must be a string, null, or omitted"
			),
			_ => throw new ArgumentOutOfRangeException(
				nameof(LastName),
				LastName.ValueKind,
				$"Unhandled JsonValueKind: {LastName.ValueKind}"
			),
		};
	}

	public PatchField<string?> GetAvatarUrl() {
		return AvatarUrl.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(
				AvatarUrl.GetValueAsString()
			),
			JsonValueKind.Object
				or JsonValueKind.Array
				or JsonValueKind.Number
				or JsonValueKind.True
				or JsonValueKind.False => throw new InvalidOperationException(
				"AvatarUrl must be a string, null, or omitted"
			),
			_ => throw new ArgumentOutOfRangeException(
				nameof(AvatarUrl),
				AvatarUrl.ValueKind,
				$"Unhandled JsonValueKind: {AvatarUrl.ValueKind}"
			),
		};
	}
}

public class UpdateTenantUserIdentityForStaffBodyValidator
	: AbstractValidator<UpdateTenantUserIdentityForStaffBody> {
	public UpdateTenantUserIdentityForStaffBodyValidator() {
		RuleFor(x => x.FirstName)
			.MustBePatchFieldClearableStringWithLength(
				"FirstName",
				1,
				UserValidationRules.FirstNameMaxLength,
				trim: true
			);

		RuleFor(x => x.LastName)
			.MustBePatchFieldClearableStringWithLength(
				"LastName",
				1,
				UserValidationRules.LastNameMaxLength,
				trim: true
			);

		RuleFor(x => x.AvatarUrl)
			.MustBePatchFieldUrlWithLength(
				"AvatarUrl",
				UserValidationRules.AvatarUrlMaxLength
			);
	}
}

public sealed class UpdateTenantUserIdentityForStaff {
	public static async Task<Results<
		Ok<TenantUserDetailsForStaffResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string userId,
		[FromBody] UpdateTenantUserIdentityForStaffBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ITenantUserIdentityService tenantUserIdentityService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] ILogger<UpdateTenantUserIdentityForStaff> logger,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(userId, out var userIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid userId",
				ResponseKeys.MalformedId
			);
		}

		var firstName = body.GetFirstName();
		var lastName = body.GetLastName();
		var avatarUrl = body.GetAvatarUrl();

		if (!firstName.IsPresent
			&& !lastName.IsPresent
			&& !avatarUrl.IsPresent) {
			return TypedProblems.BadRequest(
				"No fields to update",
				ResponseKeys.BadRequest
			);
		}

		var updateDocument = new UpdateTenantUserIdentityDocument {
			FirstName = firstName,
			LastName = lastName,
			AvatarUrl = avatarUrl,
		};

		var result = await tenantUserIdentityService.UpdateTenantUserIdentityForStaffAsync(
			userIdGuid,
			updateDocument,
			cancellationToken
		);

		if (result is UpdateTenantUserIdentityResult.NotFound) {
			return TypedProblems.NotFound(
				"Tenant user not found",
				ResponseKeys.NotFound
			);
		}

		if (result is not UpdateTenantUserIdentityResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled UpdateTenantUserIdentityResult type: "
				+ $"{result.GetType().Name}"
			);
		}

		if (logger.IsEnabled(LogLevel.Information)) {
			logger.LogInformation(
				"Tenant user identity {UserId} updated",
				userIdGuid
			);
		}

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.TenantUserUpdated,
				TargetId: userIdGuid,
				Details: new {
					TenantUserId = userIdGuid,
					UpdatedByUserId = account.UserId,
					UpdatedFields = new {
						FirstName = firstName.IsPresent,
						LastName = lastName.IsPresent,
						AvatarUrl = avatarUrl.IsPresent,
					}
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(
			TenantUserDetailsForStaffMapper.Map(success.UserData)
		);
	}
}
