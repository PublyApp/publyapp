namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class BulkSuspendTenantsAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	private sealed class BulkSuspendTenantsResponse {
		public required int SucceededCount { get; init; }
		public required int FailedCount { get; init; }
	}

	public BulkSuspendTenantsAsStaffSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldReturnOkForValidBulkSuspendRequest() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Tenants.ForStaff.Root,
				Routes.Tenants.ForStaff.BulkSuspend
			)
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(new {
			tenantIds = new[] { tenantId },
		});

		using var response =
			await _http.SendAsync(request);

		try {
			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<BulkSuspendTenantsResponse>();
			result.Should().NotBeNull();
			result!.SucceededCount.Should().Be(1);
			result.FailedCount.Should().Be(0);
		} finally {
			try {
				using var cleanup =
					await TenantTestHelper
						.ReactivateTenantAsync(
							_http, staffToken, tenantId
						);
			} catch {
				// Ignore cleanup failures so they do not mask the real assertion.
			}
		}
	}
}
