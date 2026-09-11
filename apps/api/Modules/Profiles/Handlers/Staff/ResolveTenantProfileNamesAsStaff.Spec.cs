
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
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	// CA1861: hoisted so repeated JsonContent.Create call sites don't re-allocate a
	// constant array per call.
	private static readonly object _SingleUnknownNameBody = new {
		names = new[] { "Anything" },
	};

	public ResolveTenantProfileNamesAsStaffSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _GetUrl(string tenantId) {
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
		var tenantId = await _GetTenantIdAsync();

		using var response = await _Http.PostAsJsonAsync(
			_GetUrl(tenantId.ToString()),
			_SingleUnknownNameBody
		);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var tenantId = await _GetTenantIdAsync();
		var token = await _AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(_SingleUnknownNameBody);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var tenantId = await _GetTenantIdAsync();
		var token = await _AuthClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(_SingleUnknownNameBody);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(HttpMethod.Post, _GetUrl("not-a-guid"))
			.WithSessionToken(token);
		request.Content = JsonContent.Create(_SingleUnknownNameBody);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForMissingNamesField() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { });

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Names");
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForOversizedNamesArray() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();
		var names = Enumerable.Range(1, _MaxProfileNames + 1)
			.Select(index => $"Profile {index}")
			.ToArray();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { names });

		using var response = await _Http.SendAsync(request);
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
		var token = await _AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(_SingleUnknownNameBody);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldResolveExactAndCaseInsensitiveMatchesPerName() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();
		const string uniqueStem = "Resolver";
		var editorName = $"{uniqueStem} Editor {Guid.NewGuid():N}";
		var viewerName = $"{uniqueStem} Viewer {Guid.NewGuid():N}";
		var viewerNameLower = viewerName.Replace(
			"Viewer",
			"viewer",
			StringComparison.Ordinal
		);
		await _CreateTenantProfileAsync(tenantId, editorName);
		await _CreateTenantProfileAsync(tenantId, viewerName);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			names = new[] {
				editorName.ToUpperInvariant(),
				$"  {viewerNameLower}  ",
				"No Such Profile Anywhere",
			},
		});

		using var response = await _Http.SendAsync(request);
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
		byName[$"  {viewerNameLower}  "].ProfileId.Should()
			.Be(await _GetProfileIdByNameAsync(tenantId, viewerName));
		byName[$"  {viewerNameLower}  "].Reason.Should().BeNull();
		byName["No Such Profile Anywhere"].ProfileId.Should().BeNull();
		byName["No Such Profile Anywhere"].Reason.Should().Be("not-found");

		// The resolved id must be the real profile's id.
		byName[editorName.ToUpperInvariant()].ProfileId.Should()
			.Be(await _GetProfileIdByNameAsync(tenantId, editorName));
	}

	/// <summary>
	/// The uniqueness constraint ux_profiles_tenant_name is CASE-SENSITIVE, so "Editor"
	/// and "editor" can coexist as live profiles of one tenant. A case-insensitive
	/// lookup legitimately matches two rows then: the endpoint must report ambiguous
	/// instead of picking one arbitrarily.
	/// </summary>
	[Fact]
	public async Task ItShouldReportAmbiguousWhenTwoLiveProfilesDifferOnlyByCase() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();
		var upperName = $"Editor {Guid.NewGuid():N}";
		var lowerName = upperName.ToLowerInvariant();
		await _CreateTenantProfileAsync(tenantId, upperName);
		await _CreateTenantProfileAsync(tenantId, lowerName);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { names = new[] { upperName } });

		using var response = await _Http.SendAsync(request);
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
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();
		var name = $"Deleted Resolver {Guid.NewGuid():N}";
		var deletedProfileId = await _CreateSoftDeletedTenantProfileAsync(tenantId, name);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { names = new[] { name } });

		using var response = await _Http.SendAsync(request);
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
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var acmeTenantId = await _GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var techStartTenantId = await _GetTenantIdAsync(SeedConstants.Tenants.TechStartName);
		var sharedName = $"Shared Resolver {Guid.NewGuid():N}";
		await _CreateTenantProfileAsync(techStartTenantId, sharedName);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(acmeTenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { names = new[] { sharedName } });

		using var response = await _Http.SendAsync(request);
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
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { names = Array.Empty<string>() });

		using var response = await _Http.SendAsync(request);
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
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();
		var firstName = $"Order A {Guid.NewGuid():N}";
		var secondName = $"Order B {Guid.NewGuid():N}";
		await _CreateTenantProfileAsync(tenantId, firstName);
		await _CreateTenantProfileAsync(tenantId, secondName);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { names = new[] { firstName, secondName, firstName } });

		using var response = await _Http.SendAsync(request);
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
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();
		var name = $"Scope Guard {Guid.NewGuid():N}";

		// Seed a STAFF-scope profile (scope = 0) with the requested name: it shares the
		// profiles table but must never resolve for a tenant route.
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		_ = dbContext.Profile.Add(Profile.CreateStaffProfile(name));
		_ = await dbContext.SaveChangesAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { names = new[] { name } });

		using var response = await _Http.SendAsync(request);
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

	private const int _MaxProfileNames = ResolveTenantProfileNamesAsStaff.MaxNames;

	private async Task<Guid> _GetTenantIdAsync(string? tenantName = null) {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_Http,
			token,
			tenantName ?? SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<Guid> _CreateTenantProfileAsync(Guid tenantId, string name) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
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
	private async Task<Guid> _CreateSoftDeletedTenantProfileAsync(Guid tenantId, string name) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var profile = Profile.CreateTenantProfile(tenantId, name);
		profile.IsDeleted = true;
		profile.DeletedAt = DateTime.UtcNow;

		_ = dbContext.Profile.Add(profile);
		_ = await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	private async Task<Guid?> _GetProfileIdByNameAsync(Guid tenantId, string name) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
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
