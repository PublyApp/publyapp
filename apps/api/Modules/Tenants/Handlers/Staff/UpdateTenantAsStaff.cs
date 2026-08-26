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
using PublyApp.Api.Modules.Tenants.Services;
using PublyApp.Api.Modules.Tenants.Validation;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

public record UpdateTenantAsStaffBody {
	public JsonElement Name { get; init; }
	public JsonElement LogoUrl { get; init; }
	public JsonElement? MaxUsers { get; init; }
	public JsonElement LegalName { get; init; }
	public JsonElement Description { get; init; }
	public JsonElement WebsiteUrl { get; init; }
	public JsonElement BillingEmail { get; init; }
	public JsonElement SupportEmail { get; init; }
	public JsonElement DefaultLocale { get; init; }
	public JsonElement Timezone { get; init; }
	public JsonElement Notes { get; init; }

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
					NormalizeClearableString(LogoUrl.GetValueAsString())
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

	public PatchField<string?> GetLegalName() {
		return GetPatchFieldString(LegalName);
	}

	public PatchField<string?> GetDescription() {
		return GetPatchFieldString(Description);
	}

	public PatchField<string?> GetWebsiteUrl() {
		return GetPatchFieldString(WebsiteUrl);
	}

	public PatchField<string?> GetBillingEmail() {
		return GetPatchFieldString(BillingEmail);
	}

	public PatchField<string?> GetSupportEmail() {
		return GetPatchFieldString(SupportEmail);
	}

	public PatchField<string?> GetDefaultLocale() {
		return GetPatchFieldString(DefaultLocale);
	}

	public PatchField<string?> GetTimezone() {
		return GetPatchFieldString(Timezone);
	}

	public PatchField<string?> GetNotes() {
		return GetPatchFieldString(Notes);
	}

	private static PatchField<string?> GetPatchFieldString(JsonElement element) {
		return element.ValueKind switch {
			JsonValueKind.Undefined =>
				PatchField<string?>.Absent(),
			JsonValueKind.Null =>
				PatchField<string?>.Set(null),
			// Trims and maps whitespace-only input to null so "cleared" has a single
			// representation — otherwise {"legalName": "  "} would persist a non-null
			// value the UI has to separately treat as empty alongside actual null.
			JsonValueKind.String =>
				PatchField<string?>.Set(NormalizeClearableString(element.GetValueAsString())),
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

	private static string? NormalizeClearableString(string value) {
		var trimmed = value.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}
}

public class UpdateTenantAsStaffBodyValidator
	: AbstractValidator<UpdateTenantAsStaffBody> {
	public UpdateTenantAsStaffBodyValidator() {
		RuleFor(x => x.Name)
			.MustBePatchFieldStringWithLength("Name", 5, TenantValidationRules.NameMaxLength);

		RuleFor(x => x.LogoUrl)
			.MustBePatchFieldLogoUrl();

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

		RuleFor(x => x.LegalName)
			.MustBePatchFieldStringWithMaxLength("LegalName", 256);

		RuleFor(x => x.Description)
			.MustBePatchFieldStringWithMaxLength("Description", 1024);

		RuleFor(x => x.WebsiteUrl)
			.MustBePatchFieldClearableUrl("WebsiteUrl", TenantValidationRules.WebsiteUrlMaxLength);

		RuleFor(x => x.BillingEmail)
			.MustBePatchFieldEmailWithMaxLength("BillingEmail", 320);

		RuleFor(x => x.SupportEmail)
			.MustBePatchFieldEmailWithMaxLength("SupportEmail", 320);

		RuleFor(x => x.DefaultLocale)
			.MustBePatchFieldLocale();

		RuleFor(x => x.Timezone)
			.MustBePatchFieldTimezone();

		RuleFor(x => x.Notes)
			.MustBePatchFieldStringWithMaxLength("Notes", 4000);
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
		[FromServices] ILogger<UpdateTenantAsStaff> logger,
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
		var legalName = body.GetLegalName();
		var description = body.GetDescription();
		var websiteUrl = body.GetWebsiteUrl();
		var billingEmail = body.GetBillingEmail();
		var supportEmail = body.GetSupportEmail();
		var defaultLocale = body.GetDefaultLocale();
		var timezone = body.GetTimezone();
		var notes = body.GetNotes();

		// Guard against empty PATCH body
		if (name is null
			&& !logoUrl.IsPresent
			&& maxUsers is null
			&& !legalName.IsPresent
			&& !description.IsPresent
			&& !websiteUrl.IsPresent
			&& !billingEmail.IsPresent
			&& !supportEmail.IsPresent
			&& !defaultLocale.IsPresent
			&& !timezone.IsPresent
			&& !notes.IsPresent) {
			return TypedProblems.BadRequest(
				"No fields to update",
				ResponseKeys.BadRequest
			);
		}

		var args = new UpdateTenantAsStaffArgs(
			Name: name,
			LogoUrl: logoUrl,
			MaxUsers: maxUsers,
			LegalName: legalName,
			Description: description,
			WebsiteUrl: websiteUrl,
			BillingEmail: billingEmail,
			SupportEmail: supportEmail,
			DefaultLocale: defaultLocale,
			Timezone: timezone,
			Notes: notes
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
		var usersCount = success.UsersCount;

		// The tenant mutation already committed durably above. Audit persistence
		// is best-effort from here on: it must never turn an already-successful
		// update into a 500 that tells the caller to retry (round-5 API F2).
		try {
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
						LegalName = args.LegalName.IsPresent
							? args.LegalName.Value : null,
						Description = args.Description.IsPresent
							? args.Description.Value : null,
						WebsiteUrl = args.WebsiteUrl.IsPresent
							? args.WebsiteUrl.Value : null,
						BillingEmail = args.BillingEmail.IsPresent
							? args.BillingEmail.Value : null,
						SupportEmail = args.SupportEmail.IsPresent
							? args.SupportEmail.Value : null,
						DefaultLocale = args.DefaultLocale.IsPresent
							? args.DefaultLocale.Value : null,
						Timezone = args.Timezone.IsPresent
							? args.Timezone.Value : null,
						Notes = args.Notes.IsPresent
							? args.Notes.Value : null,
					}
				),
				cancellationToken
			);
		} catch (Exception ex) {
			logger.LogWarning(
				ex,
				"Failed to write audit log for tenant update {TenantId} by staff user {UserId}",
				tenantIdGuid,
				account.UserId
			);
		}

		return TypedResults.Ok(new GetTenantAsStaffResult {
			TenantId = tenant.GetRequiredId(),
			Name = tenant.Name,
			Code = tenant.Code,
			LogoUrl = tenant.LogoUrl,
			MaxUsers = tenant.MaxUsers,
			Status = tenant.Status,
			UsersCount = usersCount,
			LegalName = tenant.LegalName,
			Description = tenant.Description,
			WebsiteUrl = tenant.WebsiteUrl,
			BillingEmail = tenant.BillingEmail,
			SupportEmail = tenant.SupportEmail,
			DefaultLocale = tenant.DefaultLocale,
			Timezone = tenant.Timezone,
			Notes = tenant.Notes,
			LastActivityAt = tenant.LastActivityAt,
			CreatedAt = tenant.CreatedAt,
			UpdatedAt = tenant.UpdatedAt,
		});
	}
}
