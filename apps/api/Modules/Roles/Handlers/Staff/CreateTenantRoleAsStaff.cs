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

public record CreateTenantRoleAsStaffBody {
	public JsonElement Name { get; init; }
	public JsonElement Description { get; init; }
	public JsonElement Icon { get; init; }
	public JsonElement Tone { get; init; }
	public JsonElement PermissionKeys { get; init; }

	private bool _ParsedPermissionKeys;
	private List<string> _PermissionKeys = [];

	public string GetName() {
		return this.Name.GetValueAsString();
	}

	public string? GetDescription() {
		return this.Description.GetValueAsStringOrNull();
	}

	public string? GetIcon() {
		return this.Icon.GetValueAsStringOrNull();
	}

	public string? GetTone() {
		return this.Tone.GetValueAsStringOrNull();
	}

	public List<string> GetPermissionKeys() {
		if (this._ParsedPermissionKeys) {
			return this._PermissionKeys;
		}

		if (
			this.PermissionKeys.ValueKind is JsonValueKind.Undefined
			or JsonValueKind.Null
		) {
			this._PermissionKeys = [];
			this._ParsedPermissionKeys = true;
			return this._PermissionKeys;
		}

		if (this.PermissionKeys.ValueKind != JsonValueKind.Array) {
			throw new InvalidOperationException(
				"PermissionKeys must be an array"
			);
		}

		this._PermissionKeys = this.PermissionKeys
			.EnumerateArray()
			.Select(element => {
				var permissionKey = element.GetString();
				if (permissionKey is null) {
					// Post-validation invariant: every permissionKeys item is already guaranteed
					// to be a non-empty string before we parse and trim it here.
					throw new InvalidOperationException(
						"Permission key is null after validation"
					);
				}

				return permissionKey.Trim();
			})
			.ToList();

		this._ParsedPermissionKeys = true;
		return this._PermissionKeys;
	}
}

public class CreateTenantRoleAsStaffBodyValidator
	: AbstractValidator<CreateTenantRoleAsStaffBody> {
	public CreateTenantRoleAsStaffBodyValidator() {
		this.RuleFor(x => x.Name)
			.MustBeRequiredStringWithLength("Name", 2, 100, trim: true);

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

		this.RuleFor(x => x.PermissionKeys).Custom((element, context) => {
			if (
				element.ValueKind is JsonValueKind.Undefined
				or JsonValueKind.Null
			) {
				return;
			}

			if (element.ValueKind != JsonValueKind.Array) {
				context.AddFailure("PermissionKeys must be an array");
				return;
			}

			var array = element.EnumerateArray().ToList();
			for (var index = 0; index < array.Count; index++) {
				var item = array[index];
				if (item.ValueKind != JsonValueKind.String) {
					context.AddFailure(
						$"permissionKeys[{index}]",
						"PermissionKey must be a string"
					);
					continue;
				}

				var permissionKey = item.GetString();
				if (string.IsNullOrWhiteSpace(permissionKey)) {
					context.AddFailure(
						$"permissionKeys[{index}]",
						"PermissionKey is required"
					);
				}
			}
		});
	}
}

public sealed class CreateTenantRoleAsStaff {
	public static async Task<Results<
		Created<GetTenantRoleByIdResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromBody] CreateTenantRoleAsStaffBody body,
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

		var name = body.GetName();
		var description = body.GetDescription();
		var icon = body.GetIcon();
		var tone = body.GetTone();
		var permissionKeys = body.GetPermissionKeys();

		var result = await tenantRoleService.CreateTenantRoleAsync(
			new CreateTenantRoleArgs(
				TenantId: tenantIdGuid,
				Name: name,
				Description: description,
				Icon: icon,
				Tone: tone,
				PermissionKeys: permissionKeys
			),
			cancellationToken
		);

		if (result is CreateTenantRoleResult.TenantNotFound) {
			return TypedProblems.NotFound(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}

		if (result is CreateTenantRoleResult.RoleNameExists nameExists) {
			return TypedProblems.BadRequest(
				$"Role name already exists: {nameExists.Name}",
				ResponseKeys.RoleNameAlreadyExists
			);
		}

		if (result is CreateTenantRoleResult.InvalidPermissions invalidPermissions) {
			return TypedProblems.BadRequest(
				$"Invalid permission keys: {string.Join(", ", invalidPermissions.InvalidKeys)}",
				ResponseKeys.BadRequest
			);
		}

		if (result is CreateTenantRoleResult.Success success) {
			var account = authContext.GetRequiredStaffAccount();

			await auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: AuditActions.TenantRoleCreated,
					TargetId: success.Role.Id,
					Details: new {
						// Keep audit payload aligned with preview/table data so staff can reconcile
						// mutations without opening the role first.
						TenantId = tenantIdGuid,
						RoleId = success.Role.Id,
						RoleName = success.Role.Name,
						IsDefault = success.Role.IsDefault,
						InitialPermissionKeys = success.InitialPermissionKeys,
						InitialPermissionCount = success.InitialPermissionKeys.Count
					}
				),
				cancellationToken
			);

			return TypedResults.Created(
				(string?)null,
				new GetTenantRoleByIdResponse {
					Role = success.Role
				}
			);
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
