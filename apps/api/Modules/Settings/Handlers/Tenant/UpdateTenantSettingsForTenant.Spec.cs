
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Tenants.Services;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Settings.Handlers.Tenant;

// Mutates the shared seeded Acme tenant's settings fields; joins the
// DisableParallelization collection so it never races the other classes that
// touch Acme (TenantAuthFilterSpec, UpdateTenantAsStaffSpec, ...). Restores
// the original values in `finally`.
[Collection("AcmeTenantMutation")]
public sealed class UpdateTenantSettingsForTenantSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UpdateTenantSettingsForTenantSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl() {
		return PathUtils.Join(
			Routes.Tenant.Root,
			Routes.Settings.ForTenant.Root,
			Routes.Settings.ForTenant.UpdateGeneral
		);
	}

	[Fact]
	public async Task
	ItShouldUpdateTheGeneralSettingsAndReturnTheUpdatedValues() {
		var (acmeId, acmeAdminToken, original) =
			await PrepareAcmeAdminAsync();

		try {
			using var request = new HttpRequestMessage(
				HttpMethod.Patch,
				GetUrl()
			)
				.WithSessionToken(acmeAdminToken)
				.WithTenantId(acmeId);

			request.Content = JsonContent.Create(new {
				name = "Acme Corporation Updated",
				logoUrl = "https://cdn.example.test/logo.png",
				legalName = "Acme Corporation SA",
				description = "The updated Acme description",
				websiteUrl = "https://acme.example.com",
				billingEmail = "billing@acme.example.com",
				supportEmail = "support@acme.example.com",
				defaultLocale = "fr",
				timezone = "Europe/Paris",
			});

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var result = await response.Content
				.ReadFromJsonAsync<TenantSettingsGeneralResult>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.Id.Should().Be(acmeId);
			result.Name.Should().Be("Acme Corporation Updated");
			result.LogoUrl.Should().Be("https://cdn.example.test/logo.png");
			result.LegalName.Should().Be("Acme Corporation SA");
			result.Description.Should().Be("The updated Acme description");
			result.WebsiteUrl.Should().Be("https://acme.example.com");
			result.BillingEmail.Should().Be("billing@acme.example.com");
			result.SupportEmail.Should().Be("support@acme.example.com");
			result.DefaultLocale.Should().Be("fr");
			result.Timezone.Should().Be("Europe/Paris");

			var persisted = await GetTenantRowAsync(acmeId);
			persisted.Name.Should().Be("Acme Corporation Updated");
			persisted.LogoUrl.Should().Be("https://cdn.example.test/logo.png");
			persisted.LegalName.Should().Be("Acme Corporation SA");
			persisted.Description.Should().Be("The updated Acme description");
			persisted.WebsiteUrl.Should().Be("https://acme.example.com");
			persisted.BillingEmail.Should().Be("billing@acme.example.com");
			persisted.SupportEmail.Should().Be("support@acme.example.com");
			persisted.DefaultLocale.Should().Be("fr");
			persisted.Timezone.Should().Be("Europe/Paris");
		} finally {
			await RestoreTenantAsync(acmeId, original);
		}
	}

	[Fact]
	public async Task
	ItShouldClearOptionalFieldsAndLeaveAbsentFieldsUntouched() {
		var (acmeId, acmeAdminToken, original) =
			await PrepareAcmeAdminAsync();

		try {
			using var request = new HttpRequestMessage(
				HttpMethod.Patch,
				GetUrl()
			)
				.WithSessionToken(acmeAdminToken)
				.WithTenantId(acmeId);

			request.Content = JsonContent.Create(new {
				description = (string?)null,
				websiteUrl = (string?)null,
			});

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var result = await response.Content
				.ReadFromJsonAsync<TenantSettingsGeneralResult>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			// Absent field = untouched: name was omitted from the PATCH, so it
			// must survive exactly as it was.
			result.Description.Should().BeNull();
			result.WebsiteUrl.Should().BeNull();
			result.Name.Should().Be(original.Name);

			var persisted = await GetTenantRowAsync(acmeId);
			persisted.Description.Should().BeNull();
			persisted.WebsiteUrl.Should().BeNull();
			persisted.Name.Should().Be(original.Name);
		} finally {
			await RestoreTenantAsync(acmeId, original);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestForAnEmptyBody() {
		var (acmeId, acmeAdminToken, _) =
			await PrepareAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl()
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId);

		request.Content = JsonContent.Create(new { });

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.BadRequest);
		problem.Detail.Should().Be("No fields to update");
	}

	[Fact]
	public async Task
	ItShouldRejectStaffOnlyFieldsAndLeaveTheRowUnchanged() {
		// Staff-only fields (code/status/maxUsers/notes) must NOT be writable
		// through the tenant self-service endpoint: a body carrying only
		// staff-only keys must behave like an empty body (400, no write) so
		// the tenant write surface can never silently widen.
		var (acmeId, acmeAdminToken, original) =
			await PrepareAcmeAdminAsync();

		try {
			using var request = new HttpRequestMessage(
				HttpMethod.Patch,
				GetUrl()
			)
				.WithSessionToken(acmeAdminToken)
				.WithTenantId(acmeId);

			request.Content = JsonContent.Create(new {
				maxUsers = 1,
				code = "hacked-code",
				notes = "tenant notes",
			});

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
			var problem = await response.Content
				.ReadFromJsonAsync<AppProblemDetails>();
			problem.Should().NotBeNull();
			Assert.NotNull(problem);
			problem.Detail.Should().Be("No fields to update");

			var persisted = await GetTenantRowAsync(acmeId);
			persisted.Name.Should().Be(original.Name);
			persisted.LogoUrl.Should().Be(original.LogoUrl);
			persisted.LegalName.Should().Be(original.LegalName);
			persisted.Description.Should().Be(original.Description);
			persisted.WebsiteUrl.Should().Be(original.WebsiteUrl);
			persisted.BillingEmail.Should().Be(original.BillingEmail);
			persisted.SupportEmail.Should().Be(original.SupportEmail);
			persisted.DefaultLocale.Should().Be(original.DefaultLocale);
			persisted.Timezone.Should().Be(original.Timezone);
		} finally {
			await RestoreTenantAsync(acmeId, original);
		}
	}

	[Fact]
	public async Task
	ItShouldRejectANameShorterThanFiveCharacters() {
		var (acmeId, acmeAdminToken, _) =
			await PrepareAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl()
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId);

		request.Content = JsonContent.Create(new {
			name = "abc",
		});

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Name");
	}

	[Fact]
	public async Task
	ItShouldRejectAnInvalidWebsiteUrl() {
		var (acmeId, acmeAdminToken, _) =
			await PrepareAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl()
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId);

		request.Content = JsonContent.Create(new {
			websiteUrl = "not-a-url",
		});

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("WebsiteUrl");
	}

	[Fact]
	public async Task
	ItShouldRejectAnInvalidBillingEmail() {
		var (acmeId, acmeAdminToken, _) =
			await PrepareAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl()
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId);

		request.Content = JsonContent.Create(new {
			billingEmail = "not-an-email",
		});

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("BillingEmail");
	}

	[Fact]
	public async Task
	ItShouldRejectAnInvalidDefaultLocale() {
		var (acmeId, acmeAdminToken, _) =
			await PrepareAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl()
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId);

		request.Content = JsonContent.Create(new {
			defaultLocale = "de",
		});

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("DefaultLocale");
	}

	[Fact]
	public async Task
	ItShouldRejectAnInvalidTimezone() {
		var (acmeId, acmeAdminToken, _) =
			await PrepareAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl()
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId);

		request.Content = JsonContent.Create(new {
			timezone = "Mars/Olympus",
		});

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Timezone");
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForANonAdminTenantUserWithoutSettingsEdit() {
		var acmeId = await GetAcmeIdAsync();
		// Round 2: the seeded Acme member holds publishing permissions via the demo
		// profile, but nothing grants settings.* here, so the check must still deny.
		var acmeUserToken = await _authClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl()
		)
			.WithSessionToken(acmeUserToken)
			.WithTenantId(acmeId);

		request.Content = JsonContent.Create(new {
			name = "Acme Corporation Updated",
		});

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldAllowANonAdminTenantUserWithSettingsEditToUpdate() {
		var (acmeId, _, original) =
			await PrepareAcmeAdminAsync();
		var createdProfileIds = new List<Guid>();

		try {
			var profileId = await CreateTenantProfileWithPermissionsAsync(
				acmeId,
				[AppPermissions.Tenant.Settings.EDIT.Key]
			);
			createdProfileIds.Add(profileId);

			await AssignProfileToTenantUserAsync(
				TestConstants.AcmeUserEmail,
				acmeId,
				createdProfileIds
			);

			var acmeUserToken = await _authClient.LoginAsync(
				TestConstants.AcmeUserEmail,
				TestConstants.SeedPassword
			);

			using var request = new HttpRequestMessage(
				HttpMethod.Patch,
				GetUrl()
			)
				.WithSessionToken(acmeUserToken)
				.WithTenantId(acmeId);

			request.Content = JsonContent.Create(new {
				description = "Updated by a non-admin with settings.edit",
			});

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var result = await response.Content
				.ReadFromJsonAsync<TenantSettingsGeneralResult>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.Description.Should()
				.Be("Updated by a non-admin with settings.edit");
		} finally {
			await RestoreTenantAsync(acmeId, original);
			await CleanupTenantProfileArtifactsAsync(createdProfileIds);
		}
	}

	// Same unreachable-through-HTTP reasoning as
	// GetTenantSettingsForTenantSpec.ItShouldReturnNullWhenTheTenantIsMissingOrSuspended:
	// the TenantAuthFilter answers 403 first, so the handler's NotFound branch
	// is covered at the service seam — the NotFound contract the handler maps.
	[Fact]
	public async Task
	ItShouldReturnNotFoundWhenTheTenantIsMissing() {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var service = scope.ServiceProvider
			.GetRequiredService<ITenantAsStaffService>();

		var result = await service.UpdateTenantAsync(
			Guid.NewGuid(),
			new UpdateTenantAsStaffArgs(
				Name: "Acme Corporation Updated",
				LogoUrl: PatchField<string?>.Absent(),
				MaxUsers: null,
				LegalName: PatchField<string?>.Absent(),
				Description: PatchField<string?>.Absent(),
				WebsiteUrl: PatchField<string?>.Absent(),
				BillingEmail: PatchField<string?>.Absent(),
				SupportEmail: PatchField<string?>.Absent(),
				DefaultLocale: PatchField<string?>.Absent(),
				Timezone: PatchField<string?>.Absent(),
				Notes: PatchField<string?>.Absent()
			)
		);

		result.Should().BeOfType<UpdateTenantResult.NotFound>();
	}

	private async Task<(Guid TenantId, string Token, TenantRow Original)>
	PrepareAcmeAdminAsync() {
		var acmeId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var original = await GetTenantRowAsync(acmeId);

		return (acmeId, token, original);
	}

	private async Task<Guid> GetAcmeIdAsync() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<TenantRow> GetTenantRowAsync(Guid tenantId) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		return await dbContext.Tenant
			.AsNoTracking()
			.Where(tenant => tenant.Id == tenantId)
			.Select(tenant => new TenantRow(
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

	private async Task RestoreTenantAsync(
		Guid tenantId,
		TenantRow original
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		await dbContext.Tenant
			.Where(tenant => tenant.Id == tenantId)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(tenant => tenant.Name, original.Name)
				.SetProperty(tenant => tenant.LogoUrl, original.LogoUrl)
				.SetProperty(tenant => tenant.LegalName, original.LegalName)
				.SetProperty(tenant => tenant.Description, original.Description)
				.SetProperty(tenant => tenant.WebsiteUrl, original.WebsiteUrl)
				.SetProperty(tenant => tenant.BillingEmail, original.BillingEmail)
				.SetProperty(tenant => tenant.SupportEmail, original.SupportEmail)
				.SetProperty(tenant => tenant.DefaultLocale, original.DefaultLocale)
				.SetProperty(tenant => tenant.Timezone, original.Timezone)
				.SetProperty(tenant => tenant.UpdatedAt, DateTime.UtcNow));
	}

	private async Task<Guid> CreateTenantProfileWithPermissionsAsync(
		Guid tenantId,
		IEnumerable<string> permissionKeys
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var profile = Profile.CreateTenantProfile(
			tenantId,
			"Tenant Settings General Spec " + Guid.NewGuid().ToString("N")[..8],
			"Created for tenant settings general permission assertions"
		);
		profile.ValidateProfileType();

		_ = await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();

		var profileId = profile.GetRequiredId();

		foreach (var permissionKey in permissionKeys) {
			_ = await dbContext.ProfilePermission.AddAsync(
				new ProfilePermission {
					ProfileId = profileId,
					PermissionKey = permissionKey
				}
			);
		}

		await dbContext.SaveChangesAsync();

		return profileId;
	}

	private async Task AssignProfileToTenantUserAsync(
		string email,
		Guid tenantId,
		IReadOnlyCollection<Guid> profileIds
	) {
		var trimmedEmail = email.Trim();

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenantUserAccounts = await (
			from ua in dbContext.UserAccount
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

		foreach (var profileId in profileIds) {
			_ = await dbContext.UserAccountProfile.AddAsync(
				new UserAccountProfile {
					UserAccountId = tenantUserAccount.Id.Value,
					ProfileId = profileId
				}
			);
		}

		await dbContext.SaveChangesAsync();
	}

	private async Task CleanupTenantProfileArtifactsAsync(
		IReadOnlyCollection<Guid> profileIds
	) {
		if (profileIds.Count == 0) {
			return;
		}

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var profileIdList = profileIds.ToList();

		var linksToRemove = await (
			from uap in dbContext.UserAccountProfile
			where profileIdList.Contains(uap.ProfileId)
			select uap
		).ToListAsync();

		if (linksToRemove.Count > 0) {
			dbContext.ForceHardDeleteRange(linksToRemove);
		}

		var permissionsToRemove = await (
			from pp in dbContext.ProfilePermission
			where profileIdList.Contains(pp.ProfileId)
			select pp
		).ToListAsync();

		if (permissionsToRemove.Count > 0) {
			dbContext.ForceHardDeleteRange(permissionsToRemove);
		}

		var profilesToRemove = (await (
			from p in dbContext.Profile
			select p
		).ToListAsync())
			.Where(profile => profileIdList.Contains(profile.GetRequiredId()))
			.ToList();

		if (profilesToRemove.Count > 0) {
			dbContext.ForceHardDeleteRange(profilesToRemove);
			await dbContext.SaveChangesAsync();
		}
	}

	private sealed record TenantUserAccountLookup(
		Guid? Id,
		string Email
	);

	private sealed record TenantRow(
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
