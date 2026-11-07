using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Roles.Validation;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public record UpdateStaffRoleBody {
	// PATCH semantics:
	// - Undefined: field omitted (no change)
	// - Null: clear the field (when allowed)
	// - String: set the field
	public JsonElement Name { get; init; }
	public JsonElement Description { get; init; }
	public JsonElement Icon { get; init; }
	public JsonElement Tone { get; init; }

	public PatchField<string?> GetName() {
		return this.Name.ValueKind switch {
			JsonValueKind.Undefined =>
				PatchField<string?>.Absent(),
			JsonValueKind.String =>
				PatchField<string?>.Set(this.Name.GetValueAsString()),
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
				nameof(this.Name),
				this.Name.ValueKind,
				$"Unhandled JsonValueKind: {this.Name.ValueKind}"
			),
		};
	}

	public PatchField<string?> GetDescription() {
		return this.Description.ValueKind switch {
			JsonValueKind.Undefined =>
				PatchField<string?>.Absent(),
			JsonValueKind.String =>
				PatchField<string?>.Set(
					this.Description.GetValueAsString()
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
				nameof(this.Description),
				this.Description.ValueKind,
				$"Unhandled JsonValueKind: {this.Description.ValueKind}"
			),
		};
	}

	public PatchField<string?> GetIcon() {
		return UpdateStaffRoleBody._GetClearableString(this.Icon, nameof(this.Icon));
	}

	public PatchField<string?> GetTone() {
		return UpdateStaffRoleBody._GetClearableString(this.Tone, nameof(this.Tone));
	}

	private static PatchField<string?> _GetClearableString(
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

public class UpdateStaffRoleBodyValidator
	: AbstractValidator<UpdateStaffRoleBody> {
	public UpdateStaffRoleBodyValidator() {
		this.RuleFor(x => x.Name)
			.MustBePatchFieldStringWithLength("Name", 2, 100, trim: true);

		this.RuleFor(x => x.Description)
			.MustBePatchFieldStringWithMaxLength("Description", 500, trim: true);

		this.RuleFor(x => x.Icon)
			.MustBePatchFieldStringInSet(
				"Icon",
				RoleStyleValidationRules.Icons
			);

		this.RuleFor(x => x.Tone)
			.MustBePatchFieldStringInSet(
				"Tone",
				RoleStyleValidationRules.Tones
			);
	}
}

public sealed class UpdateStaffRole {
	public static async Task<Results<
		Ok<GetStaffRoleByIdResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
			AppForbiddenHttpResult
	>> Handle(
		[FromRoute] string roleId,
		[FromBody] UpdateStaffRoleBody body,
		[FromServices] IStaffRoleAsStaffService roleAsStaffService,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(roleId, out var roleIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid roleId",
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

		var args = new UpdateStaffRoleArgs(
			RoleId: roleIdGuid,
			Name: name,
			Description: description,
			Icon: icon,
			Tone: tone
		);

		var result = await roleAsStaffService.UpdateStaffRoleAsync(
			args,
			cancellationToken
		);

		if (result is UpdateStaffRoleResult.RoleNotFound) {
			return TypedProblems.NotFound(
				"Role not found",
				ResponseKeys.NotFound
			);
		}
		if (result is UpdateStaffRoleResult.SystemRoleProtected) {
			return TypedProblems.Forbidden(
				"The full-access system role cannot be edited",
				ResponseKeys.Forbidden
			);
		}


		if (result is UpdateStaffRoleResult.RoleNameExists) {
			return TypedProblems.BadRequest(
				"Role name already exists",
				ResponseKeys.RoleNameAlreadyExists
			);
		}

		if (result is UpdateStaffRoleResult.Success success) {
			return TypedResults.Ok(new GetStaffRoleByIdResult {
				Role = success.Role
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
