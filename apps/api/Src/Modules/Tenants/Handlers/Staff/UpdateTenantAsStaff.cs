using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Tenants.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

public record UpdateTenantAsStaffBody {
	public JsonElement? Name { get; init; }
	public JsonElement LogoUrl { get; init; }
	public JsonElement? MaxUsers { get; init; }

	public string? GetName() =>
		Name.GetValueAsStringOrNull();

	public PatchField<string?> GetLogoUrl() =>
		LogoUrl.ValueKind switch {
			JsonValueKind.Undefined =>
				PatchField<string?>.Absent(),
			JsonValueKind.Null =>
				PatchField<string?>.Set(null),
			JsonValueKind.String =>
				PatchField<string?>.Set(
					LogoUrl.GetValueAsString()
				),
			_ => throw new InvalidOperationException(
				"LogoUrl must be a string, null, or omitted"
			),
		};

	public int? GetMaxUsers() =>
		MaxUsers?.GetValueAsInt32OrNull();
}

public class UpdateTenantAsStaffBodyValidator
	: AbstractValidator<UpdateTenantAsStaffBody> {
	public UpdateTenantAsStaffBodyValidator() {
		RuleFor(x => x.Name)
			.Must(e => e is null
				|| e.Value.ValueKind == JsonValueKind.String)
			.WithMessage("Name must be a string")
			.DependentRules(() => {
				RuleFor(x => x.Name)
					.Must(e => e is null
						|| (e.Value.GetString()?.Length ?? 0)
							>= 5)
					.WithMessage(
						"Name must be at least 5 characters"
					);
			});

		RuleFor(x => x.LogoUrl)
			.Must(e =>
				e.ValueKind == JsonValueKind.Undefined
				|| e.ValueKind == JsonValueKind.Null
				|| e.ValueKind == JsonValueKind.String)
			.WithMessage(
				"LogoUrl must be a string, null, or omitted"
			);

		RuleFor(x => x.MaxUsers)
			.Must(e => e is null
				|| e.Value.ValueKind == JsonValueKind.Number)
			.WithMessage("MaxUsers must be a number")
			.DependentRules(() => {
				RuleFor(x => x.MaxUsers)
					.Must(e => e is null
						|| (e.Value.TryGetInt32(out var v)
							&& v > 0))
					.WithMessage(
						"MaxUsers must be greater than 0"
					);
			});
	}
}

public class UpdateTenantAsStaff {
	public static async Task<Results<
		Ok<GetTenantAsStaffResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleUpdateTenantAsStaff(
		[FromRoute] string tenantId,
		[FromBody] UpdateTenantAsStaffBody body,
		[FromServices] ITenantAsStaffService tenantService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenant ID",
				ResponseKeys.MalformedId
			);
		}

		// Guard against empty PATCH body
		if (body.GetName() is null
			&& !body.GetLogoUrl().IsPresent
			&& body.GetMaxUsers() is null) {
			return TypedProblems.BadRequest(
				"No fields to update",
				ResponseKeys.BadRequest
			);
		}

		var args = new UpdateTenantAsStaffArgs(
			Name: body.GetName(),
			LogoUrl: body.GetLogoUrl(),
			MaxUsers: body.GetMaxUsers()
		);

		var result = await tenantService.UpdateTenantAsync(
			tenantIdGuid, args, cancellationToken
		);

		if (result is UpdateTenantResult.NotFound) {
			return TypedProblems.NotFound(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}
		if (result is UpdateTenantResult.MaxUsersBelowCurrentCount) {
			return TypedProblems.BadRequest(
				"Max users cannot be less than "
				+ "the current number of users",
				ResponseKeys
					.TenantMaxUsersBelowCount
			);
		}

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has "
				+ ".WithPermission() middleware."
			);
		}

		if (result is not UpdateTenantResult.Success success) {
			throw new InvalidOperationException(
				$"Unknown update tenant result: {result.GetType().Name}"
			);
		}
		var tenant = success.Tenant;
		var usersCount = await tenantService
			.CountTenantUsersAsync(
				tenantIdGuid, cancellationToken
			);

		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.TenantUpdated,
			tenantIdGuid,
			new {
				Name = args.Name,
				LogoUrl = args.LogoUrl.IsPresent
					? args.LogoUrl.Value : null,
				MaxUsers = args.MaxUsers,
			},
			cancellationToken
		);

		return TypedResults.Ok(new GetTenantAsStaffResult {
			TenantId = tenant.GetRequiredId(),
			Name = tenant.Name,
			Code = tenant.Code,
			LogoUrl = tenant.LogoUrl,
			MaxUsers = tenant.MaxUsers,
			Status = Tenant.GetStatusDescription(
				tenant.Status
			),
			UsersCount = usersCount,
			CreatedAt = tenant.CreatedAt,
			UpdatedAt = tenant.UpdatedAt,
		});
	}
}
