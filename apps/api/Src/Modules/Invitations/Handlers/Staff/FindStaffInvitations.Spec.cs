using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace MainApi.Src.Modules.Invitations.Handlers.Staff;

public sealed class FindStaffInvitationsSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindStaffInvitationsSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenStatusCsvHasNoTokens() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();

		using HttpResponseMessage response = await _http.SendAsync(
			CreateFindRequest(staffToken, status: ",")
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldFilterByMultipleStaffInvitationStatuses() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		string pendingEmail = $"staff-pending-{Guid.NewGuid():N}@example.com";
		string revokedEmail = $"staff-revoked-{Guid.NewGuid():N}@example.com";
		string acceptedEmail = $"staff-accepted-{Guid.NewGuid():N}@example.com";

		_ = await CreateStaffInvitationAsync(staffToken, pendingEmail);
		Guid revokedInvitationId = await CreateStaffInvitationAsync(
			staffToken,
			revokedEmail
		);
		Guid acceptedInvitationId = await CreateStaffInvitationAsync(
			staffToken,
			acceptedEmail
		);

		await RevokeStaffInvitationAsync(staffToken, revokedInvitationId);
		await MarkStaffInvitationAcceptedAsync(acceptedInvitationId);

		using HttpResponseMessage response = await _http.SendAsync(
			CreateFindRequest(staffToken, status: "pending,revoked", limit: 100)
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

		FindResponse? result = await response.Content.ReadFromJsonAsync<FindResponse>();
		_ = result.Should().NotBeNull();
		List<InvitationListItemDto> data = result?.Data ?? [];

		_ = data.Should().Contain(item =>
			item.Email.Equals(pendingEmail, StringComparison.OrdinalIgnoreCase)
			&& item.Status == "Pending"
		);
		_ = data.Should().Contain(item =>
			item.Email.Equals(revokedEmail, StringComparison.OrdinalIgnoreCase)
			&& item.Status == "Revoked"
		);
		_ = data.Should().NotContain(item =>
			item.Email.Equals(acceptedEmail, StringComparison.OrdinalIgnoreCase)
		);
		_ = data.Should().OnlyContain(item =>
			item.Status == "Pending" || item.Status == "Revoked"
		);
	}

	[Fact]
	public async Task
	ItShouldFilterByExpiredStaffInvitationStatus() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		string expiredEmail = $"staff-expired-{Guid.NewGuid():N}@example.com";

		await CreateExpiredStaffInvitationAsync(expiredEmail);

		using HttpResponseMessage response = await _http.SendAsync(
			CreateFindRequest(staffToken, status: "expired", limit: 100)
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

		FindResponse? result = await response.Content.ReadFromJsonAsync<FindResponse>();
		_ = result.Should().NotBeNull();
		List<InvitationListItemDto> data = result?.Data ?? [];

		_ = data.Should().Contain(item =>
			item.Email.Equals(expiredEmail, StringComparison.OrdinalIgnoreCase)
			&& item.Status == "Expired"
		);
		_ = data.Should().OnlyContain(item => item.Status == "Expired");
	}

	[Fact]
	public async Task
	ItShouldAcceptCommaSeparatedStaffInvitationStatusesWithSpaces() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		string acceptedEmail = $"staff-accepted-spaces-{Guid.NewGuid():N}@example.com";
		string expiredEmail = $"staff-expired-spaces-{Guid.NewGuid():N}@example.com";

		Guid acceptedInvitationId = await CreateStaffInvitationAsync(
			staffToken,
			acceptedEmail
		);
		await MarkStaffInvitationAcceptedAsync(acceptedInvitationId);
		await CreateExpiredStaffInvitationAsync(expiredEmail);

		using HttpResponseMessage response = await _http.SendAsync(
			CreateFindRequest(staffToken, status: "accepted, expired", limit: 100)
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

		FindResponse? result = await response.Content.ReadFromJsonAsync<FindResponse>();
		_ = result.Should().NotBeNull();
		List<InvitationListItemDto> data = result?.Data ?? [];

		_ = data.Should().Contain(item =>
			item.Email.Equals(acceptedEmail, StringComparison.OrdinalIgnoreCase)
			&& item.Status == "Accepted"
		);
		_ = data.Should().Contain(item =>
			item.Email.Equals(expiredEmail, StringComparison.OrdinalIgnoreCase)
			&& item.Status == "Expired"
		);
		_ = data.Should().OnlyContain(item =>
			item.Status == "Accepted" || item.Status == "Expired"
		);
	}

	private HttpRequestMessage CreateFindRequest(
		string staffToken,
		string? status = null,
		int? limit = null
	) {
		string url = GetFindUrl(status, limit);
		return new HttpRequestMessage(HttpMethod.Get, url)
			.WithSessionToken(staffToken);
	}

	private static string GetFindUrl(
		string? status = null,
		int? limit = null
	) {
		var queryParams = new List<string>();

		if (status is not null) {
			queryParams.Add($"status={Uri.EscapeDataString(status)}");
		}

		if (limit is not null) {
			queryParams.Add($"limit={limit}");
		}

		string url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Invitations.ForStaff.Root,
			Routes.Invitations.ForStaff.Find
		);

		if (queryParams.Count == 0) {
			return url;
		}

		return $"{url}?{string.Join("&", queryParams)}";
	}

	private async Task<Guid> CreateStaffInvitationAsync(
		string staffToken,
		string email
	) {
		Guid profileId = await GetAnyStaffProfileIdAsync();
		HttpRequestMessage request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(Routes.Staff.Root, Routes.Invitations.ForStaff.Root)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new {
			email,
			profileId = profileId.ToString()
		});

		using HttpResponseMessage response = await _http.SendAsync(request);
		_ = response.StatusCode.Should().Be(HttpStatusCode.Created);

		InvitationCreatedResponse? body = await response.Content
			.ReadFromJsonAsync<InvitationCreatedResponse>();
		_ = body.Should().NotBeNull();

		return body?.InvitationId ?? Guid.Empty;
	}

	private async Task RevokeStaffInvitationAsync(
		string staffToken,
		Guid invitationId
	) {
		string url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Invitations.ForStaff.Root,
			Routes.Invitations.ForStaff.RevokeByIdFn(invitationId.ToString())
		);
		HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Delete, url)
			.WithSessionToken(staffToken);

		using HttpResponseMessage response = await _http.SendAsync(request);
		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);
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

	private async Task<Guid> CreateExpiredStaffInvitationAsync(string email) {
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
			DateTime.UtcNow.AddDays(-1),
			Guid.NewGuid().ToString("N")[..32]
		);

		_ = await dbContext.Invitation.AddAsync(invitation);
		_ = await dbContext.SaveChangesAsync();

		return invitation.GetRequiredId();
	}

	private async Task<Guid> GetAnyStaffProfileIdAsync() {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		MainApiDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		Profile profile = await dbContext.Profile
			.Where(profile =>
				profile.Scope == ProfileScope.Staff
				&& !profile.IsDeleted
			)
			.OrderBy(profile => profile.Name)
			.FirstAsync();

		return profile.GetRequiredId();
	}

	private sealed record FindResponse {
		public List<InvitationListItemDto> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record InvitationListItemDto {
		public Guid Id { get; init; }
		public string Email { get; init; } = string.Empty;
		public string Scope { get; init; } = string.Empty;
		public string ProfileName { get; init; } = string.Empty;
		public string Status { get; init; } = string.Empty;
		public DateTime ExpiresAt { get; init; }
		public DateTime? AcceptedAt { get; init; }
		public DateTime CreatedAt { get; init; }
		public string? InvitedByName { get; init; }
	}

	private sealed record InvitationCreatedResponse {
		public Guid InvitationId { get; init; }
	}
}
