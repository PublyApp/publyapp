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

public record CreateTenantProfileAsStaffBody {
	public JsonElement Name { get; init; }
	public JsonElement Description { get; init; }
	public JsonElement Icon { get; init; }
	public JsonElement Tone { get; init; }
	public JsonElement PermissionKeys { get; init; }

	private bool _parsedPermissionKeys;
	private List<string> _permissionKeys = [];

	public string GetName() {
		return Name.GetValueAsString();
	}

	public string? GetDescription() {
		return Description.GetValueAsStringOrNull();
	}

	public string? GetIcon() {
		return Icon.GetValueAsStringOrNull();
	}

	public string? GetTone() {
		return Tone.GetValueAsStringOrNull();
	}

	public List<string> GetPermissionKeys() {
		if (_parsedPermissionKeys) {
			return _permissionKeys;
		}

		if (
			PermissionKeys.ValueKind is JsonValueKind.Undefined
			or JsonValueKind.Null
		) {
			_permissionKeys = [];
			_parsedPermissionKeys = true;
			return _permissionKeys;
		}

		if (PermissionKeys.ValueKind != JsonValueKind.Array) {
			throw new InvalidOperationException(
				"PermissionKeys must be an array"
			);
		}

		_permissionKeys = PermissionKeys
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

		_parsedPermissionKeys = true;
		return _permissionKeys;
	}
}

public class CreateTenantProfileAsStaffBodyValidator
	: AbstractValidator<CreateTenantProfileAsStaffBody> {
	public CreateTenantProfileAsStaffBodyValidator() {
		RuleFor(x => x.Name)
			.MustBeRequiredStringWithLength("Name", 2, 100, trim: true);

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

		RuleFor(x => x.PermissionKeys).Custom((element, context) => {
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

public sealed class CreateTenantProfileAsStaff {
	public static async Task<Results<
		Created<GetTenantProfileByIdResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromBody] CreateTenantProfileAsStaffBody body,
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

		var name = body.GetName();
		var description = body.GetDescription();
		var icon = body.GetIcon();
		var tone = body.GetTone();
		var permissionKeys = body.GetPermissionKeys();

		var result = await tenantProfileService.CreateTenantProfileAsync(
			new CreateTenantProfileArgs(
				TenantId: tenantIdGuid,
				Name: name,
				Description: description,
				Icon: icon,
				Tone: tone,
				PermissionKeys: permissionKeys
			),
			cancellationToken
		);

		if (result is CreateTenantProfileResult.TenantNotFound) {
			return TypedProblems.NotFound(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}

		if (result is CreateTenantProfileResult.ProfileNameExists nameExists) {
			return TypedProblems.BadRequest(
				$"Profile name already exists: {nameExists.Name}",
				ResponseKeys.ProfileNameAlreadyExists
			);
		}

		if (result is CreateTenantProfileResult.InvalidPermissions invalidPermissions) {
			return TypedProblems.BadRequest(
				$"Invalid permission keys: {string.Join(", ", invalidPermissions.InvalidKeys)}",
				ResponseKeys.BadRequest
			);
		}

		if (result is CreateTenantProfileResult.Success success) {
			var account = authContext.AccountStaff;
			if (account is null) {
				throw new InvalidOperationException(
					"Staff account not found in auth context. Ensure the endpoint has .WithPermission() middleware."
				);
			}

			await auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: AuditActions.TenantProfileCreated,
					TargetId: success.Profile.Id,
					Details: new {
						// Keep audit payload aligned with preview/table data so staff can reconcile
						// mutations without opening the profile first.
						TenantId = tenantIdGuid,
						ProfileId = success.Profile.Id,
						ProfileName = success.Profile.Name,
						IsDefault = success.Profile.IsDefault,
						InitialPermissionKeys = success.InitialPermissionKeys,
						InitialPermissionCount = success.InitialPermissionKeys.Count
					}
				),
				cancellationToken
			);

			return TypedResults.Created(
				(string?)null,
				new GetTenantProfileByIdResponse {
					Profile = success.Profile
				}
			);
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
