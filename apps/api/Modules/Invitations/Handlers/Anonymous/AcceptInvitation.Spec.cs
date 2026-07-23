
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Tenants.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Invitations.Handlers.Anonymous;

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
			setupScope.ServiceProvider.GetRequiredService<AppDbContext>();
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
		Assert.NotNull(accepted);
		accepted.TenantId.Should().Be(invitation.TenantId);
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
		Assert.NotNull(picker);
		picker.HasSuspendedTenants.Should().BeFalse();
		picker.ActiveCount.Should().Be(1);
		picker.Tenants.Should().ContainSingle(t =>
			t.Id == invitation.TenantId &&
			t.Status == "Active"
		);

		await using var assertScope = _fixture.Factory.Services.CreateAsyncScope();
		var assertDbContext =
			assertScope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenant = await assertDbContext.Tenant
			.Where(t => t.Id == invitation.TenantId)
			.SingleAsync();

		tenant.Status.Should().Be(TenantStatus.Active);
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
			setupScope.ServiceProvider.GetRequiredService<AppDbContext>();
		var invitation = await setupDbContext.Invitation
			.Where(inv =>
				inv.Email == inviteEmail &&
				inv.Scope == InvitationScope.Tenant &&
				inv.Status == InvitationStatus.Pending
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
		Assert.NotNull(accepted);
		accepted.TenantId.Should().Be(invitation.TenantId);
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
		Assert.NotNull(picker);
		picker.Tenants.Should().Contain(t =>
					t.Id == invitation.TenantId &&
					t.Status == "Active"
				);

		await using var assertScope = _fixture.Factory.Services.CreateAsyncScope();
		var assertDbContext =
			assertScope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenant = await assertDbContext.Tenant
			.Where(t => t.Id == invitation.TenantId)
			.SingleAsync();

		tenant.Status.Should().Be(TenantStatus.Active);
	}

	[Fact]
	public async Task
	ItShouldNotExposeAcceptanceExceptionDetailsWhenExistingUserAcceptanceFails() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var existingUserToken = await _authClient.LoginAsync(
			TestConstants.AliceEmail,
			TestConstants.SeedPassword
		);

		using var createBody = JsonDocument.Parse(
			$$"""
			{
				"name": "Sanitized Invitation Failure {{Guid.NewGuid():N}}",
				"maxUsers": 1,
				"initialUsers": [
					{
						"email": "{{TestConstants.AliceEmail}}",
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

		Guid invitationId;
		Guid tenantId;
		string invitationToken;
		await using (var setupScope = _fixture.Factory.Services.CreateAsyncScope()) {
			var dbContext = setupScope.ServiceProvider.GetRequiredService<AppDbContext>();
			var invitation = await dbContext.Invitation
				.Where(inv =>
					inv.Email == TestConstants.AliceEmail
					&& inv.Scope == InvitationScope.Tenant
					&& inv.Status == InvitationStatus.Pending
				)
				.OrderByDescending(inv => inv.CreatedAt)
				.FirstAsync();

			invitationId = invitation.GetRequiredId();
			tenantId = invitation.TenantId.GetValueOrDefault();
			invitationToken = invitation.Token;

			var tenant = await dbContext.Tenant
				.Where(item => item.Id == tenantId)
				.SingleAsync();
			tenant.IsDeleted = true;
			tenant.DeletedAt = DateTime.UtcNow;
			await dbContext.SaveChangesAsync();
		}

		using var acceptRequest = new HttpRequestMessage(
			HttpMethod.Post,
			Routes.Invitations.Anonymous.AcceptByTokenFn(invitationToken)
		).WithSessionToken(existingUserToken);
		acceptRequest.Content = JsonContent.Create(new {
			useExistingAccount = true
		});

		using var acceptResponse = await _http.SendAsync(acceptRequest);

		acceptResponse.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		acceptResponse.Content.Headers.ContentType?.MediaType.Should()
			.Be("application/problem+json");

		var responseBody = await acceptResponse.Content.ReadAsStringAsync();
		var rawExceptionMessage =
			$"Tenant {tenantId} not found for invitation {invitationId}";
		responseBody.Should().NotContain(rawExceptionMessage);

		var problem = JsonSerializer.Deserialize<AppProblemDetails>(
			responseBody,
			JsonSerializerOptions.Web
		);
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Detail.Should().Be("Failed to accept invitation");
		problem.TranslationKey.Should().Be(ResponseKeys.BadRequest);
	}

	private sealed record InvitationAcceptedResponse {
		public Guid UserId { get; init; }
		public Guid? TenantId { get; init; }
		public string SessionToken { get; init; } = string.Empty;
	}

	private sealed record PickerTenantItem {
		public Guid Id { get; init; }
		public string Status { get; init; } = string.Empty;
	}

	private sealed record PickerResponse {
		public List<PickerTenantItem> Tenants { get; init; } = [];
		public int ActiveCount { get; init; }
		public bool HasSuspendedTenants { get; init; }
	}
}
