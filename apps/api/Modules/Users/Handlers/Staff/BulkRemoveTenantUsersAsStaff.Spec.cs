
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Tenants.Handlers.Staff;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class BulkRemoveTenantUsersAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public BulkRemoveTenantUsersAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetBulkRemoveUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.BulkRemoveFn(tenantId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await GetTenantIdAsync();

		using var response = await BulkRemoveAsync(
			sessionToken: null,
			tenantId.ToString(),
			new { userIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForTenantUser() {
		var tenantToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var tenantId = await GetTenantIdAsync();

		using var response = await BulkRemoveAsync(
			tenantToken,
			tenantId.ToString(),
			new { userIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var staffToken = await TenantBulkActionSpecSupport
			.CreateStaffUserTokenWithoutPermissionAsync(
				_fixture,
				_authClient,
				"bulk-remove-tenant-user-no-permission"
			);
		var tenantId = await GetTenantIdAsync();

		using var response = await BulkRemoveAsync(
			staffToken,
			tenantId.ToString(),
			new { userIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var response = await BulkRemoveAsync(
			staffToken,
			"not-a-guid",
			new { userIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Theory]
	[MemberData(nameof(InvalidBodies))]
	public async Task ItShouldReturnValidationProblemWhenBodyIsInvalid(string body) {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var response = await BulkRemoveRawJsonAsync(
			staffToken,
			tenantId.ToString(),
			body
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.RequestBodyValidationFailed);
		problem.Errors.Keys.Should().Contain("UserIds");
	}

	[Fact]
	public async Task ItShouldRemoveMultipleTenantUsersInOneBulkRequest() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var (tenantId, adminUserId) = await SeedTenantWithAdminAsync();
		var firstUserId = await SeedTenantUserAsync(tenantId, AccountLevel.User);
		var secondUserId = await SeedTenantUserAsync(tenantId, AccountLevel.User);
		var startedAt = DateTime.UtcNow;

		using var response = await BulkRemoveAsync(
			staffToken,
			tenantId.ToString(),
			new { userIds = new[] { firstUserId, secondUserId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkTenantUserActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(2);
		result.FailedCount.Should().Be(0);
		result.FailedItems.Should().BeEmpty();

		await AssertUserAccountRemovedAsync(tenantId, firstUserId);
		await AssertUserAccountRemovedAsync(tenantId, secondUserId);
		await AssertBulkRemoveAuditLogsAsync(
			tenantId,
			startedAt,
			expectedTargetIds: [firstUserId, secondUserId]
		);
		_ = adminUserId;
	}

	[Fact]
	public async Task ItShouldDeduplicateRepeatedUserIdsBeforeRemoving() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var (tenantId, _) = await SeedTenantWithAdminAsync();
		var userId = await SeedTenantUserAsync(tenantId, AccountLevel.User);

		using var response = await BulkRemoveAsync(
			staffToken,
			tenantId.ToString(),
			new { userIds = new[] { userId, userId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkTenantUserActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(0);

		await AssertUserAccountRemovedAsync(tenantId, userId);
	}

	[Fact]
	public async Task ItShouldReturnPartialResultForMissingAndCrossTenantUsers() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var (tenantId, _) = await SeedTenantWithAdminAsync();
		var deletableUserId = await SeedTenantUserAsync(tenantId, AccountLevel.User);
		var missingUserId = Guid.NewGuid();
		var (otherTenantId, otherAdminUserId) = await SeedTenantWithAdminAsync();
		var startedAt = DateTime.UtcNow;

		using var response = await BulkRemoveAsync(
			staffToken,
			tenantId.ToString(),
			new {
				userIds = new[] {
					deletableUserId,
					missingUserId,
					otherAdminUserId,
				},
			}
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkTenantUserActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(2);
		result.FailedItems.Should().ContainSingle(item =>
			item.UserId == missingUserId
			&& item.Error == "not-found"
		);
		result.FailedItems.Should().ContainSingle(item =>
			item.UserId == otherAdminUserId
			&& item.Error == "not-found"
		);

		await AssertUserAccountRemovedAsync(tenantId, deletableUserId);
		await AssertUserAccountNotRemovedAsync(otherTenantId, otherAdminUserId);
		await AssertBulkRemoveAuditLogsAsync(
			tenantId,
			startedAt,
			expectedTargetIds: [deletableUserId]
		);
	}

	[Fact]
	public async Task ItShouldNotWriteAnAuditLogWhenNothingSucceeds() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var (tenantId, _) = await SeedTenantWithAdminAsync();
		var missingUserId = Guid.NewGuid();
		var startedAt = DateTime.UtcNow;

		using var response = await BulkRemoveAsync(
			staffToken,
			tenantId.ToString(),
			new { userIds = new[] { missingUserId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkTenantUserActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(0);
		result.FailedCount.Should().Be(1);

		await AssertBulkRemoveAuditLogsAsync(
			tenantId,
			startedAt,
			expectedTargetIds: []
		);
	}

	[Fact]
	public async Task ItShouldFailWhenRemovingTheLastActiveAdminInTheBatch() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var (tenantId, adminUserId) = await SeedTenantWithAdminAsync();
		var regularUserId = await SeedTenantUserAsync(tenantId, AccountLevel.User);

		using var response = await BulkRemoveAsync(
			staffToken,
			tenantId.ToString(),
			new { userIds = new[] { regularUserId, adminUserId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkTenantUserActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(1);
		result.FailedItems.Should().ContainSingle(item =>
			item.UserId == adminUserId
			&& item.Error == "last-admin"
		);

		await AssertUserAccountRemovedAsync(tenantId, regularUserId);
		await AssertUserAccountNotRemovedAsync(tenantId, adminUserId);
	}

	public static TheoryData<string> InvalidBodies() {
		return new TheoryData<string> {
			"""{}""",
			"""{ "userIds": null }""",
			"""{ "userIds": "not-an-array" }""",
			"""{ "userIds": [null] }""",
			"""{ "userIds": [123] }""",
			"""{ "userIds": [] }""",
		};
	}

	private async Task<Guid> GetTenantIdAsync() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<(Guid TenantId, Guid AdminUserId)> SeedTenantWithAdminAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var unique = Guid.NewGuid().ToString("N");
		var tenant = new Tenant {
			Name = $"Bulk Remove Tenant {unique}",
			Code = Guid.NewGuid().ToString("N")[..12],
			Status = TenantStatus.Active,
			MaxUsers = 100,
		};
		var admin = new User {
			Email = $"bulk-remove-admin-{unique}@example.com",
			Password = "unused",
			FirstName = "Bulk",
			LastName = "Admin",
			Status = UserStatus.Active,
			IsVerified = true,
		};

		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.User.AddAsync(admin);
		await dbContext.SaveChangesAsync();

		await dbContext.UserAccount.AddAsync(
			UserAccount.CreateTenantAccount(
				admin.GetRequiredId(),
				tenant.GetRequiredId(),
				AccountLevel.Admin
			)
		);
		await dbContext.SaveChangesAsync();

		return (tenant.GetRequiredId(), admin.GetRequiredId());
	}

	private async Task<Guid> SeedTenantUserAsync(Guid tenantId, AccountLevel level) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var unique = Guid.NewGuid().ToString("N");
		var user = new User {
			Email = $"bulk-remove-user-{unique}@example.com",
			Password = "unused",
			FirstName = "Bulk",
			LastName = "User",
			Status = UserStatus.Active,
			IsVerified = true,
		};

		await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();

		await dbContext.UserAccount.AddAsync(
			UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId, level)
		);
		await dbContext.SaveChangesAsync();

		return user.GetRequiredId();
	}

	private async Task<HttpResponseMessage> BulkRemoveAsync(
		string? sessionToken,
		string tenantId,
		object body
	) {
		var request = new HttpRequestMessage(HttpMethod.Post, GetBulkRemoveUrl(tenantId));

		if (sessionToken is not null) {
			request.WithSessionToken(sessionToken);
		}

		request.Content = JsonContent.Create(body);
		return await _http.SendAsync(request);
	}

	private async Task<HttpResponseMessage> BulkRemoveRawJsonAsync(
		string sessionToken,
		string tenantId,
		string body
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetBulkRemoveUrl(tenantId)
		).WithSessionToken(sessionToken);

		request.Content = new StringContent(body, Encoding.UTF8, "application/json");
		return await _http.SendAsync(request);
	}

	private async Task AssertUserAccountRemovedAsync(Guid tenantId, Guid userId) {
		var account = await GetUserAccountIgnoringFiltersAsync(tenantId, userId);
		account.Should().NotBeNull();
		if (account is null) {
			throw new InvalidOperationException("Seeded user account could not be loaded.");
		}

		account.IsDeleted.Should().BeTrue();
		account.DeletedAt.Should().NotBeNull();
	}

	private async Task AssertUserAccountNotRemovedAsync(Guid tenantId, Guid userId) {
		var account = await GetUserAccountIgnoringFiltersAsync(tenantId, userId);
		account.Should().NotBeNull();
		if (account is null) {
			throw new InvalidOperationException("Seeded user account could not be loaded.");
		}

		account.IsDeleted.Should().BeFalse();
		account.DeletedAt.Should().BeNull();
	}

	private async Task<UserAccount?> GetUserAccountIgnoringFiltersAsync(Guid tenantId, Guid userId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await (
			from account in dbContext.UserAccount.IgnoreQueryFilters()
			where account.TenantId == tenantId
				&& account.UserId == userId
				&& account.Scope == AccountScope.Tenant
			select account
		).FirstOrDefaultAsync();
	}

	// Per docs/guides/bulk-action-ux-conventions.md §6, bulk remove writes one audit
	// row per succeeded user (via LogManyAsync), each carrying that user's real
	// TargetId — never a single aggregate row with TargetId: null.
	private async Task AssertBulkRemoveAuditLogsAsync(
		Guid tenantId,
		DateTime startedAt,
		IReadOnlyCollection<Guid> expectedTargetIds
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var auditLogs = await (
			from log in dbContext.AuditLog
			where log.Action == AuditActions.TenantUserBulkRemoved
				&& log.CreatedAt >= startedAt
			select log
		).ToListAsync();

		auditLogs.Should().HaveCount(expectedTargetIds.Count);
		auditLogs.Select(log => log.TargetId)
			.Should().BeEquivalentTo(expectedTargetIds.Select(id => (Guid?)id));

		foreach (var auditLog in auditLogs) {
			auditLog.Details.Should().NotBeNull();
			Assert.NotNull(auditLog.Details);
			using var document = JsonDocument.Parse(auditLog.Details);
			document.RootElement.GetProperty("TenantId").GetGuid().Should().Be(tenantId);
		}
	}

	private sealed record BulkTenantUserActionResponse {
		public int SucceededCount { get; init; }
		public int FailedCount { get; init; }
		public required List<BulkTenantUserFailedItemResponse> FailedItems { get; init; }
	}

	private sealed record BulkTenantUserFailedItemResponse {
		public Guid UserId { get; init; }
		public string Error { get; init; } = string.Empty;
	}
}
