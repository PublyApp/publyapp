namespace MainApi.Src.Modules.Auth.Handlers;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;

using Xunit;

public sealed class GetRedirectCodeSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetRedirectCodeSpec(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnTenantPickerWhenNoSuspended() {
		// Alice has 2 active tenants -> tenant-picker
		var aliceToken = await _authClient.LoginAsync(
			TestConstants.AliceEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetRedirectCode
		).WithSessionToken(aliceToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<RedirectCodeResponse>();
		result.Should().NotBeNull();
		result!.HasSuspendedTenants.Should().BeFalse();
		result.RedirectCode.Should().Be("tenant-picker");
	}

	[Fact]
	public async Task
	ItShouldRedirectToTenantWithActiveHint() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var aliceToken = await _authClient.LoginAsync(
			TestConstants.AliceEmail,
			TestConstants.SeedPassword
		);

		var url = $"{Routes.Auth.GetRedirectCode}"
			+ $"?tenantId={acmeId}";
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(aliceToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<RedirectCodeResponse>();
		result.Should().NotBeNull();
		result!.RedirectCode.Should()
			.Be(acmeId.ToString());
		result.HasSuspendedTenants.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldFallThroughOnInvalidGuidHint() {
		var aliceToken = await _authClient.LoginAsync(
			TestConstants.AliceEmail,
			TestConstants.SeedPassword
		);

		var url = $"{Routes.Auth.GetRedirectCode}"
			+ "?tenantId=not-a-guid";
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(aliceToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<RedirectCodeResponse>();
		result.Should().NotBeNull();
		// Falls through to selection -> tenant-picker
		result!.RedirectCode.Should().Be("tenant-picker");
	}

	[Fact]
	public async Task
	ItShouldSetHasSuspendedTrueWhenOneSuspended() {
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
			var aliceToken = await _authClient.LoginAsync(
				TestConstants.AliceEmail,
				TestConstants.SeedPassword
			);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				Routes.Auth.GetRedirectCode
			).WithSessionToken(aliceToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<RedirectCodeResponse>();
			result.Should().NotBeNull();
			result!.HasSuspendedTenants.Should().BeTrue();
			// 1 active tenant left -> direct redirect
			var techStartId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.TechStartName
					);
			result.RedirectCode.Should()
				.Be(techStartId.ToString());
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
	ItShouldFallThroughWhenHintPointsToSuspended() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var techStartId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.TechStartName
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

			// Hint to the suspended tenant
			var url = $"{Routes.Auth.GetRedirectCode}"
				+ $"?tenantId={acmeId}";
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				url
			).WithSessionToken(aliceToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<RedirectCodeResponse>();
			result.Should().NotBeNull();
			// Hint invalid -> 1 active tenant -> direct
			result!.RedirectCode.Should()
				.Be(techStartId.ToString());
			result.HasSuspendedTenants.Should().BeTrue();
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
	ItShouldRedirectWhenHintIsActiveWithOtherSuspended() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var techStartId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.TechStartName
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

			// Hint to the active tenant
			var url = $"{Routes.Auth.GetRedirectCode}"
				+ $"?tenantId={techStartId}";
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				url
			).WithSessionToken(aliceToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<RedirectCodeResponse>();
			result.Should().NotBeNull();
			result!.RedirectCode.Should()
				.Be(techStartId.ToString());
			result.HasSuspendedTenants.Should().BeTrue();
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
	ItShouldReturnTenantPickerWhenAllSuspended() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var techStartId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);

		// Suspend both tenants
		using var s1 =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, acmeId
			);
		s1.StatusCode.Should().Be(HttpStatusCode.OK);
		using var s2 =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, techStartId
			);
		s2.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			var aliceToken =
				await _authClient.LoginAsync(
					TestConstants.AliceEmail,
					TestConstants.SeedPassword
				);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				Routes.Auth.GetRedirectCode
			).WithSessionToken(aliceToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<RedirectCodeResponse>();
			result.Should().NotBeNull();
			result!.RedirectCode.Should()
				.Be("tenant-picker");
			result.HasSuspendedTenants.Should().BeTrue();
		} finally {
			using var r1 =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_http, staffToken, acmeId
					);
			using var r2 =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_http, staffToken, techStartId
					);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnStaffForStaffUser() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetRedirectCode
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<RedirectCodeResponse>();
		result.Should().NotBeNull();
		result!.RedirectCode.Should().Be("staff");
	}

	[Fact]
	public async Task
	ItShouldDirectRedirectForSingleActiveTenant() {
		// Acme admin has 1 tenant -> direct redirect
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetRedirectCode
		).WithSessionToken(acmeAdminToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<RedirectCodeResponse>();
		result.Should().NotBeNull();
		result!.RedirectCode.Should()
			.Be(acmeId.ToString());
		result.HasSuspendedTenants.Should().BeFalse();
	}

	private record RedirectCodeResponse {
		public string RedirectCode { get; init; }
			= string.Empty;
		public bool HasSuspendedTenants { get; init; }
	}
}
