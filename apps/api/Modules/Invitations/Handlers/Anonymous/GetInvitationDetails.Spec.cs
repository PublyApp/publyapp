
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Invitations.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Invitations.Handlers.Anonymous;

public sealed class GetInvitationDetailsSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetInvitationDetailsSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	[Fact]
	public async Task
	ItShouldReturnOkForTenantAdminInvitationWithoutProfiles() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
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
			_Http,
			token,
			body.RootElement
		);

		createResponse.StatusCode.Should().Be(HttpStatusCode.Created);

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var invitation = await dbContext.Invitation
			.Where(inv =>
				inv.Email == inviteEmail &&
				inv.Scope == InvitationScope.Tenant
			)
			.SingleAsync();

		var detailsResponse = await _Http.GetAsync(
			$"/invitations/{invitation.Token}/details"
		);

		detailsResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await detailsResponse.Content
			.ReadFromJsonAsync<InvitationDetailsResponse>();

		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Email.Should().Be(inviteEmail);
		result.ProfileName.Should().Be("Admin");
	}

	private sealed record InvitationDetailsResponse {
		public string Email { get; init; } = string.Empty;
		public string ProfileName { get; init; } = string.Empty;
	}
}
