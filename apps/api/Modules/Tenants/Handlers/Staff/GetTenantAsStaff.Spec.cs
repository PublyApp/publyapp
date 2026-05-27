
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Data.DbContext;
using MainApi.Data.Seeding;
using MainApi.Lib.ProblemResults;
using MainApi.Lib.Routes;
using MainApi.Lib.Testing.Fixtures;
using MainApi.Lib.Testing.Helpers;
using MainApi.Lib.Utils;
using MainApi.Modules.Auth.Utils;
using MainApi.Modules.Tenants.Entities;
using MainApi.Modules.Users.Entities;

using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace MainApi.Modules.Tenants.Handlers.Staff;
public sealed class GetTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetTenantAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.GetByIdFn(tenantId)
		);
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonExistentId() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var url = GetUrl(Guid.NewGuid().ToString());

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestForMalformedId() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var url = GetUrl("not-a-guid");

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSession() {
		var url = GetUrl(Guid.NewGuid().ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForNonStaffUser() {
		var token =
			await _authClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);

		var url = GetUrl(Guid.NewGuid().ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token =
			await _authClient.LoginAsync(
				TestConstants.StaffUserEmail,
				TestConstants.SeedPassword
			);

		var url = GetUrl(Guid.NewGuid().ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnActiveTenantWithEnrichedFields() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantWithUsersAsync(
				"Tenant Get Enriched",
				usersCount: 2
			);

		var url = GetUrl(seededTenant.TenantId.ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"GET tenant response was empty."
			);
		}

		result.TenantId.Should()
			.Be(seededTenant.TenantId);
		result.Name.Should()
			.Be(seededTenant.Name);
		result.Code.Should()
			.Be(seededTenant.Code);
		result.LogoUrl.Should()
			.Be(seededTenant.LogoUrl);
		result.MaxUsers.Should()
			.Be(seededTenant.MaxUsers);
		result.Status.Should()
			.Be(nameof(TenantStatus.Active));
		result.UsersCount.Should()
			.Be(2);
		result.CreatedAt.Should()
			.BeCloseTo(seededTenant.CreatedAt, TimeSpan.FromSeconds(1));
		result.UpdatedAt.Should()
			.BeCloseTo(seededTenant.UpdatedAt, TimeSpan.FromSeconds(1));
	}

	[Fact]
	public async Task
	ItShouldReturnTenantWhenSuspended() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Suspend the tenant
		using var suspendResponse =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, tenantId
			);
		suspendResponse.EnsureSuccessStatusCode();

		try {
			// GET the suspended tenant as staff
			var url = GetUrl(tenantId.ToString());
			var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<
					GetTenantAsStaffResult
				>();
			result.Should().NotBeNull();
			result!.TenantId.Should().Be(tenantId);
			result.Code.Should().NotBeNullOrEmpty();
			result.Status.Should().Be("Suspended");
			result.MaxUsers.Should().BeGreaterThan(0);
		} finally {
			try {
				using var cleanup =
					await TenantTestHelper
						.ReactivateTenantAsync(
							_http, staffToken, tenantId
						);
			} catch {
				// Ignore — cleanup best-effort
			}
		}
	}

	private async Task<SeededTenantSnapshot>
	SeedTenantWithUsersAsync(
		string namePrefix,
		int usersCount
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var tenant = new Tenant {
			Name = $"{namePrefix} {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			LogoUrl = "https://example.com/tenant-logo.png",
			Status = TenantStatus.Active,
			MaxUsers = usersCount + 5,
		};

		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		var tenantId = tenant.GetRequiredId();
		for (var i = 0; i < usersCount; i++) {
			var user = new User {
				Email = $"tenant-get-user-{Guid.NewGuid():N}@example.com",
				Password = PasswordUtils.HashPassword(
					TestConstants.SeedPassword
				),
				FirstName = "Tenant",
				LastName = $"User {i}",
				Status = UserStatus.Active,
				IsVerified = true,
			};

			await dbContext.User.AddAsync(user);
			await dbContext.SaveChangesAsync();

			await dbContext.UserAccount.AddAsync(
				UserAccount.CreateTenantAccount(
					user.GetRequiredId(),
					tenantId
				)
			);
		}

		await dbContext.SaveChangesAsync();

		return new SeededTenantSnapshot(
			TenantId: tenantId,
			Name: tenant.Name,
			Code: tenant.Code,
			LogoUrl: tenant.LogoUrl,
			MaxUsers: tenant.MaxUsers,
			CreatedAt: tenant.CreatedAt,
			UpdatedAt: tenant.UpdatedAt
		);
	}

	private sealed record SeededTenantSnapshot(
		Guid TenantId,
		string Name,
		string Code,
		string? LogoUrl,
		int MaxUsers,
		DateTime CreatedAt,
		DateTime UpdatedAt
	);
}
