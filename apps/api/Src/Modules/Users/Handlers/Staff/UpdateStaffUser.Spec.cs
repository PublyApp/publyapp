namespace MainApi.Src.Modules.Users.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class UpdateStaffUserSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UpdateStaffUserSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.UpdateFn(userId)
		);
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonExistentId() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var url = GetUrl(Guid.NewGuid().ToString());

		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { email = "test@example.com" }
		);

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
			HttpMethod.Patch, url
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { email = "test@example.com" }
		);

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
			HttpMethod.Patch, url
		);

		request.Content = JsonContent.Create(
			new { email = "test@example.com" }
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
			HttpMethod.Patch, url
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { email = "test@example.com" }
		);

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
			HttpMethod.Patch, url
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { email = "test@example.com" }
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldUpdateStatusToActive() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		// Get a staff user ID
		var userId = await GetStaffUserIdByEmailAsync(
			_http,
			token,
			TestConstants.StaffUserEmail
		);

		var url = GetUrl(userId);
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { status = "Active" }
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetStaffUserByIdResult>();
		result.Should().NotBeNull();
		result!.Status.Should().Be("Active");
	}

	[Fact]
	public async Task
	ItShouldUpdateStatusToSuspended() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		// Get a staff user ID
		var userId = await GetStaffUserIdByEmailAsync(
			_http,
			token,
			TestConstants.StaffUserEmail
		);

		var url = GetUrl(userId);
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { status = "Suspended" }
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetStaffUserByIdResult>();
		result.Should().NotBeNull();
		result!.Status.Should().Be("Suspended");
	}

	// -- Helper methods --

	private static async Task<string> GetStaffUserIdByEmailAsync(
		HttpClient http,
		string staffToken,
		string email
	) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Find
		) + "?limit=50";

		using var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(staffToken);

		using var response = await http.SendAsync(request);
		response.EnsureSuccessStatusCode();

		var result = await response.Content
			.ReadFromJsonAsync<FindStaffUsersResponse>();
		if (result is null) {
			throw new InvalidOperationException(
				"Failed to deserialize staff user list response"
			);
		}

		var user = result.StaffUsers.FirstOrDefault(
			u => string.Equals(
				u.Email,
				email,
				StringComparison.OrdinalIgnoreCase
			)
		);

		if (user is null) {
			throw new InvalidOperationException(
				$"Staff user with email '{email}' not found"
			);
		}

		return user.Id.ToString();
	}

	// -- Response DTOs --

	private record FindStaffUsersResponse {
		public List<StaffUserItem> StaffUsers { get; init; }
			= [];
		public int Count { get; init; }
	}

	private record StaffUserItem {
		public Guid Id { get; init; }
		public string Email { get; init; } = string.Empty;
		public string? LastName { get; init; }
		public string? FirstName { get; init; }
		public string? AvatarUrl { get; init; }
		public string Status { get; init; } = string.Empty;
		public string Level { get; init; } = string.Empty;
	}
}
