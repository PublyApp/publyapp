using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Invitations.Handlers.Anonymous;

public sealed class CheckInvitationTokenSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public CheckInvitationTokenSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	[Fact]
	public async Task
	ItShouldReturnOkWithValidStatusForAPendingUnexpiredInvitation() {
		var invitation = await _CreateTenantInvitationAsync();

		var response = await _CheckAsync(invitation.Email, invitation.Token);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content.ReadFromJsonAsync<CheckInvitationTokenResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Status.Should().Be("success");
		result.Email.Should().Be(invitation.Email);
	}

	[Fact]
	public async Task
	ItShouldReturnDistinctTranslationKeyWhenInvitationAlreadyAccepted() {
		var invitation = await _CreateTenantInvitationAsync();
		await _MutateInvitationAsync(invitation.Id, inv => {
			inv.Status = InvitationStatus.Accepted;
			inv.AcceptedAt = DateTime.UtcNow;
		});

		var response = await _CheckAsync(invitation.Email, invitation.Token);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content.ReadFromJsonAsync<ProblemPayload>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("invitation-token-already-accepted");
	}

	[Fact]
	public async Task
	ItShouldReturnDistinctTranslationKeyWhenInvitationRevoked() {
		var invitation = await _CreateTenantInvitationAsync();
		await _MutateInvitationAsync(invitation.Id, inv => {
			inv.Status = InvitationStatus.Revoked;
			inv.RevokedAt = DateTime.UtcNow;
		});

		var response = await _CheckAsync(invitation.Email, invitation.Token);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content.ReadFromJsonAsync<ProblemPayload>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("invitation-token-revoked");
	}

	[Fact]
	public async Task
	ItShouldReturnDistinctTranslationKeyWhenInvitationExpired() {
		var invitation = await _CreateTenantInvitationAsync();
		await _MutateInvitationAsync(invitation.Id, inv => {
			inv.ExpiresAt = DateTime.UtcNow.AddDays(-1);
		});

		var response = await _CheckAsync(invitation.Email, invitation.Token);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content.ReadFromJsonAsync<ProblemPayload>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("invitation-token-expired");
	}

	[Fact]
	public async Task
	ItShouldReturnGenericInvalidTranslationKeyWhenTokenDoesNotExist() {
		var email = $"unknown-{Guid.NewGuid():N}@example.com";
		var id = Uri.EscapeDataString(CryptoUtils.EncryptString(email));
		var response = await _Http.GetAsync(
			$"/invitations/check?id={id}&token=does-not-exist-{Guid.NewGuid():N}"
		);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content.ReadFromJsonAsync<ProblemPayload>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("invalid-invitation-token");
	}

	private async Task<HttpResponseMessage> _CheckAsync(string email, string token) {
		var id = Uri.EscapeDataString(CryptoUtils.EncryptString(email));
		return await _Http.GetAsync($"/invitations/check?id={id}&token={token}");
	}

	private async Task<(Guid Id, string Email, string Token)> _CreateTenantInvitationAsync() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var inviteEmail = $"check-invitation-{Guid.NewGuid():N}@example.com";

		using var createBody = JsonDocument.Parse(
			$$"""
			{
				"name": "Check Invitation Test {{Guid.NewGuid():N}}",
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
			staffToken,
			createBody.RootElement
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

		return (invitation.GetRequiredId(), invitation.Email, invitation.Token);
	}

	private async Task _MutateInvitationAsync(Guid invitationId, Action<Invitation> mutate) {
		using var scope = _Fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var invitation = await dbContext.Invitation
			.Where(inv => inv.Id == invitationId)
			.FirstAsync();

		mutate(invitation);

		await dbContext.SaveChangesAsync();
	}

	private sealed record ProblemPayload {
		public string TranslationKey { get; init; } = string.Empty;
	}
}
