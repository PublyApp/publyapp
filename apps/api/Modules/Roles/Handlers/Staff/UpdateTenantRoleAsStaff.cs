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
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Roles.Validation;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public record UpdateTenantRoleAsStaffBody {
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
		return UpdateTenantRoleAsStaffBody._GetClearableString(this.Icon, nameof(this.Icon));
	}

	public PatchField<string?> GetTone() {
		return UpdateTenantRoleAsStaffBody._GetClearableString(this.Tone, nameof(this.Tone));
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

public class UpdateTenantRoleAsStaffBodyValidator
	: AbstractValidator<UpdateTenantRoleAsStaffBody> {
	public UpdateTenantRoleAsStaffBodyValidator() {
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

public sealed class UpdateTenantRoleAsStaff {
	public static async Task<Results<
		Ok<GetTenantRoleByIdResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
			AppForbiddenHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromRoute] string roleId,
		[FromBody] UpdateTenantRoleAsStaffBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ITenantRoleAsStaffService tenantRoleService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenant ID",
				ResponseKeys.MalformedId
			);
		}

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

		if (!name.IsPresent
			&& !description.IsPresent
			&& !icon.IsPresent
			&& !tone.IsPresent) {
			return TypedProblems.BadRequest(
				"No fields to update",
				ResponseKeys.BadRequest
			);
		}

		var result = await tenantRoleService.UpdateTenantRoleAsync(
			new UpdateTenantRoleArgs(
				TenantId: tenantIdGuid,
				RoleId: roleIdGuid,
				Name: name,
				Description: description,
				Icon: icon,
				Tone: tone
			),
			cancellationToken
		);

		if (result is UpdateTenantRoleResult.RoleNotFound) {
			return TypedProblems.NotFound(
				"Role not found",
				ResponseKeys.NotFound
			);
		}
		if (result is UpdateTenantRoleResult.SystemRoleProtected) {
			return TypedProblems.Forbidden(
				"The full-access system role cannot be edited",
				ResponseKeys.Forbidden
			);
		}


		if (result is UpdateTenantRoleResult.RoleNameExists nameExists) {
			return TypedProblems.BadRequest(
				$"Role name already exists: {nameExists.Name}",
				ResponseKeys.RoleNameAlreadyExists
			);
		}

		if (result is UpdateTenantRoleResult.Success success) {
			var changedFields = new Dictionary<string, object?>();
			if (name.IsPresent
				&& !string.Equals(
					success.PreviousRole.RoleName,
					success.Role.Name,
					StringComparison.Ordinal
				)) {
				changedFields["name"] = new {
					Old = success.PreviousRole.RoleName,
					New = success.Role.Name
				};
			}

			if (description.IsPresent
				&& !string.Equals(
					success.PreviousRole.Description,
					success.Role.Description,
					StringComparison.Ordinal
				)) {
				changedFields["description"] = new {
					Old = success.PreviousRole.Description,
					New = success.Role.Description
				};
			}

			if (icon.IsPresent
				&& !string.Equals(
					success.PreviousRole.Icon,
					success.Role.Icon,
					StringComparison.Ordinal
				)) {
				changedFields["icon"] = new {
					Old = success.PreviousRole.Icon,
					New = success.Role.Icon
				};
			}

			if (tone.IsPresent
				&& !string.Equals(
					success.PreviousRole.Tone,
					success.Role.Tone,
					StringComparison.Ordinal
				)) {
				changedFields["tone"] = new {
					Old = success.PreviousRole.Tone,
					New = success.Role.Tone
				};
			}

			if (changedFields.Count > 0) {
				var account = authContext.GetRequiredStaffAccount();

				await auditLogService.LogAsync(
					new CreateAuditLogArgs(
						UserId: account.UserId,
						Action: AuditActions.TenantRoleUpdated,
						TargetId: roleIdGuid,
						Details: new {
							TenantId = tenantIdGuid,
							RoleId = roleIdGuid,
							RoleName = success.Role.Name,
							IsDefault = success.Role.IsDefault,
							ChangedFields = changedFields
						}
					),
					cancellationToken
				);
			}

			return TypedResults.Ok(new GetTenantRoleByIdResponse {
				Role = success.Role
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
