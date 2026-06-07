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
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Tenants.Services;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

public record UpdateTenantAsStaffBody {
	public JsonElement Name { get; init; }
	public JsonElement LogoUrl { get; init; }
	public JsonElement? MaxUsers { get; init; }

	public string? GetName() {
		return Name.ValueKind switch {
			JsonValueKind.Undefined =>
				null,
			JsonValueKind.String =>
				Name.GetValueAsString(),
			JsonValueKind.Null
				or JsonValueKind.Object
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

	public PatchField<string?> GetLogoUrl() {
		return LogoUrl.ValueKind switch {
			JsonValueKind.Undefined =>
				PatchField<string?>.Absent(),
			JsonValueKind.Null =>
				PatchField<string?>.Set(null),
			JsonValueKind.String =>
				PatchField<string?>.Set(
					LogoUrl.GetValueAsString()
				),
			JsonValueKind.Object
				or JsonValueKind.Array
				or JsonValueKind.Number
				or JsonValueKind.True
				or JsonValueKind.False => throw new InvalidOperationException(
				"LogoUrl must be a string, null, or omitted"
			),
			_ => throw new ArgumentOutOfRangeException(
				nameof(LogoUrl),
				LogoUrl.ValueKind,
				$"Unhandled JsonValueKind: {LogoUrl.ValueKind}"
			),
		};
	}

	public int? GetMaxUsers() {
		return MaxUsers?.GetValueAsInt32OrNull();
	}
}

public class UpdateTenantAsStaffBodyValidator
	: AbstractValidator<UpdateTenantAsStaffBody> {
	public UpdateTenantAsStaffBodyValidator() {
		RuleFor(x => x.Name)
			.MustBePatchFieldStringWithLength("Name", 5, int.MaxValue);

		RuleFor(x => x.LogoUrl)
			.MustBePatchFieldNullableString("LogoUrl");

		RuleFor(x => x.MaxUsers).Custom((element, context) => {
			if (element is null) {
				return; // field absent / wrapper-null → omitted, OK
			}
			if (element.Value.ValueKind != JsonValueKind.Number) {
				context.AddFailure("MaxUsers must be a number");
				return;
			}
			if (!element.Value.TryGetInt32(out var value) || value <= 0) {
				context.AddFailure("MaxUsers must be greater than 0");
			}
		});
	}
}

public sealed class UpdateTenantAsStaff {
	public static async Task<Results<
		Ok<GetTenantAsStaffResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
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

		var name = body.GetName();
		var logoUrl = body.GetLogoUrl();
		var maxUsers = body.GetMaxUsers();

		// Guard against empty PATCH body
		if (name is null
			&& !logoUrl.IsPresent
			&& maxUsers is null) {
			return TypedProblems.BadRequest(
				"No fields to update",
				ResponseKeys.BadRequest
			);
		}

		var args = new UpdateTenantAsStaffArgs(
			Name: name,
			LogoUrl: logoUrl,
			MaxUsers: maxUsers
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
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.TenantUpdated,
				TargetId: tenantIdGuid,
				Details: new {
					Name = args.Name,
					LogoUrl = args.LogoUrl.IsPresent
						? args.LogoUrl.Value : null,
					MaxUsers = args.MaxUsers,
				}
			),
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
