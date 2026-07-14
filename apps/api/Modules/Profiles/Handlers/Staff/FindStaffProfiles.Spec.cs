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
using PublyApp.Api.Modules.Profiles.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class FindStaffProfilesSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindStaffProfilesSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string query = "") {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Find
		);

		return query.Length == 0 ? url : $"{url}?{query}";
	}

	[Fact]
	public async Task ItShouldTreatABarePercentSearchAsALiteralCharacterNotAWildcard() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var marker = Guid.NewGuid().ToString("N")[..8];
		var withPercentId = await SeedStaffProfileAsync($"Has%Percent{marker}");
		var withoutPercentId = await SeedStaffProfileAsync($"NoPercentAtAll{marker}");

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl($"limit=100&q={Uri.EscapeDataString("%")}")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffProfilesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		// If '%' were interpolated unescaped into the ILIKE pattern, "%%%"
		// collapses to a bare wildcard matching every row. Escaped, only the
		// profile whose name literally contains '%' may match.
		result.Data.Should().Contain(p => p.Id == withPercentId);
		result.Data.Should().NotContain(p => p.Id == withoutPercentId);
	}

	private async Task<Guid> SeedStaffProfileAsync(string name) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var profile = Profile.CreateStaffProfile(name);
		await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	private sealed record FindStaffProfilesResponse {
		public List<StaffProfileItemResponse> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record StaffProfileItemResponse {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
	}
}
