using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Profiles.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

public record UpdateStaffProfileBody {
	// PATCH semantics:
	// - Undefined: field omitted (no change)
	// - Null: clear the field (when allowed)
	// - String: set the field
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
					// "name" is required at the entity level; PATCH supports "omit" but not "clear".
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

public class UpdateStaffProfileBodyValidator
	: AbstractValidator<UpdateStaffProfileBody> {
	public UpdateStaffProfileBodyValidator() {
		RuleFor(x => x.Name)
			.Must(e =>
				e.ValueKind == JsonValueKind.Undefined
				|| e.ValueKind == JsonValueKind.String)
			.WithMessage("Name must be a string")
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
			.Must(e =>
				e.ValueKind == JsonValueKind.Undefined
				|| e.ValueKind == JsonValueKind.String
				|| e.ValueKind == JsonValueKind.Null)
			.WithMessage("Description must be a string or null")
			.DependentRules(() => {
				RuleFor(x => x.Description)
					.Must(e => e.ValueKind != JsonValueKind.String
						|| (e.GetString()?.Trim().Length ?? 0) <= 500)
					.WithMessage("Description must be at most 500 characters");
			});
	}
}

public class UpdateStaffProfile {
	public static async Task<Results<
		Ok<GetStaffProfileByIdResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleUpdateStaffProfile(
		[FromServices] IProfileAsStaffService profileAsStaffService,
		[FromRoute] string profileId,
		[FromBody] UpdateStaffProfileBody body,
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

		// Guard against empty PATCH body. Validation runs before this, but it does not
		// know whether fields were omitted, so we still need this explicit check.
		if (!name.IsPresent && !description.IsPresent) {
			return TypedProblems.BadRequest(
				"No fields to update",
				ResponseKeys.BadRequest
			);
		}

		var args = new UpdateStaffProfileArgs(
			ProfileId: profileIdGuid,
			Name: name,
			Description: description
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
