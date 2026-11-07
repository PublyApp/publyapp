
using System.Net;
using System.Net.Http.Json;
using System.Text;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Roles.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class UpdateStaffRoleSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public UpdateStaffRoleSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetCreateRoleUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.Create
		);
	}

	private static string _GetUpdateRoleUrl(string roleId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.UpdateFn(roleId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateStaffRoleSpec._GetUpdateRoleUrl(Guid.NewGuid().ToString())
		);
		request.Content = JsonContent.Create(new { name = "Any name" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateStaffRoleSpec._GetUpdateRoleUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "Any name" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token = await this._AuthClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateStaffRoleSpec._GetUpdateRoleUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "Any name" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedRoleId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateStaffRoleSpec._GetUpdateRoleUrl("not-a-guid")
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "Any name" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForEmptyPatchBody() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._CreateStaffRoleAsync(token, "Update Empty Patch");

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateStaffRoleSpec._GetUpdateRoleUrl(roleId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityForInvalidName() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._CreateStaffRoleAsync(token, "Update Invalid Name");

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateStaffRoleSpec._GetUpdateRoleUrl(roleId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "a" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Name");
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenRoleNameAlreadyExists() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		var roleId1 = await this._CreateStaffRoleAsync(token, "Update Name Exists A");
		var roleId2 = await this._CreateStaffRoleAsync(token, "Update Name Exists B");

		var existingName = await this._GetRoleNameAsync(token, roleId2);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateStaffRoleSpec._GetUpdateRoleUrl(roleId1)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = existingName });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("role-name-already-exists");
	}

	[Fact]
	public async Task ItShouldUpdateRoleNameAndDescription() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._CreateStaffRoleAsync(token, "Update Happy Path");

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateStaffRoleSpec._GetUpdateRoleUrl(roleId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name = "Renamed " + Guid.NewGuid().ToString("N")[..8],
			description = "New description",
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var updated = await response.Content.ReadFromJsonAsync<GetStaffRoleByIdResponse>();
		updated.Should().NotBeNull();
		Assert.NotNull(updated);
		updated.Role.Name.Should().StartWith("Renamed ");
		updated.Role.Description.Should().Be("New description");
	}

	[Fact]
	public async Task ItShouldClearDescriptionWhenNullIsProvided() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._CreateStaffRoleAsync(token, "Update Clear Desc", "Has description");

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateStaffRoleSpec._GetUpdateRoleUrl(roleId)
		).WithSessionToken(token);

		// Use raw JSON to ensure `description: null` is present in the payload.
		// This verifies the PATCH semantics: null means "clear", undefined means "omit/no change".
		request.Content = new StringContent(
			"{\"description\":null}",
			Encoding.UTF8,
			"application/json"
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var updated = await response.Content.ReadFromJsonAsync<GetStaffRoleByIdResponse>();
		updated.Should().NotBeNull();
		Assert.NotNull(updated);
		updated.Role.Description.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldSetIconAndTone() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._CreateStaffRoleAsync(token, "Update Style");

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateStaffRoleSpec._GetUpdateRoleUrl(roleId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			icon = "users-group",
			tone = "6",
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var updated = await response.Content.ReadFromJsonAsync<GetStaffRoleByIdResponse>();
		updated.Should().NotBeNull();
		Assert.NotNull(updated);

		// #980: the read contract must expose the stored style so the UI can
		// render it without re-deriving it from the role name.
		updated.Role.Icon.Should().Be("users-group");
		updated.Role.Tone.Should().Be("6");

		var persistedRole = await this._GetRoleByIdAsync(updated.Role.Id);
		persistedRole.Icon.Should().Be("users-group");
		persistedRole.Tone.Should().Be("6");
	}

	[Fact]
	public async Task ItShouldClearIconAndToneWhenNullIsProvided() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._CreateStaffRoleAsync(token, "Clear Style");

		using (var setRequest = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateStaffRoleSpec._GetUpdateRoleUrl(roleId)
		).WithSessionToken(token)) {
			setRequest.Content = JsonContent.Create(new {
				icon = "shield-check",
				tone = "2",
			});

			using var setResponse = await this._Http.SendAsync(setRequest);
			setResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		using var clearRequest = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateStaffRoleSpec._GetUpdateRoleUrl(roleId)
		).WithSessionToken(token);
		clearRequest.Content = new StringContent(
			"{\"icon\":null,\"tone\":null}",
			Encoding.UTF8,
			"application/json"
		);

		using var clearResponse = await this._Http.SendAsync(clearRequest);
		clearResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var updated = await clearResponse.Content.ReadFromJsonAsync<GetStaffRoleByIdResponse>();
		updated.Should().NotBeNull();
		Assert.NotNull(updated);

		// #980: clearing must also be reflected in the read contract, not only
		// in the stored row.
		updated.Role.Icon.Should().BeNull();
		updated.Role.Tone.Should().BeNull();

		var persistedRole = await this._GetRoleByIdAsync(Guid.Parse(roleId));
		persistedRole.Icon.Should().BeNull();
		persistedRole.Tone.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityForInvalidIcon() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._CreateStaffRoleAsync(token, "Update Invalid Icon");

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateStaffRoleSpec._GetUpdateRoleUrl(roleId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { icon = "not-an-icon" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Icon");
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityForInvalidTone() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._CreateStaffRoleAsync(token, "Update Invalid Tone");

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateStaffRoleSpec._GetUpdateRoleUrl(roleId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { tone = "8" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Tone");
	}

	// -- Helpers --

	private async Task<string> _CreateStaffRoleAsync(
		string staffToken,
		string namePrefix,
		string? description = "Initial description"
	) {
		var url = UpdateStaffRoleSpec._GetCreateRoleUrl();
		var name = namePrefix + " " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name,
				description,
				permissions = new[] {
					AppPermissions.Staff.Roles.LIST_FOR_STAFF.Key
				},
				emails = Array.Empty<string>(),
			}
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<StaffRoleCreatedResponse>();
		created.Should().NotBeNull();
		Assert.NotNull(created);
		return created.RoleId.ToString();
	}

	private async Task<string> _GetRoleNameAsync(string staffToken, string roleId) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.GetFn(roleId)
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);
		response.EnsureSuccessStatusCode();

		var payload = await response.Content.ReadFromJsonAsync<GetStaffRoleByIdResponse>();
		if (payload is null) {
			throw new InvalidOperationException("Failed to deserialize role payload");
		}

		return payload.Role.Name;
	}

	private async Task<Role> _GetRoleByIdAsync(Guid roleId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.Role
			.AsNoTracking()
			.SingleAsync(role => role.Id == roleId);
	}

	// -- Response DTOs --

	private record StaffRoleCreatedResponse {
		public Guid RoleId { get; init; }
	}

	private record GetStaffRoleByIdResponse {
		public required StaffRoleItemResponse Role { get; init; }
	}

	private record StaffRoleItemResponse {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public string? Description { get; init; }
		public string? Icon { get; init; }
		public string? Tone { get; init; }
	}
}
