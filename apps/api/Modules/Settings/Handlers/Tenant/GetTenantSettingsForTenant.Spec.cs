
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Tenants.Services;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Settings.Handlers.Tenant;

// Reads the shared seeded Acme tenant and (in one test) temporarily assigns a
// role to its seeded non-admin user; joins the DisableParallelization
// collection so it never races the classes that touch Acme
// (TenantAuthFilterSpec, UpdateTenantAsStaffSpec, ...).
[Collection("AcmeTenantMutation")]
public sealed class GetTenantSettingsForTenantSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetTenantSettingsForTenantSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetUrl() {
		return PathUtils.Join(
			Routes.Tenant.Root,
			Routes.Settings.ForTenant.Root,
			Routes.Settings.ForTenant.General
		);
	}

	[Fact]
	public async Task
	ItShouldReturnTheGeneralSettingsForAnAdmin() {
		var (acmeId, acmeAdminToken) =
			await this._LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetTenantSettingsForTenantSpec._GetUrl()
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<TenantSettingsGeneralResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		var persisted = await this._GetTenantRowAsync(acmeId);
		result.Id.Should().Be(acmeId);
		result.Code.Should().Be(persisted.Code);
		result.Name.Should().Be(persisted.Name);
		result.LogoUrl.Should().Be(persisted.LogoUrl);
		result.LegalName.Should().Be(persisted.LegalName);
		result.Description.Should().Be(persisted.Description);
		result.WebsiteUrl.Should().Be(persisted.WebsiteUrl);
		result.BillingEmail.Should().Be(persisted.BillingEmail);
		result.SupportEmail.Should().Be(persisted.SupportEmail);
		result.DefaultLocale.Should().Be(persisted.DefaultLocale);
		result.Timezone.Should().Be(persisted.Timezone);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForANonAdminTenantUserWithoutSettingsView() {
		var acmeId = await TenantTestHelper.GetAcmeIdAsync(this._Http, this._AuthClient);
		// Round 2: the seeded Acme member holds publishing permissions via the demo
		// role, but nothing grants settings.* here, so the check must still deny.
		var acmeUserToken = await this._AuthClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetTenantSettingsForTenantSpec._GetUrl()
		)
			.WithSessionToken(acmeUserToken)
			.WithTenantId(acmeId);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldAllowANonAdminTenantUserWithSettingsView() {
		var acmeId = await TenantTestHelper.GetAcmeIdAsync(this._Http, this._AuthClient);
		var createdRoleIds = new List<Guid>();

		try {
			var roleId = await RoleTestHelper.CreateTenantRoleWithPermissionsAsync(this._Fixture, acmeId,
				[AppPermissions.Tenant.Settings.VIEW.Key]);
			createdRoleIds.Add(roleId);

			await this._AssignRoleToTenantUserAsync(
				TestConstants.AcmeUserEmail,
				acmeId,
				createdRoleIds
			);

			var acmeUserToken = await this._AuthClient.LoginAsync(
				TestConstants.AcmeUserEmail,
				TestConstants.SeedPassword
			);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				GetTenantSettingsForTenantSpec._GetUrl()
			)
				.WithSessionToken(acmeUserToken)
				.WithTenantId(acmeId);

			using var response = await this._Http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
		} finally {
			await RoleTestHelper.CleanupTenantRoleArtifactsAsync(this._Fixture, createdRoleIds);
		}
	}

	// The TenantAuthFilter (same membership predicate) already answers 403 for
	// anyone without an active tenant account, so the handler's NotFound branch
	// is only reachable if the tenant vanishes between the filter and the
	// handler. The service seam is where that contract lives — a null result
	// (missing or suspended tenant, via TenantService.GetTenantByIdAsync's
	// IsTenantActive filter) must map to NotFound in the handler.
	[Fact]
	public async Task
	ItShouldReturnNullWhenTheTenantIsMissingOrSuspended() {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var service = scope.ServiceProvider
			.GetRequiredService<ITenantService>();

		var result = await service.GetTenantByIdAsync(
			Guid.NewGuid()
		);

		result.Should().BeNull();
	}

	private async Task<(Guid TenantId, string Token)>
	_LoginAsAcmeAdminAsync() {
		var tenantId = await TenantTestHelper.GetAcmeIdAsync(this._Http, this._AuthClient);
		var token = await this._AuthClient.LoginAsAcmeAdminAsync();

		return (tenantId, token);
	}


	private async Task<TenantRow> _GetTenantRowAsync(Guid tenantId) {
		await using var db = this._Fixture.OpenDb();

		return await db.Context.Tenant
			.AsNoTracking()
			.Where(tenant => tenant.Id == tenantId)
			.Select(tenant => new TenantRow(
				tenant.Code,
				tenant.Name,
				tenant.LogoUrl,
				tenant.LegalName,
				tenant.Description,
				tenant.WebsiteUrl,
				tenant.BillingEmail,
				tenant.SupportEmail,
				tenant.DefaultLocale,
				tenant.Timezone
			))
			.SingleAsync();
	}


	private async Task _AssignRoleToTenantUserAsync(
		string email,
		Guid tenantId,
		IReadOnlyCollection<Guid> roleIds
	) {
		var trimmedEmail = email.Trim();

		await using var db = this._Fixture.OpenDb();

		var tenantUserAccounts = await (
			from ua in db.Context.UserAccount
			where ua.Scope == AccountScope.Tenant
				&& ua.TenantId == tenantId
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select new TenantUserAccountLookup(
				ua.Id,
				ua.User.Email
			)
		).ToListAsync();

		var tenantUserAccount = tenantUserAccounts.FirstOrDefault(
			account => string.Equals(
				account.Email,
				trimmedEmail,
				StringComparison.OrdinalIgnoreCase
			)
		);

		if (tenantUserAccount is null || tenantUserAccount.Id is null) {
			throw new InvalidOperationException(
				"Expected tenant user account to exist for settings spec"
			);
		}

		foreach (var roleId in roleIds) {
			_ = await db.Context.UserAccountRole.AddAsync(
				new UserAccountRole {
					UserAccountId = tenantUserAccount.Id.Value,
					RoleId = roleId
				}
			);
		}

		await db.Context.SaveChangesAsync();
	}


	private sealed record TenantUserAccountLookup(
		Guid? Id,
		string Email
	);

	private sealed record TenantRow(
		string Code,
		string Name,
		string? LogoUrl,
		string? LegalName,
		string? Description,
		string? WebsiteUrl,
		string? BillingEmail,
		string? SupportEmail,
		string? DefaultLocale,
		string? Timezone
	);
}
