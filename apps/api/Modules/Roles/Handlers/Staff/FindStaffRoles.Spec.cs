using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class FindStaffRolesSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public FindStaffRolesSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token = await this._CreateUnprivilegedStaffTokenAsync();

		using var response = await this._Http.SendAsync(
			new HttpRequestMessage(HttpMethod.Get, FindStaffRolesSpec._GetUrl())
				.WithSessionToken(token)
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	private static string _GetUrl(string query = "") {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.Find
		);

		return query.Length == 0 ? url : $"{url}?{query}";
	}

	[Fact]
	public async Task ItShouldTreatABarePercentSearchAsALiteralCharacterNotAWildcard() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var marker = Guid.NewGuid().ToString("N")[..8];
		var withPercentId = await this._SeedStaffRoleAsync($"Has%Percent{marker}");
		var withoutPercentId = await this._SeedStaffRoleAsync($"NoPercentAtAll{marker}");

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindStaffRolesSpec._GetUrl($"limit=100&q={Uri.EscapeDataString("%")}")
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffRolesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		// If '%' were interpolated unescaped into the ILIKE pattern, "%%%"
		// collapses to a bare wildcard matching every row. Escaped, only the
		// role whose name literally contains '%' may match.
		result.Data.Should().Contain(p => p.Id == withPercentId);
		result.Data.Should().NotContain(p => p.Id == withoutPercentId);
	}

	[Fact]
	public async Task ItShouldReturnPersistedIconAndToneOnEachItem() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var marker = Guid.NewGuid().ToString("N")[..8];
		var roleId = await this._SeedStaffRoleAsync(
			$"Styled {marker}",
			icon: "star",
			tone: "3"
		);
		var bareId = await this._SeedStaffRoleAsync($"Bare{marker}");

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindStaffRolesSpec._GetUrl($"limit=100&q={Uri.EscapeDataString(marker)}")
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffRolesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		var styled = result.Data.Single(p => p.Id == roleId);
		styled.Icon.Should().Be("star");
		styled.Tone.Should().Be("3");

		// Roles created without a style stay null — the UI derives a
		// deterministic fallback instead of inventing one here.
		var bare = result.Data.Single(p => p.Id == bareId);
		bare.Icon.Should().BeNull();
		bare.Tone.Should().BeNull();
	}

	private async Task<Guid> _SeedStaffRoleAsync(
		string name,
		string? icon = null,
		string? tone = null,
		bool isFullAccess = false
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var role = Role.CreateStaffRole(name);
		role.Icon = icon;
		role.Tone = tone;
		role.IsFullAccess = isFullAccess;
		await dbContext.Role.AddAsync(role);
		await dbContext.SaveChangesAsync();

		return role.GetRequiredId();
	}

	[Fact]
	public async Task ItShouldReturnTheWholeFilteredCollectionTotal() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var marker = $"totals-{Guid.NewGuid():N}";
		_ = await this._SeedStaffRoleAsync($"{marker}-a");
		_ = await this._SeedStaffRoleAsync($"{marker}-b");

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindStaffRolesSpec._GetUrl($"limit=1&q={marker}")
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffRolesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Should().HaveCount(1);
		result.TotalCount.Should().Be(2);
	}

	[Fact]
	public async Task ItShouldTellSystemRolesFromCustomOnesAndCountEachType() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var marker = $"types-{Guid.NewGuid():N}";
		var customId = await this._SeedStaffRoleAsync($"{marker}-custom");
		var fullAccessId = await this._SeedStaffRoleAsync($"{marker}-full", isFullAccess: true);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindStaffRolesSpec._GetUrl($"limit=1&q={marker}")
		).WithSessionToken(token);
		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var page = await response.Content.ReadFromJsonAsync<FindStaffRolesResponse>();
		Assert.NotNull(page);

		// limit=1: the type counters are the whole filtered collection, not the page.
		page.Data.Should().HaveCount(1);
		page.Counts.Total.Should().Be(2);
		page.Counts.System.Should().Be(1);
		page.Counts.Custom.Should().Be(1);

		using var allRequest = new HttpRequestMessage(
			HttpMethod.Get,
			FindStaffRolesSpec._GetUrl($"limit=50&q={marker}")
		).WithSessionToken(token);
		using var allResponse = await this._Http.SendAsync(allRequest);
		var all = await allResponse.Content.ReadFromJsonAsync<FindStaffRolesResponse>();
		Assert.NotNull(all);
		all.Data.Single(role => role.Id == customId).Type.Should().Be("Custom");
		all.Data.Single(role => role.Id == fullAccessId).Type.Should().Be("System");
	}

	private async Task<string> _CreateUnprivilegedStaffTokenAsync() {
		var email = $"no-perms-roles-{Guid.NewGuid():N}@example.com";

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "Roles",
			IsVerified = true,
			Status = UserStatus.Active,
		};
		_ = dbContext.User.Add(user);
		_ = await dbContext.SaveChangesAsync();

		var staffAccount = UserAccount.CreateStaffAccount(user.GetRequiredId());
		staffAccount.ValidateAccountType();
		_ = dbContext.UserAccount.Add(staffAccount);
		_ = await dbContext.SaveChangesAsync();

		return await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);
	}

	private sealed record FindStaffRolesResponse {
		public List<StaffRoleItemResponse> Data { get; init; } = [];
		public string? NextCursor { get; init; }
		public int TotalCount { get; init; }
		public int TotalAssignments { get; init; }
		public StaffRoleCountsResponse Counts { get; init; } = new();
	}

	private sealed record StaffRoleCountsResponse {
		public int Total { get; init; }
		public int System { get; init; }
		public int Custom { get; init; }
	}

	private sealed record StaffRoleItemResponse {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public string? Icon { get; init; }
		public string? Tone { get; init; }
		public string Type { get; init; } = string.Empty;
	}
}
