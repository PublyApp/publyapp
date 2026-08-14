using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Profiles.Services;
using PublyApp.Api.Modules.Profiles.Validation;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public record UpdateStaffProfileBody {
	// PATCH semantics:
	// - Undefined: field omitted (no change)
	// - Null: clear the field (when allowed)
	// - String: set the field
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
					// "name" is required at the entity level; PATCH supports "omit" but not "clear".
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

public class UpdateStaffProfileBodyValidator
	: AbstractValidator<UpdateStaffProfileBody> {
	public UpdateStaffProfileBodyValidator() {
		RuleFor(x => x.Name)
			.MustBePatchFieldStringWithLength("Name", 2, 100, trim: true);

		RuleFor(x => x.Description)
			.MustBePatchFieldStringWithMaxLength("Description", 500, trim: true);

		RuleFor(x => x.Icon)
			.MustBePatchFieldStringInSet(
				"Icon",
				ProfileStyleValidationRules.Icons
			);

		RuleFor(x => x.Tone)
			.MustBePatchFieldStringInSet(
				"Tone",
				ProfileStyleValidationRules.Tones
			);
	}
}

public sealed class UpdateStaffProfile {
	public static async Task<Results<
		Ok<GetStaffProfileByIdResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string profileId,
		[FromBody] UpdateStaffProfileBody body,
		[FromServices] IStaffProfileAsStaffService profileAsStaffService,
		CancellationToken cancellationToken
	) {
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

		// Guard against empty PATCH body. Validation runs before this, but it does not
		// know whether fields were omitted, so we still need this explicit check.
		if (!name.IsPresent
			&& !description.IsPresent
			&& !icon.IsPresent
			&& !tone.IsPresent) {
			return TypedProblems.BadRequest(
				"No fields to update",
				ResponseKeys.BadRequest
			);
		}

		var args = new UpdateStaffProfileArgs(
			ProfileId: profileIdGuid,
			Name: name,
			Description: description,
			Icon: icon,
			Tone: tone
		);

		var result = await profileAsStaffService.UpdateStaffProfileAsync(
			args,
			cancellationToken
		);

		if (result is UpdateStaffProfileResult.ProfileNotFound) {
			return TypedProblems.NotFound(
				"Profile not found",
				ResponseKeys.NotFound
			);
		}

		if (result is UpdateStaffProfileResult.ProfileNameExists) {
			return TypedProblems.BadRequest(
				"Profile name already exists",
				ResponseKeys.ProfileNameAlreadyExists
			);
		}

		if (result is UpdateStaffProfileResult.Success success) {
			return TypedResults.Ok(new GetStaffProfileByIdResult {
				Profile = success.Profile
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
