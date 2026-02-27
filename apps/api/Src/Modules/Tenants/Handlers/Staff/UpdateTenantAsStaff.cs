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

public static class UpdateTenantAsStaff {
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

		var args = new UpdateTenantAsStaffArgs(
			Name: body.GetName(),
			LogoUrl: body.GetLogoUrl(),
			MaxUsers: body.GetMaxUsers()
		);

		var result = await tenantService.UpdateTenantAsync(
			tenantIdGuid, args, cancellationToken
		);

		if (result.Error is UpdateTenantError.NotFound) {
			return TypedProblems.NotFound(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}
		if (result.Error
			is UpdateTenantError.MaxUsersBelowCurrentCount
		) {
			return TypedProblems.BadRequest(
				"Max users cannot be less than "
				+ "the current number of users",
				ResponseKeys
					.TenantMaxUsersBelowCount
			);
		}
		if (result.Error is not null) {
			throw new InvalidOperationException(
				$"Unknown error: {result.Error}"
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

		if (result.Tenant is null) {
			throw new InvalidOperationException(
				"Service returned success "
				+ "but Tenant was null."
			);
		}
		var tenant = result.Tenant;
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
			IsSuspended = tenant.IsSuspended,
			UsersCount = usersCount,
			CreatedAt = tenant.CreatedAt,
			UpdatedAt = tenant.UpdatedAt,
		});
	}
}
