using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Lib;
using MainApi.Lib.Extensions;
using MainApi.Lib.ProblemResults;
using MainApi.Lib.Validation;
using MainApi.Modules.AuditLogs.Entities;
using MainApi.Modules.AuditLogs.Services;
using MainApi.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Modules.Users.Handlers.Staff;

public class UpdateTenantUserIdentityForStaffBody {
	public JsonElement FirstName { get; init; }
	public JsonElement LastName { get; init; }
	public JsonElement AvatarUrl { get; init; }

	public PatchField<string?> GetFirstName() =>
		FirstName.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(
				FirstName.GetValueAsString()
			),
			_ => throw new InvalidOperationException(
				"FirstName must be a string, null, or omitted"
			),
		};

	public PatchField<string?> GetLastName() =>
		LastName.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(
				LastName.GetValueAsString()
			),
			_ => throw new InvalidOperationException(
				"LastName must be a string, null, or omitted"
			),
		};

	public PatchField<string?> GetAvatarUrl() =>
		AvatarUrl.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(
				AvatarUrl.GetValueAsString()
			),
			_ => throw new InvalidOperationException(
				"AvatarUrl must be a string, null, or omitted"
			),
		};
}

public class UpdateTenantUserIdentityForStaffBodyValidator
	: AbstractValidator<UpdateTenantUserIdentityForStaffBody> {
	public UpdateTenantUserIdentityForStaffBodyValidator() {
		RuleFor(x => x.FirstName)
			.MustBePatchFieldString("FirstName");

		RuleFor(x => x.LastName)
			.MustBePatchFieldString("LastName");

		RuleFor(x => x.AvatarUrl)
			.MustBePatchFieldUrl("AvatarUrl");
	}
}

public class UpdateTenantUserIdentityForStaff {
	public static async Task<Results<
		Ok<TenantUserDetailsForStaffResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleUpdateTenantUserIdentityForStaff(
		[FromRoute] string userId,
		[FromBody] UpdateTenantUserIdentityForStaffBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IUserService userService,
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

		var result = await userService.UpdateTenantUserIdentityForStaffAsync(
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
