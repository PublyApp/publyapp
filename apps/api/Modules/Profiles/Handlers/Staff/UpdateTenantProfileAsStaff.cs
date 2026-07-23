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
using PublyApp.Api.Modules.Profiles.Services;
using PublyApp.Api.Modules.Profiles.Validation;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public record UpdateTenantProfileAsStaffBody {
	public JsonElement Name { get; init; }
	public JsonElement Description { get; init; }
	public JsonElement Icon { get; init; }
	public JsonElement Tone { get; init; }

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
			JsonValueKind.Object
				or JsonValueKind.Array
				or JsonValueKind.Number
				or JsonValueKind.True
				or JsonValueKind.False => throw new InvalidOperationException(
				"Name must be a string or omitted"
			),
			_ => throw new ArgumentOutOfRangeException(
				nameof(Name),
				Name.ValueKind,
				$"Unhandled JsonValueKind: {Name.ValueKind}"
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
			JsonValueKind.Object
				or JsonValueKind.Array
				or JsonValueKind.Number
				or JsonValueKind.True
				or JsonValueKind.False => throw new InvalidOperationException(
				"Description must be a string, null, or omitted"
			),
			_ => throw new ArgumentOutOfRangeException(
				nameof(Description),
				Description.ValueKind,
				$"Unhandled JsonValueKind: {Description.ValueKind}"
			),
		};
	}

	public PatchField<string?> GetIcon() {
		return GetClearableString(Icon, nameof(Icon));
	}

	public PatchField<string?> GetTone() {
		return GetClearableString(Tone, nameof(Tone));
	}

	private static PatchField<string?> GetClearableString(
		JsonElement element,
		string fieldName
	) {
		return element.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.String => PatchField<string?>.Set(
				element.GetValueAsString()
			),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.Object
				or JsonValueKind.Array
				or JsonValueKind.Number
				or JsonValueKind.True
				or JsonValueKind.False => throw new InvalidOperationException(
				$"{fieldName} must be a string, null, or omitted"
			),
			_ => throw new ArgumentOutOfRangeException(
				nameof(element),
				element.ValueKind,
				$"Unhandled JsonValueKind: {element.ValueKind}"
			),
		};
	}
}

public class UpdateTenantProfileAsStaffBodyValidator
	: AbstractValidator<UpdateTenantProfileAsStaffBody> {
	public UpdateTenantProfileAsStaffBodyValidator() {
		RuleFor(x => x.Name)
			.MustBePatchFieldStringWithLength("Name", 2, 100, trim: true);

		RuleFor(x => x.Description)
			.MustBePatchFieldStringWithMaxLength("Description", 500, trim: true);

		RuleFor(x => x.Icon)
			.MustBePatchFieldStringMatchingPattern(
				"Icon",
				TenantProfileStyleValidationRules.IconMaxLength,
				TenantProfileStyleValidationRules.IconPattern,
				"be a lowercase Tabler icon name using letters, digits, and hyphens"
			);

		RuleFor(x => x.Tone)
			.MustBePatchFieldStringInSet(
				"Tone",
				TenantProfileStyleValidationRules.Tones
			);
	}
}

public sealed class UpdateTenantProfileAsStaff {
	public static async Task<Results<
		Ok<GetTenantProfileByIdResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromRoute] string profileId,
		[FromBody] UpdateTenantProfileAsStaffBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ITenantProfileAsStaffService tenantProfileService,
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
		var icon = body.GetIcon();
		var tone = body.GetTone();

		if (!name.IsPresent
			&& !description.IsPresent
			&& !icon.IsPresent
			&& !tone.IsPresent) {
			return TypedProblems.BadRequest(
				"No fields to update",
				ResponseKeys.BadRequest
			);
		}

		var result = await tenantProfileService.UpdateTenantProfileAsync(
			new UpdateTenantProfileArgs(
				TenantId: tenantIdGuid,
				ProfileId: profileIdGuid,
				Name: name,
				Description: description,
				Icon: icon,
				Tone: tone
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

			if (icon.IsPresent
				&& !string.Equals(
					success.PreviousProfile.Icon,
					success.Profile.Icon,
					StringComparison.Ordinal
				)) {
				changedFields["icon"] = new {
					Old = success.PreviousProfile.Icon,
					New = success.Profile.Icon
				};
			}

			if (tone.IsPresent
				&& !string.Equals(
					success.PreviousProfile.Tone,
					success.Profile.Tone,
					StringComparison.Ordinal
				)) {
				changedFields["tone"] = new {
					Old = success.PreviousProfile.Tone,
					New = success.Profile.Tone
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
					new CreateAuditLogArgs(
						UserId: account.UserId,
						Action: AuditActions.TenantProfileUpdated,
						TargetId: profileIdGuid,
						Details: new {
							TenantId = tenantIdGuid,
							ProfileId = profileIdGuid,
							ProfileName = success.Profile.Name,
							IsDefault = success.Profile.IsDefault,
							ChangedFields = changedFields
						}
					),
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
