using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Tenants.Services;

namespace PublyApp.Api.Modules.Settings.Handlers.Tenant;

public class TenantSettingsGeneralResult {
	public Guid Id { get; set; }
	public string Code { get; set; } = string.Empty;
	public string Name { get; set; } = string.Empty;
	public string? LogoUrl { get; set; }
	public string? LegalName { get; set; }
	public string? Description { get; set; }
	public string? WebsiteUrl { get; set; }
	public string? BillingEmail { get; set; }
	public string? SupportEmail { get; set; }
	public string? DefaultLocale { get; set; }
	public string? Timezone { get; set; }
}

public sealed class GetTenantSettingsForTenant {
	public static async Task<Results<
		Ok<TenantSettingsGeneralResult>,
		AppNotFoundHttpResult,
		AppInternalServerErrorHttpResult
	>> Handle(
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ITenantService tenantService,
		[FromServices] ILogger<GetTenantSettingsForTenant> logger,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		// Self-service semantics: suspended (or missing) tenants resolve to null
		// via TenantService.GetTenantByIdAsync's IsTenantActive filter.
		var tenant = await tenantService.GetTenantByIdAsync(
			tenantId, cancellationToken
		);

		if (tenant is null) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"Tenant not found for settings: {@LogData}",
					new { TenantId = tenantId }
				);
			}

			return TypedProblems.NotFound(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}

		return TypedResults.Ok(ToResult(tenant));
	}

	internal static TenantSettingsGeneralResult ToResult(
		PublyApp.Api.Modules.Tenants.Entities.Tenant tenant
	) {
		return new TenantSettingsGeneralResult {
			Id = tenant.GetRequiredId(),
			Code = tenant.Code,
			Name = tenant.Name,
			LogoUrl = tenant.LogoUrl,
			LegalName = tenant.LegalName,
			Description = tenant.Description,
			WebsiteUrl = tenant.WebsiteUrl,
			BillingEmail = tenant.BillingEmail,
			SupportEmail = tenant.SupportEmail,
			DefaultLocale = tenant.DefaultLocale,
			Timezone = tenant.Timezone,
		};
	}
}
