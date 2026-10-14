using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Account.Services;
using PublyApp.Api.Modules.Account.Validation;
using PublyApp.Api.Modules.Users.Validation;

namespace PublyApp.Api.Modules.Account.Handlers.Tenant;

public class UpdateAccountProfileBody {
	public JsonElement FirstName { get; init; }
	public JsonElement LastName { get; init; }
	public JsonElement AvatarUrl { get; init; }

	public PatchField<string?> GetFirstName() {
		return this.FirstName.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(
				this.FirstName.GetValueAsString()
			),
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
			JsonValueKind.String => PatchField<string?>.Set(
				this.LastName.GetValueAsString()
			),
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
			JsonValueKind.String => PatchField<string?>.Set(
				this.AvatarUrl.GetValueAsString()
			),
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
}

public class UpdateAccountProfileBodyValidator
	: AbstractValidator<UpdateAccountProfileBody> {
	public UpdateAccountProfileBodyValidator() {
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
			.MustBePatchFieldAvatarUrl(
				"AvatarUrl",
				UserValidationRules.AvatarUrlMaxLength
			);
	}
}

public sealed class UpdateAccountProfileForTenant {
	public static async Task<Results<
		Ok<AccountProfileResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppInternalServerErrorHttpResult
	>> Handle(
		[FromBody] UpdateAccountProfileBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IAccountProfileService accountProfileService,
		[FromServices] ILogger<UpdateAccountProfileForTenant> logger,
		CancellationToken cancellationToken
	) {
		if (authContext.UserId is not Guid userId) {
			throw new InvalidOperationException(
				$"{nameof(authContext.UserId)} is not a GUID"
			);
		}

		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var firstName = body.GetFirstName();
		var lastName = body.GetLastName();
		var avatarUrl = body.GetAvatarUrl();

		if (!firstName.IsPresent
			&& !lastName.IsPresent
			&& !avatarUrl.IsPresent) {
			// PATCH-like endpoint: an empty request means the client sent no work.
			return TypedProblems.BadRequest(
				"No fields to update",
				ResponseKeys.BadRequest
			);
		}

		var profile = await accountProfileService.UpdateAccountProfileAsync(
			new UpdateAccountProfileArgs(
				UserId: userId,
				TenantId: tenantId,
				FirstName: firstName,
				LastName: lastName,
				AvatarUrl: avatarUrl
			),
			cancellationToken
		);

		if (profile is null) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"Tenant account not found: {@LogData}",
					new { UserId = userId, TenantId = tenantId }
				);
			}

			return TypedProblems.NotFound(
				"Tenant account not found",
				ResponseKeys.NotFound
			);
		}

		return TypedResults.Ok(UpdateAccountProfileForTenant._ToResult(profile));
	}

	private static AccountProfileResult _ToResult(AccountProfileData profile) {
		return new AccountProfileResult {
			Id = profile.Id,
			Email = profile.Email,
			FirstName = profile.FirstName,
			LastName = profile.LastName,
			AvatarUrl = profile.AvatarUrl,
		};
	}
}
