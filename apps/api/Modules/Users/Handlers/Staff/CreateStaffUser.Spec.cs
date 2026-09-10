using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class CreateStaffUserSpec : IClassFixture<ApiFixture> {
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public CreateStaffUserSpec(ApiFixture fixture) {
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundWhenDirectStaffUserCreationIsRequested() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetCreateUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				email = $"direct-staff-{Guid.NewGuid():N}@example.com",
				lastName = "Staff",
				firstName = "Direct",
				sendNotification = false,
			}
		);

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private static string _GetCreateUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Create
		);
	}
}
