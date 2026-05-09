using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Localization;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace MainApi.Src.Modules.Invitations.Handlers.Staff;

public sealed class BulkRevokeStaffInvitationsSpec : IClassFixture<ApiFixture> {
	private const string BulkRevokeRoute = "/bulk-revoke";

	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public BulkRevokeStaffInvitationsSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForMalformedBulkRevokeBody() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();

		using HttpResponseMessage response = await BulkRevokeAsync(
			staffToken,
			new[] { "not-a-guid" }
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		ValidationProblemDetails? problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		_ = problem.Should().NotBeNull();
		_ = problem?.TranslationKey
			.Should()
			.Be(ResponseKeys.RequestBodyValidationFailed);
		_ = problem?.Errors.Values
			.SelectMany(errors => errors)
			.Should()
			.Contain(error => error.Contains("valid GUID"));
	}

	[Fact]
	public async Task ItShouldReturnPartialSuccessWhenBulkRevokingMixedTargets() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		Guid pendingInvitationId = await CreateStaffInvitationAsync(
			$"bulk-revoke-pending-{Guid.NewGuid():N}@example.com"
		);
		Guid acceptedInvitationId = await CreateStaffInvitationAsync(
			$"bulk-revoke-accepted-{Guid.NewGuid():N}@example.com"
		);
		Guid missingInvitationId = Guid.NewGuid();

		await MarkStaffInvitationAcceptedAsync(acceptedInvitationId);

		using HttpResponseMessage response = await BulkRevokeAsync(
			staffToken,
			pendingInvitationId,
			acceptedInvitationId,
			missingInvitationId
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

		BulkStaffInvitationActionResponse? result = await response.Content
			.ReadFromJsonAsync<BulkStaffInvitationActionResponse>();
		_ = result.Should().NotBeNull();
		_ = result?.SucceededCount.Should().Be(1);
		_ = result?.FailedCount.Should().Be(2);
		_ = result?.FailedItems.Should().ContainSingle(item =>
			item.InvitationId == acceptedInvitationId
			&& item.Reason == "already_accepted"
		);
		_ = result?.FailedItems.Should().ContainSingle(item =>
			item.InvitationId == missingInvitationId
			&& item.Reason == "not_found"
		);

		await AssertInvitationStatusAsync(pendingInvitationId, InvitationStatus.Revoked);
		await AssertInvitationStatusAsync(acceptedInvitationId, InvitationStatus.Accepted);
		await AssertInvitationRevokeAuditLogAsync(pendingInvitationId);
	}

	private async Task<HttpResponseMessage> BulkRevokeAsync(
		string staffToken,
		params Guid[] invitationIds
	) {
		return await BulkRevokeAsync(
			staffToken,
			invitationIds.Select(invitationId => invitationId.ToString()).ToArray()
		);
	}

	private async Task<HttpResponseMessage> BulkRevokeAsync(
		string staffToken,
		string[] invitationIds
	) {
		HttpRequestMessage request = new HttpRequestMessage(
			HttpMethod.Post,
			GetBulkRevokeUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new {
			invitationIds
		});

		return await _http.SendAsync(request);
	}

	private static string GetBulkRevokeUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Invitations.ForStaff.Root,
			BulkRevokeRoute
		);
	}

	private async Task<Guid> CreateStaffInvitationAsync(string email) {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		MainApiDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		Profile staffProfile = await dbContext.Profile
			.Where(profile =>
				profile.Scope == ProfileScope.Staff
				&& !profile.IsDeleted
			)
			.OrderBy(profile => profile.Name)
			.FirstAsync();
		User staffUser = await dbContext.User
			.Where(user => user.Email == SeedConstants.Staff.AdminEmail)
			.FirstAsync();

		Invitation invitation = Invitation.CreateStaffInvitationWithProfiles(
			email,
			[staffProfile.GetRequiredId()],
			staffUser.GetRequiredId(),
			DateTime.UtcNow.AddDays(7),
			Guid.NewGuid().ToString("N")[..32]
		);

		_ = await dbContext.Invitation.AddAsync(invitation);
		_ = await dbContext.SaveChangesAsync();

		return invitation.GetRequiredId();
	}

	private async Task MarkStaffInvitationAcceptedAsync(Guid invitationId) {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		MainApiDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		Invitation? invitation = await dbContext.Invitation
			.Where(inv => inv.Id == invitationId)
			.FirstOrDefaultAsync();
		_ = invitation.Should().NotBeNull();
		if (invitation is null) {
			return;
		}

		invitation.Status = InvitationStatus.Accepted;
		invitation.AcceptedAt = DateTime.UtcNow;

		_ = await dbContext.SaveChangesAsync();
	}

	private async Task AssertInvitationStatusAsync(
		Guid invitationId,
		InvitationStatus status
	) {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		MainApiDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		Invitation? invitation = await dbContext.Invitation
			.Where(inv => inv.Id == invitationId)
			.FirstOrDefaultAsync();
		_ = invitation.Should().NotBeNull();
		_ = invitation?.Status.Should().Be(status);
	}

	private async Task AssertInvitationRevokeAuditLogAsync(Guid invitationId) {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		MainApiDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var auditLog =
			await (
				from log in dbContext.AuditLog
				where log.TargetId == invitationId
					&& log.Action == AuditActions.InvitationRevoked
				orderby log.CreatedAt descending
				select log
			).FirstOrDefaultAsync();

		_ = auditLog.Should().NotBeNull();
	}

	private sealed record BulkStaffInvitationActionResponse {
		public int SucceededCount { get; init; }
		public int FailedCount { get; init; }
		public List<BulkStaffInvitationActionFailedItemResponse> FailedItems { get; init; } =
			[];
	}

	private sealed record BulkStaffInvitationActionFailedItemResponse {
		public Guid InvitationId { get; init; }
		public string Reason { get; init; } = string.Empty;
	}
}
