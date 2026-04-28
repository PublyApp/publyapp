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

public record CreateTenantProfileAsStaffBody {
	public JsonElement Name { get; init; }
	public JsonElement Description { get; init; }
	public JsonElement PermissionKeys { get; init; }

	private bool _parsedPermissionKeys;
	private List<string> _permissionKeys = [];

	public string GetName() {
		return Name.GetValueAsString();
	}

	public string? GetDescription() {
		return Description.GetValueAsStringOrNull();
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
			.MustBeRequiredString("Name")
			.DependentRules(() => {
				RuleFor(x => x.Name)
					.Must(e => {
						var str = e.GetString();
						return str is not null && str.Trim().Length >= 2;
					})
					.WithMessage("Name must be at least 2 characters long")
					.Must(e => {
						var str = e.GetString();
						return str is not null && str.Trim().Length <= 100;
					})
					.WithMessage("Name must be at most 100 characters long");
			});

		RuleFor(x => x.Description)
			.MustBePatchFieldNullableString("Description")
			.DependentRules(() => {
				RuleFor(x => x.Description)
					.Must(e => {
						if (e.ValueKind != JsonValueKind.String) {
							return true;
						}

						var description = e.GetString();
						if (string.IsNullOrWhiteSpace(description)) {
							return true;
						}

						return description.Trim().Length <= 500;
					})
					.WithMessage("Description must be at most 500 characters");
			});

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

public class CreateTenantProfileAsStaff {
	public static async Task<Results<
		Created<GetTenantProfileByIdResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleCreateTenantProfileAsStaff(
		[FromRoute] string tenantId,
		[FromBody] CreateTenantProfileAsStaffBody body,
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

		var name = body.GetName();
		var description = body.GetDescription();
		var permissionKeys = body.GetPermissionKeys();

		var result = await profileAsStaffService.CreateTenantProfileAsync(
			new CreateTenantProfileArgs(
				TenantId: tenantIdGuid,
				Name: name,
				Description: description,
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
				account.UserId,
				AuditActions.TenantProfileCreated,
				success.Profile.Id,
				new {
					// Keep audit payload aligned with preview/table data so staff can reconcile
					// mutations without opening the profile first.
					TenantId = tenantIdGuid,
					ProfileId = success.Profile.Id,
					ProfileName = success.Profile.Name,
					IsDefault = success.Profile.IsDefault,
					InitialPermissionKeys = success.InitialPermissionKeys,
					InitialPermissionCount = success.InitialPermissionKeys.Count
				},
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
