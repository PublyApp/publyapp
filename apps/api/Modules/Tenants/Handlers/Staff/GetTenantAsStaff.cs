using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Invitations.Services;
using PublyApp.Api.Modules.Profiles.Services;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Tenants.Services;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

public class GetTenantAsStaffResult {
	public Guid TenantId { get; set; }
	public string Name { get; set; } = string.Empty;
	public string Code { get; set; } = string.Empty;
	public string? LogoUrl { get; set; }
	public int MaxUsers { get; set; }
	public TenantStatus Status { get; set; }
	public int UsersCount { get; set; }
	public int OwnersCount { get; set; }
	public int PendingInvitationsCount { get; set; }
	public int ExpiringSoonInvitationsCount { get; set; }
	public int ProfilesCount { get; set; }
	public string? LegalName { get; set; }
	public string? Description { get; set; }
	public string? WebsiteUrl { get; set; }
	public string? BillingEmail { get; set; }
	public string? SupportEmail { get; set; }
	public string? DefaultLocale { get; set; }
	public string? Timezone { get; set; }
	// Staff-internal only — never expose on tenant-scope responses.
	public string? Notes { get; set; }
	public DateTime? LastActivityAt { get; set; }
	public DateTime CreatedAt { get; set; }
	public DateTime UpdatedAt { get; set; }
}

public sealed class GetTenantAsStaff {
	public static async Task<
		Results<
			Ok<GetTenantAsStaffResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult
		>
	> Handle(
		[FromRoute] string tenantId,
		[FromServices] ITenantAsStaffService tenantAsStaffService,
		[FromServices] IInvitationQueryService invitationQueryService,
		[FromServices]
			ITenantProfileQueryAsStaffService tenantProfileQueryAsStaffService,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenant ID",
				ResponseKeys.MalformedId
			);
		}

		var tenant =
			await tenantAsStaffService.GetTenantByIdForStaffAsync(
				tenantIdGuid, cancellationToken
			);

		if (tenant is null) {
			return TypedProblems.NotFound(
				"Tenant not found",
				ResponseKeys.NotFound
			);
		}

		var usersCount = await tenantAsStaffService
			.CountTenantUsersAsync(
				tenantIdGuid, cancellationToken
			);
		var ownersCount = await tenantAsStaffService
			.CountTenantOwnersAsync(
				tenantIdGuid, cancellationToken
			);
		var invitationCounts = await invitationQueryService
			.CountTenantInvitationsAsync(
				tenantIdGuid, cancellationToken
			);
		var profilesCount = await tenantProfileQueryAsStaffService
			.CountTenantProfilesAsync(
				tenantIdGuid, cancellationToken
			);

		return TypedResults.Ok(new GetTenantAsStaffResult {
			TenantId = tenant.GetRequiredId(),
			Name = tenant.Name,
			Code = tenant.Code,
			LogoUrl = tenant.LogoUrl,
			MaxUsers = tenant.MaxUsers,
			Status = tenant.Status,
			UsersCount = usersCount,
			OwnersCount = ownersCount,
			PendingInvitationsCount = invitationCounts.Pending,
			ExpiringSoonInvitationsCount = invitationCounts.ExpiringSoon,
			ProfilesCount = profilesCount,
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
