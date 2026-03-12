namespace MainApi.Src.Modules.Invitations.Handlers.Anonymous;

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Tenants.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class AcceptInvitationSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public AcceptInvitationSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldActivatePendingTenantAfterAcceptingTenantInvitation() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var inviteEmail = $"tenant-accept-{Guid.NewGuid():N}@example.com";

		using var createBody = JsonDocument.Parse(
			$$"""
			{
				"name": "Tenant Activation Test",
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
			staffToken,
			createBody.RootElement
		);

		createResponse.StatusCode.Should().Be(HttpStatusCode.Created);

		await using var setupScope = _fixture.Factory.Services.CreateAsyncScope();
		var setupDbContext =
			setupScope.ServiceProvider.GetRequiredService<MainApiDbContext>();
		var invitation = await setupDbContext.Invitation
			.Where(inv =>
				inv.Email == inviteEmail &&
				inv.Scope == InvitationScope.Tenant
			)
			.SingleAsync();

		using var acceptBody = JsonDocument.Parse(
			"""
			{
				"firstName": "Tenant",
				"lastName": "Admin",
				"password": "StrongPass!123"
			}
			"""
		);

		var acceptResponse = await _http.PostAsJsonAsync(
			Routes.Invitations.Anonymous.AcceptByTokenFn(invitation.Token),
			acceptBody.RootElement
		);

		acceptResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var accepted = await acceptResponse.Content
			.ReadFromJsonAsync<InvitationAcceptedResponse>();
		accepted.Should().NotBeNull();
		accepted!.TenantId.Should().Be(invitation.TenantId);
		accepted.SessionToken.Should().NotBeNullOrWhiteSpace();

		using var pickerRequest = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetUserTenantsForPicker
		).WithSessionToken(accepted.SessionToken);

		using var pickerResponse = await _http.SendAsync(pickerRequest);

		pickerResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var picker = await pickerResponse.Content
			.ReadFromJsonAsync<PickerResponse>();
		picker.Should().NotBeNull();
		picker!.HasSuspendedTenants.Should().BeFalse();
		picker.ActiveCount.Should().Be(1);
		picker.Tenants.Should().ContainSingle(t =>
			t.Id == invitation.TenantId &&
			t.Status == "Active" &&
			t.IsActive
		);

		await using var assertScope = _fixture.Factory.Services.CreateAsyncScope();
		var assertDbContext =
			assertScope.ServiceProvider.GetRequiredService<MainApiDbContext>();
		var tenant = await assertDbContext.Tenant
			.Where(t => t.Id == invitation.TenantId)
			.SingleAsync();

		tenant.Status.Should().Be(TenantStatus.Active);
		tenant.IsSuspended.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldAllowExistingTenantUserToAcceptTenantInvitationWithCurrentSession() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var existingUserToken = await _authClient.LoginAsync(
			TestConstants.AliceEmail,
			TestConstants.SeedPassword
		);
		var inviteEmail = TestConstants.AliceEmail;

		using var createBody = JsonDocument.Parse(
			$$"""
			{
				"name": "Existing User Tenant Test",
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
			staffToken,
			createBody.RootElement
		);

		createResponse.StatusCode.Should().Be(HttpStatusCode.Created);

		await using var setupScope = _fixture.Factory.Services.CreateAsyncScope();
		var setupDbContext =
			setupScope.ServiceProvider.GetRequiredService<MainApiDbContext>();
		var invitation = await setupDbContext.Invitation
			.Where(inv =>
				inv.Email == inviteEmail &&
				inv.Scope == InvitationScope.Tenant &&
				inv.IsAccepted == false
			)
			.OrderByDescending(inv => inv.CreatedAt)
			.FirstAsync();

		using var acceptRequest = new HttpRequestMessage(
			HttpMethod.Post,
			Routes.Invitations.Anonymous.AcceptByTokenFn(invitation.Token)
		).WithSessionToken(existingUserToken);
		acceptRequest.Content = JsonContent.Create(new {
			useExistingAccount = true
		});

		using var acceptResponse = await _http.SendAsync(acceptRequest);

		acceptResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var accepted = await acceptResponse.Content
			.ReadFromJsonAsync<InvitationAcceptedResponse>();
		accepted.Should().NotBeNull();
		accepted!.TenantId.Should().Be(invitation.TenantId);
		accepted.UserId.Should().NotBeEmpty();
		accepted.SessionToken.Should().Be(existingUserToken);

		using var pickerRequest = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetUserTenantsForPicker
		).WithSessionToken(existingUserToken);

		using var pickerResponse = await _http.SendAsync(pickerRequest);

		pickerResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var picker = await pickerResponse.Content
			.ReadFromJsonAsync<PickerResponse>();
		picker.Should().NotBeNull();
		picker!.Tenants.Should().Contain(t =>
			t.Id == invitation.TenantId &&
			t.Status == "Active" &&
			t.IsActive
		);

		await using var assertScope = _fixture.Factory.Services.CreateAsyncScope();
		var assertDbContext =
			assertScope.ServiceProvider.GetRequiredService<MainApiDbContext>();
		var tenant = await assertDbContext.Tenant
			.Where(t => t.Id == invitation.TenantId)
			.SingleAsync();

		tenant.Status.Should().Be(TenantStatus.Active);
		tenant.IsSuspended.Should().BeFalse();
	}

	private sealed record InvitationAcceptedResponse {
		public Guid UserId { get; init; }
		public Guid? TenantId { get; init; }
		public string SessionToken { get; init; } = string.Empty;
	}

	private sealed record PickerTenantItem {
		public Guid Id { get; init; }
		public string Status { get; init; } = string.Empty;
		public bool IsActive { get; init; }
	}

	private sealed record PickerResponse {
		public List<PickerTenantItem> Tenants { get; init; } = [];
		public int ActiveCount { get; init; }
		public bool HasSuspendedTenants { get; init; }
	}
}
