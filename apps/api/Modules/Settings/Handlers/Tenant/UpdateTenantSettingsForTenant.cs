using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Tenants.Services;
using PublyApp.Api.Modules.Tenants.Validation;

namespace PublyApp.Api.Modules.Settings.Handlers.Tenant;

public class UpdateTenantSettingsGeneralBody {
	public JsonElement Name { get; init; }
	public JsonElement LogoUrl { get; init; }
	public JsonElement LegalName { get; init; }
	public JsonElement Description { get; init; }
	public JsonElement WebsiteUrl { get; init; }
	public JsonElement BillingEmail { get; init; }
	public JsonElement SupportEmail { get; init; }
	public JsonElement DefaultLocale { get; init; }
	public JsonElement Timezone { get; init; }

	public string? GetName() {
		return this.Name.ValueKind switch {
			JsonValueKind.Undefined =>
				null,
			JsonValueKind.String =>
				this.Name.GetValueAsString(),
			JsonValueKind.Null
				or JsonValueKind.Object
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

	public PatchField<string?> GetLogoUrl() {
		return UpdateTenantSettingsGeneralBody._GetPatchFieldString(this.LogoUrl);
	}

	public PatchField<string?> GetLegalName() {
		return UpdateTenantSettingsGeneralBody._GetPatchFieldString(this.LegalName);
	}

	public PatchField<string?> GetDescription() {
		return UpdateTenantSettingsGeneralBody._GetPatchFieldString(this.Description);
	}

	public PatchField<string?> GetWebsiteUrl() {
		return UpdateTenantSettingsGeneralBody._GetPatchFieldString(this.WebsiteUrl);
	}

	public PatchField<string?> GetBillingEmail() {
		return UpdateTenantSettingsGeneralBody._GetPatchFieldString(this.BillingEmail);
	}

	public PatchField<string?> GetSupportEmail() {
		return UpdateTenantSettingsGeneralBody._GetPatchFieldString(this.SupportEmail);
	}

	public PatchField<string?> GetDefaultLocale() {
		return UpdateTenantSettingsGeneralBody._GetPatchFieldString(this.DefaultLocale);
	}

	public PatchField<string?> GetTimezone() {
		return UpdateTenantSettingsGeneralBody._GetPatchFieldString(this.Timezone);
	}

	private static PatchField<string?> _GetPatchFieldString(JsonElement element) {
		return element.ValueKind switch {
			JsonValueKind.Undefined =>
				PatchField<string?>.Absent(),
			JsonValueKind.Null =>
				PatchField<string?>.Set(null),
			// Trims and maps whitespace-only input to null so "cleared" has a single
			// representation — otherwise {"legalName": "  "} would persist a non-null
			// value the UI has to separately treat as empty alongside actual null.
			JsonValueKind.String =>
				PatchField<string?>.Set(UpdateTenantSettingsGeneralBody._NormalizeClearableString(element.GetValueAsString())),
			JsonValueKind.Object
				or JsonValueKind.Array
				or JsonValueKind.Number
				or JsonValueKind.True
				or JsonValueKind.False => throw new InvalidOperationException(
				"Field must be a string, null, or omitted"
			),
			_ => throw new ArgumentOutOfRangeException(
				nameof(element),
				element.ValueKind,
				$"Unhandled JsonValueKind: {element.ValueKind}"
			),
		};
	}

	private static string? _NormalizeClearableString(string value) {
		var trimmed = value.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}
}

public class UpdateTenantSettingsGeneralBodyValidator
	: AbstractValidator<UpdateTenantSettingsGeneralBody> {
	public UpdateTenantSettingsGeneralBodyValidator() {
		this.RuleFor(x => x.Name)
			.MustBePatchFieldStringWithLength("Name", 5, TenantValidationRules.NameMaxLength);

		this.RuleFor(x => x.LogoUrl)
			.MustBePatchFieldLogoUrl();

		this.RuleFor(x => x.LegalName)
			.MustBePatchFieldStringWithMaxLength("LegalName", 256);

		this.RuleFor(x => x.Description)
			.MustBePatchFieldStringWithMaxLength("Description", 1024);

		this.RuleFor(x => x.WebsiteUrl)
			.MustBePatchFieldClearableUrl("WebsiteUrl", TenantValidationRules.WebsiteUrlMaxLength);

		this.RuleFor(x => x.BillingEmail)
			.MustBePatchFieldEmailWithMaxLength("BillingEmail", 320);

		this.RuleFor(x => x.SupportEmail)
			.MustBePatchFieldEmailWithMaxLength("SupportEmail", 320);

		this.RuleFor(x => x.DefaultLocale)
			.MustBePatchFieldLocale();

		this.RuleFor(x => x.Timezone)
			.MustBePatchFieldTimezone();
	}
}

public sealed class UpdateTenantSettingsForTenant {
	public static async Task<Results<
		Ok<TenantSettingsGeneralResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppInternalServerErrorHttpResult
	>> Handle(
		[FromBody] UpdateTenantSettingsGeneralBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ITenantAsStaffService tenantService,
		[FromServices] ILogger<UpdateTenantSettingsForTenant> logger,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var name = body.GetName();
		var logoUrl = body.GetLogoUrl();
		var legalName = body.GetLegalName();
		var description = body.GetDescription();
		var websiteUrl = body.GetWebsiteUrl();
		var billingEmail = body.GetBillingEmail();
		var supportEmail = body.GetSupportEmail();
		var defaultLocale = body.GetDefaultLocale();
		var timezone = body.GetTimezone();

		// Guard against empty PATCH body
		if (name is null
			&& !logoUrl.IsPresent
			&& !legalName.IsPresent
			&& !description.IsPresent
			&& !websiteUrl.IsPresent
			&& !billingEmail.IsPresent
			&& !supportEmail.IsPresent
			&& !defaultLocale.IsPresent
			&& !timezone.IsPresent) {
			return TypedProblems.BadRequest(
				"No fields to update",
				ResponseKeys.BadRequest
			);
		}

		var result = await tenantService.UpdateTenantAsync(
			tenantId,
			new UpdateTenantAsStaffArgs(
				Name: name,
				LogoUrl: logoUrl,
				MaxUsers: null,
				LegalName: legalName,
				Description: description,
				WebsiteUrl: websiteUrl,
				BillingEmail: billingEmail,
				SupportEmail: supportEmail,
				DefaultLocale: defaultLocale,
				Timezone: timezone,
				Notes: PatchField<string?>.Absent()
			),
			cancellationToken
		);

		if (result is UpdateTenantResult.NotFound) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"Tenant not found for settings update: {@LogData}",
					new { TenantId = tenantId }
				);
			}

			return TypedProblems.NotFound(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}

		if (result is not UpdateTenantResult.Success success) {
			throw new InvalidOperationException(
				$"Unknown update tenant result: {result.GetType().Name}"
			);
		}

		return TypedResults.Ok(GetTenantSettingsForTenant.ToResult(success.Tenant));
	}
}
