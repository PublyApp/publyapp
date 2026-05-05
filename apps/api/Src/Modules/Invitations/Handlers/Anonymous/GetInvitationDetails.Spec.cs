namespace MainApi.Src.Modules.Invitations.Handlers.Anonymous;

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Modules.Invitations.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class GetInvitationDetailsSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetInvitationDetailsSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnOkForTenantAdminInvitationWithoutProfiles() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var inviteEmail = $"tenant-admin-{Guid.NewGuid():N}@example.com";

		using var body = JsonDocument.Parse(
			$$"""
			{
				"name": "Tenant Invite Details Test",
				"maxUsers": 1,
				"initialUsers": [
					{
						"email": "{{inviteEmail}}",
						"accountLevel": "Admin"
					}
				]
			}
			"""
		);

		var createResponse = await TenantTestHelper.CreateTenantAsync(
			_http,
			token,
			body.RootElement
		);

		createResponse.StatusCode.Should().Be(HttpStatusCode.Created);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();
		var invitation = await dbContext.Invitation
			.Where(inv =>
				inv.Email == inviteEmail &&
				inv.Scope == InvitationScope.Tenant
			)
			.SingleAsync();

		var detailsResponse = await _http.GetAsync(
			$"/invitations/{invitation.Token}/details"
		);

		detailsResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await detailsResponse.Content
			.ReadFromJsonAsync<InvitationDetailsResponse>();

		result.Should().NotBeNull();
		result!.Email.Should().Be(inviteEmail);
		result.ProfileName.Should().Be("Admin");
	}

	private sealed record InvitationDetailsResponse {
		public string Email { get; init; } = string.Empty;
		public string ProfileName { get; init; } = string.Empty;
	}
}
