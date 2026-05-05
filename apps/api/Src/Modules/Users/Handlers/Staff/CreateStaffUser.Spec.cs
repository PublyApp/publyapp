using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;

using Xunit;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public sealed class CreateStaffUserSpec : IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public CreateStaffUserSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundWhenDirectStaffUserCreationIsRequested() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetCreateUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				email = $"direct-staff-{Guid.NewGuid():N}@example.com",
				lastName = "Staff",
				firstName = "Direct",
				sendNotification = false,
			}
		);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private static string GetCreateUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Create
		);
	}
}
