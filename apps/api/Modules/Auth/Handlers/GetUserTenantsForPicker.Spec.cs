
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Handlers;

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
		Assert.NotNull(result);
		result.HasSuspendedTenants.Should().BeFalse();
		result.TotalCount.Should().Be(2);
		result.ActiveCount.Should().Be(2);
		result.Tenants.Should().HaveCount(2);
		result.Tenants.Should().AllSatisfy(t => {
			t.Status.Should().Be("Active");
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
			Assert.NotNull(result);
			result.HasSuspendedTenants.Should().BeTrue();
			result.TotalCount.Should().Be(2);
			result.ActiveCount.Should().Be(1);

			var acmeTenant = result.Tenants
				.FirstOrDefault(t => t.Id == acmeId);
			acmeTenant.Should().NotBeNull();
			Assert.NotNull(acmeTenant);
			acmeTenant.Status.Should().Be("Suspended");

			// Other tenant should still be active
			var otherTenants = result.Tenants
				.Where(t => t.Id != acmeId);
			otherTenants.Should().AllSatisfy(t => {
				t.Status.Should().Be("Active");
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
			Assert.NotNull(result);
			result.HasSuspendedTenants.Should()
							.BeFalse();
			result.TotalCount.Should().Be(2);
			result.ActiveCount.Should().Be(2);
			result.Tenants.Should().AllSatisfy(t => {
				t.Status.Should().Be("Active");
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
		Assert.NotNull(result);
		result.TotalCount.Should().Be(1);
		result.ActiveCount.Should().Be(1);
		result.HasSuspendedTenants.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldNotLeakStaffInternalNotesToTenantScope() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using var setNotes =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				acmeId,
				new { notes = "staff-internal-secret-note" }
			);
		setNotes.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
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

			var rawBody = await response.Content
				.ReadAsStringAsync();
			rawBody.Should().NotContain(
				"staff-internal-secret-note"
			);
			rawBody.ToLowerInvariant().Should()
				.NotContain("\"notes\"");
		} finally {
			using var clearNotes =
				await TenantTestHelper.UpdateTenantAsync(
					_http,
					staffToken,
					acmeId,
					new { notes = (string?)null }
				);
		}
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
			.GetRequiredService<AppDbContext>();

		var updatedCount = await dbContext.User
			.Where(u => u.Email == normalizedEmail)
			.ExecuteUpdateAsync(setters => setters
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
	}

	private record PickerResponse {
		public List<PickerTenantItem> Tenants { get; init; }
			= [];
		public int TotalCount { get; init; }
		public int ActiveCount { get; init; }
		public bool HasSuspendedTenants { get; init; }
	}
}
