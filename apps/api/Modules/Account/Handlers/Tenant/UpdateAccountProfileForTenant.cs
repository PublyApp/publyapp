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

namespace PublyApp.Api.Modules.Account.Handlers.Tenant;

public class UpdateAccountProfileBody {
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

public class UpdateAccountProfileBodyValidator
	: AbstractValidator<UpdateAccountProfileBody> {
	public UpdateAccountProfileBodyValidator() {
		RuleFor(x => x.FirstName)
			.MustBePatchFieldString("FirstName");

		RuleFor(x => x.LastName)
			.MustBePatchFieldString("LastName");

		RuleFor(x => x.AvatarUrl)
			.MustBePatchFieldAvatarUrl("AvatarUrl");
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

		return TypedResults.Ok(ToResult(profile));
	}

	private static AccountProfileResult ToResult(AccountProfileData profile) {
		return new AccountProfileResult {
			Id = profile.Id,
			Email = profile.Email,
			FirstName = profile.FirstName,
			LastName = profile.LastName,
			AvatarUrl = profile.AvatarUrl,
		};
	}
}
