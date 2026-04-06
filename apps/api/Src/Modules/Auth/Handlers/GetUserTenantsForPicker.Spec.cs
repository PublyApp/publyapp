namespace MainApi.Src.Modules.Auth.Handlers;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class GetUserTenantsForPickerSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetUserTenantsForPickerSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnCorrectTenantsWhenAllActive() {
		var aliceToken = await _authClient.LoginAsync(
			TestConstants.AliceEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetUserTenantsForPicker
		).WithSessionToken(aliceToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<PickerResponse>();
		result.Should().NotBeNull();
		result!.HasSuspendedTenants.Should().BeFalse();
		result.TotalCount.Should().Be(2);
		result.ActiveCount.Should().Be(2);
		result.Tenants.Should().HaveCount(2);
		result.Tenants.Should().AllSatisfy(t => {
			t.IsActive.Should().BeTrue();
			t.IsSuspended.Should().BeFalse();
		});
	}

	[Fact]
	public async Task
	ItShouldFlagSuspendedStateWhenOneSuspended() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Suspend Acme
		using var suspend =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, acmeId
			);
		suspend.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			var aliceToken =
				await _authClient.LoginAsync(
					TestConstants.AliceEmail,
					TestConstants.SeedPassword
				);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				Routes.Auth.GetUserTenantsForPicker
			).WithSessionToken(aliceToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<PickerResponse>();
			result.Should().NotBeNull();
			result!.HasSuspendedTenants.Should().BeTrue();
			result.TotalCount.Should().Be(2);
			result.ActiveCount.Should().Be(1);

			var acmeTenant = result.Tenants
				.FirstOrDefault(t => t.Id == acmeId);
			acmeTenant.Should().NotBeNull();
			acmeTenant!.IsSuspended.Should().BeTrue();
			acmeTenant.IsActive.Should().BeFalse();

			// Other tenant should still be active
			var otherTenants = result.Tenants
				.Where(t => t.Id != acmeId);
			otherTenants.Should().AllSatisfy(t => {
				t.IsSuspended.Should().BeFalse();
				t.IsActive.Should().BeTrue();
			});
		} finally {
			using var cleanup =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_http, staffToken, acmeId
					);
		}
	}

	[Fact]
	public async Task
	ItShouldShowAllActiveAfterReactivation() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Suspend
		using var suspend =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, acmeId
			);
		suspend.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			// Reactivate
			using var reactivate =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_http, staffToken, acmeId
					);
			reactivate.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var aliceToken =
				await _authClient.LoginAsync(
					TestConstants.AliceEmail,
					TestConstants.SeedPassword
				);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				Routes.Auth.GetUserTenantsForPicker
			).WithSessionToken(aliceToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<PickerResponse>();
			result.Should().NotBeNull();
			result!.HasSuspendedTenants.Should()
				.BeFalse();
			result.TotalCount.Should().Be(2);
			result.ActiveCount.Should().Be(2);
			result.Tenants.Should().AllSatisfy(t => {
				t.IsActive.Should().BeTrue();
				t.IsSuspended.Should().BeFalse();
			});
		} finally {
			// Safety net if reactivate didn't run
			try {
				using var cleanup =
					await TenantTestHelper
						.ReactivateTenantAsync(
							_http, staffToken, acmeId
						);
			} catch {
				// Ignore — tenant may already be active
			}
		}
	}

	[Fact]
	public async Task
	ItShouldReturnOneActiveForSingleTenantUser() {
		// Acme admin has only 1 tenant
		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetUserTenantsForPicker
		).WithSessionToken(acmeAdminToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<PickerResponse>();
		result.Should().NotBeNull();
		result!.TotalCount.Should().Be(1);
		result.ActiveCount.Should().Be(1);
		result.HasSuspendedTenants.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedForGloballySuspendedUser() {
		var aliceToken = await _authClient.LoginAsync(
			TestConstants.AliceEmail,
			TestConstants.SeedPassword
		);

		await SetUserSuspendedByEmailAsync(
			TestConstants.AliceEmail,
			isSuspended: true
		);

		try {
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				Routes.Auth.GetUserTenantsForPicker
			).WithSessionToken(aliceToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.Unauthorized);
		} finally {
			await SetUserSuspendedByEmailAsync(
				TestConstants.AliceEmail,
				isSuspended: false
			);
		}
	}

	private async Task SetUserSuspendedByEmailAsync(
		string email,
		bool isSuspended
	) {
		var normalizedEmail = email.Trim().ToLowerInvariant();

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var updatedCount = await dbContext.User
			.Where(u => u.Email == normalizedEmail)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(u => u.IsSuspended, isSuspended)
				.SetProperty(
					u => u.Status,
					isSuspended
						? UserStatus.Suspended
						: UserStatus.Active
				)
				.SetProperty(u => u.UpdatedAt, DateTime.UtcNow));

		updatedCount.Should().Be(1);
	}

	private record PickerTenantItem {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public string Code { get; init; } = string.Empty;
		public string Status { get; init; } = string.Empty;
		public bool IsSuspended { get; init; }
		public bool IsActive { get; init; }
	}

	private record PickerResponse {
		public List<PickerTenantItem> Tenants { get; init; }
			= [];
		public int TotalCount { get; init; }
		public int ActiveCount { get; init; }
		public bool HasSuspendedTenants { get; init; }
	}
}
