
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Profiles.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

/// <summary>
/// Specs for the tenant profile name-resolution endpoint used by the invite
/// drawer's CSV/Excel import (#979): POST a list of profile names, get one
/// resolution per name. The lookup is case-insensitive over live scope-1
/// non-deleted profiles; more than one case-insensitive match is reported as
/// ambiguous rather than silently picking one (the unique index
/// ux_profiles_tenant_name is case-sensitive, so "Editor" and "editor" can both
/// exist live — that spec seeds exactly that pair to prove it).
/// </summary>
public sealed class ResolveTenantProfileNamesAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	// CA1861: hoisted so repeated JsonContent.Create call sites don't re-allocate a
	// constant array per call.
	private static readonly object SingleUnknownNameBody = new {
		names = new[] { "Anything" },
	};

	public ResolveTenantProfileNamesAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.ResolveNames
		);
	}

	// ---------------------------------------------------------------------------------------
	// Authorization / malformed input
	// ---------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await GetTenantIdAsync();

		using var response = await _http.PostAsJsonAsync(
			GetUrl(tenantId.ToString()),
			SingleUnknownNameBody
		);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var tenantId = await GetTenantIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(SingleUnknownNameBody);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var tenantId = await GetTenantIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(SingleUnknownNameBody);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(HttpMethod.Post, GetUrl("not-a-guid"))
			.WithSessionToken(token);
		request.Content = JsonContent.Create(SingleUnknownNameBody);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForMissingNamesField() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Names");
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForOversizedNamesArray() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var names = Enumerable.Range(1, MaxProfileNames + 1)
			.Select(index => $"Profile {index}")
			.ToArray();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { names });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Keys.Should().Contain(key => key.StartsWith("Names"));
	}

	// ---------------------------------------------------------------------------------------
	// Resolution behaviour
	// ---------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldReturnNotFoundForMissingTenant() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(SingleUnknownNameBody);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldResolveExactAndCaseInsensitiveMatchesPerName() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		const string uniqueStem = "Resolver";
		var editorName = $"{uniqueStem} Editor {Guid.NewGuid():N}";
		var viewerName = $"{uniqueStem} Viewer {Guid.NewGuid():N}";
		await CreateTenantProfileAsync(tenantId, editorName);
		await CreateTenantProfileAsync(tenantId, viewerName);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			names = new[] { editorName.ToUpperInvariant(), $"  {viewerName.ToLowerInvariant()}  ", "No Such Profile Anywhere" },
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content
			.ReadFromJsonAsync<ResolveTenantProfileNamesAsStaffResult>(
				options: new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
			);
		payload.Should().NotBeNull();
		Assert.NotNull(payload);

		var byName = payload.Names.ToDictionary(item => item.Name, item => item);
		byName[editorName.ToUpperInvariant()].ProfileId.Should().NotBeNull();
		byName[editorName.ToUpperInvariant()].Reason.Should().BeNull();
		byName[$"  {viewerName.ToLowerInvariant()}  "].ProfileId.Should()
			.Be(await GetProfileIdByNameAsync(tenantId, viewerName));
		byName[$"  {viewerName.ToLowerInvariant()}  "].Reason.Should().BeNull();
		byName["No Such Profile Anywhere"].ProfileId.Should().BeNull();
		byName["No Such Profile Anywhere"].Reason.Should().Be("not-found");

		// The resolved id must be the real profile's id.
		byName[editorName.ToUpperInvariant()].ProfileId.Should()
			.Be(await GetProfileIdByNameAsync(tenantId, editorName));
	}

	/// <summary>
	/// The uniqueness constraint ux_profiles_tenant_name is CASE-SENSITIVE, so "Editor"
	/// and "editor" can coexist as live profiles of one tenant. A case-insensitive
	/// lookup legitimately matches two rows then: the endpoint must report ambiguous
	/// instead of picking one arbitrarily.
	/// </summary>
	[Fact]
	public async Task ItShouldReportAmbiguousWhenTwoLiveProfilesDifferOnlyByCase() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var upperName = $"Editor {Guid.NewGuid():N}";
		var lowerName = upperName.ToLowerInvariant();
		await CreateTenantProfileAsync(tenantId, upperName);
		await CreateTenantProfileAsync(tenantId, lowerName);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { names = new[] { upperName } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content
			.ReadFromJsonAsync<ResolveTenantProfileNamesAsStaffResult>(
				options: new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
			);
		payload.Should().NotBeNull();
		Assert.NotNull(payload);

		var match = payload.Names.Should().ContainSingle(item => item.Name == upperName).Subject;
		match.ProfileId.Should().BeNull();
		match.Reason.Should().Be("ambiguous");
	}

	[Fact]
	public async Task ItShouldIgnoreSoftDeletedProfilesWhenResolving() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var name = $"Deleted Resolver {Guid.NewGuid():N}";
		var deletedProfileId = await CreateSoftDeletedTenantProfileAsync(tenantId, name);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { names = new[] { name } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content
			.ReadFromJsonAsync<ResolveTenantProfileNamesAsStaffResult>(
				options: new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
			);
		payload.Should().NotBeNull();
		Assert.NotNull(payload);

		var match = payload.Names.Should().ContainSingle(item => item.Name == name).Subject;
		match.Reason.Should().Be("not-found");
		match.ProfileId.Should().BeNull();
		match.ProfileId.Should().NotBe(deletedProfileId);
	}

	/// <summary>
	/// Tenant isolation: another tenant's identically-named profile must never resolve.
	/// </summary>
	[Fact]
	public async Task ItShouldNotResolveAnotherTenantsIdenticallyNamedProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var acmeTenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var techStartTenantId = await GetTenantIdAsync(SeedConstants.Tenants.TechStartName);
		var sharedName = $"Shared Resolver {Guid.NewGuid():N}";
		await CreateTenantProfileAsync(techStartTenantId, sharedName);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(acmeTenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { names = new[] { sharedName } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content
			.ReadFromJsonAsync<ResolveTenantProfileNamesAsStaffResult>(
				options: new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
			);
		payload.Should().NotBeNull();
		Assert.NotNull(payload);

		var match = payload.Names.Should().ContainSingle(item => item.Name == sharedName).Subject;
		match.ProfileId.Should().BeNull();
		match.Reason.Should().Be("not-found");
	}

	[Fact]
	public async Task ItShouldReturnEmptyResolutionsForAnEmptyNamesArray() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { names = Array.Empty<string>() });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content
			.ReadFromJsonAsync<ResolveTenantProfileNamesAsStaffResult>(
				options: new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
			);
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Names.Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldEchoEachRequestedNameOnceInRequestOrder() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var firstName = $"Order A {Guid.NewGuid():N}";
		var secondName = $"Order B {Guid.NewGuid():N}";
		await CreateTenantProfileAsync(tenantId, firstName);
		await CreateTenantProfileAsync(tenantId, secondName);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { names = new[] { firstName, secondName, firstName } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content
			.ReadFromJsonAsync<ResolveTenantProfileNamesAsStaffResult>(
				options: new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
			);
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Names.Select(item => item.Name)
			.Should().Equal(firstName, secondName, firstName);
		payload.Names.Count(item => item.Reason is null).Should().Be(3);
	}

	[Fact]
	public async Task ItShouldNotTreatAStaffScopedProfileOfTheSameNameAsATenantMatch() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var name = $"Scope Guard {Guid.NewGuid():N}";

		// Seed a STAFF-scope profile (scope = 0) with the requested name: it shares the
		// profiles table but must never resolve for a tenant route.
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		_ = dbContext.Profile.Add(Profile.CreateStaffProfile(name));
		_ = await dbContext.SaveChangesAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { names = new[] { name } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content
			.ReadFromJsonAsync<ResolveTenantProfileNamesAsStaffResult>(
				options: new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
			);
		payload.Should().NotBeNull();
		Assert.NotNull(payload);

		var match = payload.Names.Should().ContainSingle(item => item.Name == name).Subject;
		match.ProfileId.Should().BeNull();
		match.Reason.Should().Be("not-found");
	}

	// ---------------------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------------------

	private const int MaxProfileNames = ResolveTenantProfileNamesAsStaff.MaxNames;

	private async Task<Guid> GetTenantIdAsync(string? tenantName = null) {
		var token = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			token,
			tenantName ?? SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<Guid> CreateTenantProfileAsync(Guid tenantId, string name) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var profile = Profile.CreateTenantProfile(
			tenantId,
			name: name,
			description: "Profile created for ResolveTenantProfileNamesAsStaffSpec"
		);
		profile.ValidateProfileType();

		_ = dbContext.Profile.Add(profile);
		_ = await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	/// <summary>
	/// Soft-deletes a tenant profile directly via the DbContext so resolution can prove it
	/// only ever matches live rows (the unique index filter permits a soft-deleted row to
	/// share a name with a live one).
	/// </summary>
	private async Task<Guid> CreateSoftDeletedTenantProfileAsync(Guid tenantId, string name) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var profile = Profile.CreateTenantProfile(tenantId, name);
		profile.IsDeleted = true;
		profile.DeletedAt = DateTime.UtcNow;

		_ = dbContext.Profile.Add(profile);
		_ = await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	private async Task<Guid?> GetProfileIdByNameAsync(Guid tenantId, string name) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.Profile
			.Where(profile =>
				profile.TenantId == tenantId
				&& profile.Name == name
				&& !profile.IsDeleted
			)
			.Select(profile => profile.Id)
			.FirstOrDefaultAsync(cancellationToken: default);
	}
}
