using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Profiles.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

public record UpdateTenantProfileAsStaffBody {
	public JsonElement Name { get; init; }
	public JsonElement Description { get; init; }

	public PatchField<string?> GetName() {
		return Name.ValueKind switch {
			JsonValueKind.Undefined =>
				PatchField<string?>.Absent(),
			JsonValueKind.String =>
				PatchField<string?>.Set(Name.GetValueAsString()),
			JsonValueKind.Null =>
				throw new InvalidOperationException(
					"Name cannot be null. Omit the field to keep the current value."
				),
			_ => throw new InvalidOperationException(
				"Name must be a string or omitted"
			),
		};
	}

	public PatchField<string?> GetDescription() {
		return Description.ValueKind switch {
			JsonValueKind.Undefined =>
				PatchField<string?>.Absent(),
			JsonValueKind.String =>
				PatchField<string?>.Set(
					Description.GetValueAsString()
				),
			JsonValueKind.Null =>
				PatchField<string?>.Set(null),
			_ => throw new InvalidOperationException(
				"Description must be a string, null, or omitted"
			),
		};
	}
}

public class UpdateTenantProfileAsStaffBodyValidator
	: AbstractValidator<UpdateTenantProfileAsStaffBody> {
	public UpdateTenantProfileAsStaffBodyValidator() {
		RuleFor(x => x.Name)
			.MustBePatchFieldString("Name")
			.Must(e => e.ValueKind != JsonValueKind.Null)
			.WithMessage("Name cannot be null")
			.DependentRules(() => {
				RuleFor(x => x.Name)
					.Must(e => e.ValueKind == JsonValueKind.Undefined
						|| !string.IsNullOrWhiteSpace(e.GetString()))
					.WithMessage("Name cannot be empty")
					.Must(e => e.ValueKind == JsonValueKind.Undefined
						|| (e.GetString()?.Trim().Length ?? 0) >= 2)
					.WithMessage("Name must be at least 2 characters")
					.Must(e => e.ValueKind == JsonValueKind.Undefined
						|| (e.GetString()?.Trim().Length ?? 0) <= 100)
					.WithMessage("Name must be at most 100 characters");
			});

		RuleFor(x => x.Description)
			.MustBePatchFieldNullableString("Description")
			.DependentRules(() => {
				RuleFor(x => x.Description)
					.Must(e => e.ValueKind != JsonValueKind.String
						|| (e.GetString()?.Trim().Length ?? 0) <= 500)
					.WithMessage("Description must be at most 500 characters");
			});
	}
}

public class UpdateTenantProfileAsStaff {
	public static async Task<Results<
		Ok<GetTenantProfileByIdResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleUpdateTenantProfileAsStaff(
		[FromRoute] string tenantId,
		[FromRoute] string profileId,
		[FromBody] UpdateTenantProfileAsStaffBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IProfileAsStaffService profileAsStaffService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenant ID",
				ResponseKeys.MalformedId
			);
		}

		if (!Guid.TryParse(profileId, out var profileIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid profileId",
				ResponseKeys.MalformedId
			);
		}

		var name = body.GetName();
		var description = body.GetDescription();

		if (!name.IsPresent && !description.IsPresent) {
			return TypedProblems.BadRequest(
				"No fields to update",
				ResponseKeys.BadRequest
			);
		}

		var result = await profileAsStaffService.UpdateTenantProfileAsync(
			new UpdateTenantProfileArgs(
				TenantId: tenantIdGuid,
				ProfileId: profileIdGuid,
				Name: name,
				Description: description
			),
			cancellationToken
		);

		if (result is UpdateTenantProfileResult.ProfileNotFound) {
			return TypedProblems.NotFound(
				"Profile not found",
				ResponseKeys.NotFound
			);
		}

		if (result is UpdateTenantProfileResult.ProfileNameExists nameExists) {
			return TypedProblems.BadRequest(
				$"Profile name already exists: {nameExists.Name}",
				ResponseKeys.ProfileNameAlreadyExists
			);
		}

		if (result is UpdateTenantProfileResult.Success success) {
			var changedFields = new Dictionary<string, object?>();
			if (name.IsPresent
				&& !string.Equals(
					success.PreviousProfile.ProfileName,
					success.Profile.Name,
					StringComparison.Ordinal
				)) {
				changedFields["name"] = new {
					Old = success.PreviousProfile.ProfileName,
					New = success.Profile.Name
				};
			}

			if (description.IsPresent
				&& !string.Equals(
					success.PreviousProfile.Description,
					success.Profile.Description,
					StringComparison.Ordinal
				)) {
				changedFields["description"] = new {
					Old = success.PreviousProfile.Description,
					New = success.Profile.Description
				};
			}

			if (changedFields.Count > 0) {
				var account = authContext.AccountStaff;
				if (account is null) {
					throw new InvalidOperationException(
						"Staff account not found in auth context. Ensure the endpoint has .WithPermission() middleware."
					);
				}

				await auditLogService.LogAsync(
					account.UserId,
					AuditActions.TenantProfileUpdated,
					profileIdGuid,
					new {
						TenantId = tenantIdGuid,
						ProfileId = profileIdGuid,
						ProfileName = success.Profile.Name,
						IsDefault = success.Profile.IsDefault,
						ChangedFields = changedFields
					},
					cancellationToken
				);
			}

			return TypedResults.Ok(new GetTenantProfileByIdResponse {
				Profile = success.Profile
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
