
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
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public BulkRemoveTenantUsersAsStaffSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _GetBulkRemoveUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.BulkRemoveFn(tenantId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await _GetTenantIdAsync();

		using var response = await _BulkRemoveAsync(
			sessionToken: null,
			tenantId.ToString(),
			new { userIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForTenantUser() {
		var tenantToken = await _AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var tenantId = await _GetTenantIdAsync();

		using var response = await _BulkRemoveAsync(
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
				_Fixture,
				_AuthClient,
				"bulk-remove-tenant-user-no-permission"
			);
		var tenantId = await _GetTenantIdAsync();

		using var response = await _BulkRemoveAsync(
			staffToken,
			tenantId.ToString(),
			new { userIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();

		using var response = await _BulkRemoveAsync(
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
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();

		using var response = await _BulkRemoveRawJsonAsync(
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
	public async Task ItShouldReturnValidationProblemWhenUserIdsExceedTheMaximumCount() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();

		var tooManyUserIds = Enumerable.Range(0, 101).Select(_ => Guid.NewGuid()).ToArray();

		using var response = await _BulkRemoveAsync(
			staffToken,
			tenantId.ToString(),
			new { userIds = tooManyUserIds }
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
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var (tenantId, adminUserId) = await _SeedTenantWithAdminAsync();
		var firstUserId = await _SeedTenantUserAsync(tenantId, AccountLevel.User);
		var secondUserId = await _SeedTenantUserAsync(tenantId, AccountLevel.User);
		var startedAt = DateTime.UtcNow;

		using var response = await _BulkRemoveAsync(
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

		await _AssertUserAccountRemovedAsync(tenantId, firstUserId);
		await _AssertUserAccountRemovedAsync(tenantId, secondUserId);
		await _AssertBulkRemoveAuditLogsAsync(
			tenantId,
			startedAt,
			expectedTargetIds: [firstUserId, secondUserId]
		);
		_ = adminUserId;
	}

	[Fact]
	public async Task ItShouldDeduplicateRepeatedUserIdsBeforeRemoving() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var (tenantId, _) = await _SeedTenantWithAdminAsync();
		var userId = await _SeedTenantUserAsync(tenantId, AccountLevel.User);

		using var response = await _BulkRemoveAsync(
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

		await _AssertUserAccountRemovedAsync(tenantId, userId);
	}

	[Fact]
	public async Task ItShouldReturnPartialResultForMissingAndCrossTenantUsers() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var (tenantId, _) = await _SeedTenantWithAdminAsync();
		var deletableUserId = await _SeedTenantUserAsync(tenantId, AccountLevel.User);
		var missingUserId = Guid.NewGuid();
		var (otherTenantId, otherAdminUserId) = await _SeedTenantWithAdminAsync();
		var startedAt = DateTime.UtcNow;

		using var response = await _BulkRemoveAsync(
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

		await _AssertUserAccountRemovedAsync(tenantId, deletableUserId);
		await _AssertUserAccountNotRemovedAsync(otherTenantId, otherAdminUserId);
		await _AssertBulkRemoveAuditLogsAsync(
			tenantId,
			startedAt,
			expectedTargetIds: [deletableUserId]
		);
	}

	[Fact]
	public async Task ItShouldNotWriteAnAuditLogWhenNothingSucceeds() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var (tenantId, _) = await _SeedTenantWithAdminAsync();
		var missingUserId = Guid.NewGuid();
		var startedAt = DateTime.UtcNow;

		using var response = await _BulkRemoveAsync(
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

		await _AssertBulkRemoveAuditLogsAsync(
			tenantId,
			startedAt,
			expectedTargetIds: []
		);
	}

	[Fact]
	public async Task ItShouldFailWhenRemovingTheLastActiveAdminInTheBatch() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var (tenantId, adminUserId) = await _SeedTenantWithAdminAsync();
		var regularUserId = await _SeedTenantUserAsync(tenantId, AccountLevel.User);

		using var response = await _BulkRemoveAsync(
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

		await _AssertUserAccountRemovedAsync(tenantId, regularUserId);
		await _AssertUserAccountNotRemovedAsync(tenantId, adminUserId);
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

	private async Task<Guid> _GetTenantIdAsync() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_Http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<(Guid TenantId, Guid AdminUserId)> _SeedTenantWithAdminAsync() {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
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

	private async Task<Guid> _SeedTenantUserAsync(Guid tenantId, AccountLevel level) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
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

	private async Task<HttpResponseMessage> _BulkRemoveAsync(
		string? sessionToken,
		string tenantId,
		object body
	) {
		var request = new HttpRequestMessage(HttpMethod.Post, _GetBulkRemoveUrl(tenantId));

		if (sessionToken is not null) {
			request.WithSessionToken(sessionToken);
		}

		request.Content = JsonContent.Create(body);
		return await _Http.SendAsync(request);
	}

	private async Task<HttpResponseMessage> _BulkRemoveRawJsonAsync(
		string sessionToken,
		string tenantId,
		string body
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetBulkRemoveUrl(tenantId)
		).WithSessionToken(sessionToken);

		request.Content = new StringContent(body, Encoding.UTF8, "application/json");
		return await _Http.SendAsync(request);
	}

	private async Task _AssertUserAccountRemovedAsync(Guid tenantId, Guid userId) {
		var account = await _GetUserAccountIgnoringFiltersAsync(tenantId, userId);
		account.Should().NotBeNull();
		if (account is null) {
			throw new InvalidOperationException("Seeded user account could not be loaded.");
		}

		account.IsDeleted.Should().BeTrue();
		account.DeletedAt.Should().NotBeNull();
	}

	private async Task _AssertUserAccountNotRemovedAsync(Guid tenantId, Guid userId) {
		var account = await _GetUserAccountIgnoringFiltersAsync(tenantId, userId);
		account.Should().NotBeNull();
		if (account is null) {
			throw new InvalidOperationException("Seeded user account could not be loaded.");
		}

		account.IsDeleted.Should().BeFalse();
		account.DeletedAt.Should().BeNull();
	}

	private async Task<UserAccount?> _GetUserAccountIgnoringFiltersAsync(Guid tenantId, Guid userId) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
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
	private async Task _AssertBulkRemoveAuditLogsAsync(
		Guid tenantId,
		DateTime startedAt,
		IReadOnlyCollection<Guid> expectedTargetIds
	) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
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
