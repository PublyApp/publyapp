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
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.AuditLogs.Handlers.Staff;

/// <summary>
/// Integration specs for the tenant-scoped activity feed
/// (GET /staff/tenants/{tenantId}/activity, issue #364).
///
/// The audit_logs table carries no tenant_id column, so tenant
/// scope is DERIVED server-side: the entry targets the tenant
/// itself, or the acting user holds (or held) a Tenant-scope
/// account in that tenant. The tenant identifier comes only from
/// the route segment — the surface accepts no scope filters —
/// and every spec here anchors one consequence of that design.
/// </summary>
public sealed class FindTenantActivityForStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindTenantActivityForStaffSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			$"{tenantId}/activity"
		);
	}

	private async Task<string> LoginStaffAsync() {
		return await _authClient.LoginAsStaffAdminAsync();
	}

	private async Task<Guid> SeedTenantAsync(
		string namePrefix
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"{namePrefix} {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 20,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		return tenant.GetRequiredId();
	}

	private async Task<Guid> SeedTenantMemberAsync(
		Guid tenantId,
		string firstName = "Member",
		string lastName = "Fixture"
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = $"tenant-activity-{Guid.NewGuid():N}@example.com",
			Password = PasswordUtils.HashPassword(
				TestConstants.SeedPassword
			),
			FirstName = firstName,
			LastName = lastName,
			Status = UserStatus.Active,
			IsVerified = true,
		};
		await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();

		var account = UserAccount.CreateTenantAccount(
			user.GetRequiredId(), tenantId
		);
		await dbContext.UserAccount.AddAsync(account);
		await dbContext.SaveChangesAsync();

		return user.GetRequiredId();
	}

	private async Task<Guid> SeedEntryAsync(
		Guid actorUserId,
		string action,
		Guid? targetId = null
	) {
		return await AuditLogTestHelper.SeedAuditLogAsync(
			_fixture.Factory,
			actorUserId,
			action,
			targetId
		);
	}

	private async Task<FindTenantActivityResponseShape>
		GetActivityAsync(string url, string token) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
		var result = await response.Content!
			.ReadFromSystemTextJsonAsync<FindTenantActivityResponseShape>();
		return result!;
	}

	[Fact]
	public async Task
		ItShouldShowOnlyTenantScopedEntriesForTheRequestedTenant() {
		var token = await LoginStaffAsync();
		var tenantA = await SeedTenantAsync("Activity Alpha");
		var tenantB = await SeedTenantAsync("Activity Beta");
		var memberA = await SeedTenantMemberAsync(tenantA);
		var memberB = await SeedTenantMemberAsync(tenantB);

		var staffUserId =
			await AuditLogTestHelper.GetUserIdByEmailAsync(
				_fixture.Factory,
				TestConstants.StaffAdminEmail
			);

		var alphaMemberEntry = await SeedEntryAsync(
			memberA, AuditActions.PostCreated
		);
		var alphaTargetEntry = await SeedEntryAsync(
			staffUserId, AuditActions.TenantUpdated, tenantA
		);
		await SeedEntryAsync(memberB, AuditActions.PostCreated);
		await SeedEntryAsync(
			staffUserId, AuditActions.TenantSuspended, tenantB
		);

		var result = await GetActivityAsync(
			GetUrl(tenantA.ToString()), token
		);

		var ids = result.Data.Select(e => e.Id).ToList();
		ids.Should().Contain(alphaMemberEntry);
		ids.Should().Contain(alphaTargetEntry);
		ids.Should().HaveCount(2);
	}

	[Fact]
	public async Task
		ItShouldStayTenantScopedWhenForgedFiltersAreAppendedToTheRequest() {
		var token = await LoginStaffAsync();
		var tenantA = await SeedTenantAsync("Activity Forge A");
		var tenantB = await SeedTenantAsync("Activity Forge B");
		var memberA = await SeedTenantMemberAsync(tenantA);
		var memberB = await SeedTenantMemberAsync(tenantB);

		var alphaEntry = await SeedEntryAsync(
			memberA, AuditActions.PostCreated
		);
		await SeedEntryAsync(memberB, AuditActions.PostCreated);

		// A caller tries to widen the feed toward tenant B through
		// query-string forgery; the surface binds no scope filters,
		// so the response must remain exactly tenant A's entries.
		var forgedUrl = GetUrl(tenantA.ToString())
			+ $"?target_id={tenantB}"
			+ $"&user_id={memberB}"
			+ "&actions=" + AuditActions.PostCreated
			+ "&limit=50";
		var result = await GetActivityAsync(forgedUrl, token);

		var ids = result.Data.Select(e => e.Id).ToList();
		ids.Should().HaveCount(1);
		ids.Should().Contain(alphaEntry);
	}

	[Fact]
	public async Task
		ItShouldKeepActorNameAfterMembershipRemovalAndIdentityDeletion() {
		var token = await LoginStaffAsync();
		var tenantId = await SeedTenantAsync("Activity Ghost");
		var member = await SeedTenantMemberAsync(
			tenantId, "Ghost", "Member"
		);

		var entryId = await SeedEntryAsync(
			member, AuditActions.PostCreated
		);

		// History outlives the rows it references: hard-remove the
		// membership and soft-delete the identity, then require the
		// historical actor's name to persist (resolved off the
		// global user id, ignoring soft-delete filters).
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		var account = await dbContext.UserAccount
			.SingleAsync(a =>
				a.UserId == member && a.TenantId == tenantId);
		dbContext.UserAccount.Remove(account);
		await dbContext.SaveChangesAsync();
		var ghostUser = await dbContext.User
			.SingleAsync(u => u.Id == member);
		ghostUser.IsDeleted = true;
		await dbContext.SaveChangesAsync();

		var result = await GetActivityAsync(
			GetUrl(tenantId.ToString()), token
		);

		var entry = result.Data
			.SingleOrDefault(e => e.Id == entryId);
		entry.Should().NotBeNull();
		entry!.UserName.Should().Be("Ghost Member");
		entry.UserEmail.Should().NotBeNullOrWhiteSpace();
	}

	[Fact]
	public async Task
		ItShouldHideSoftDeletedAuditEntries() {
		var token = await LoginStaffAsync();
		var tenantId = await SeedTenantAsync("Activity Deleted");
		var member = await SeedTenantMemberAsync(tenantId);

		var entryId = await SeedEntryAsync(
			member, AuditActions.PostCreated
		);

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		var entry = await dbContext.AuditLog
			.SingleAsync(l => l.Id == entryId);
		entry.IsDeleted = true;
		await dbContext.SaveChangesAsync();

		var result = await GetActivityAsync(
			GetUrl(tenantId.ToString()), token
		);

		result.Data.Should()
			.NotContain(e => e.Id == entryId);
	}

	[Fact]
	public async Task
		ItShouldReturnNotFoundForUnknownTenant() {
		var token = await LoginStaffAsync();
		var url = GetUrl(Guid.NewGuid().ToString());

		using var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task
		ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await LoginStaffAsync();
		var url = GetUrl("not-a-guid");

		using var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
		ItShouldReturnUnauthorizedWithoutSessionToken() {
		var url = GetUrl(Guid.NewGuid().ToString());

		using var response = await _http.SendAsync(
			new HttpRequestMessage(HttpMethod.Get, url)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
		ItShouldReturnForbiddenForTenantScopedUser() {
		var tenantToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var url = GetUrl(Guid.NewGuid().ToString());

		using var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(tenantToken);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
		ItShouldRejectMutatingHttpMethodsOnTheActivityRoute() {
		var token = await LoginStaffAsync();
		var tenantId = await SeedTenantAsync("Activity Readonly");
		var url = GetUrl(tenantId.ToString());

		var mutatingMethods = new HttpMethod[] {
			HttpMethod.Post,
			HttpMethod.Put,
			HttpMethod.Patch,
			HttpMethod.Delete,
		};
		foreach (var method in mutatingMethods) {
			using var request = new HttpRequestMessage(
				method, url
			).WithSessionToken(token);
			using var response = await _http.SendAsync(request);

			// The surface must expose READ only: mutating verbs hit
			// no endpoint (405), so audit entries can never be
			// created, edited, nor deleted from this tab.
			response.StatusCode.Should()
				.Be(HttpStatusCode.MethodNotAllowed,
					$"{method} must not be routed on the activity surface");
		}
	}

	[Fact]
	public async Task
		ItShouldPaginateByKeysetCursorWhenMoreResultsExist() {
		var token = await LoginStaffAsync();
		var tenantId = await SeedTenantAsync("Activity Pages");
		var staffUserId =
			await AuditLogTestHelper.GetUserIdByEmailAsync(
				_fixture.Factory,
				TestConstants.StaffAdminEmail
			);

		var first = await SeedEntryAsync(
			staffUserId, AuditActions.TenantUpdated, tenantId
		);
		var second = await SeedEntryAsync(
			staffUserId, AuditActions.TenantSuspended, tenantId
		);
		var third = await SeedEntryAsync(
			staffUserId, AuditActions.TenantReactivated, tenantId
		);

		var pageOne = await GetActivityAsync(
			GetUrl(tenantId.ToString()) + "?limit=2", token
		);
		pageOne.NextCursor.Should().NotBeNullOrEmpty();

		var pageTwo = await GetActivityAsync(
			GetUrl(tenantId.ToString())
				+ $"?limit=2&cursor={pageOne.NextCursor}",
			token
		);

		var pageIds = pageOne.Data
			.Select(e => e.Id)
			.Concat(pageTwo.Data.Select(e => e.Id))
			.ToList();
		pageIds.Should().HaveCount(3);
		var expectedIds = new Guid[] { first, second, third };
		pageIds.Distinct().Should()
			.BeEquivalentTo(expectedIds);
	}

	[Fact]
	public async Task
		ItShouldReturnBadRequestForMalformedCursor() {
		var token = await LoginStaffAsync();
		var tenantId = await SeedTenantAsync("Activity Cursor");

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString()) + "?cursor=nope"
		).WithSessionToken(token);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);
	}
}

// Test-local wire shapes: kept loose so this spec compiles and
// runs against the raw route before (and after) the typed
// handler/client exist.
public sealed class FindTenantActivityResponseShape {
	public List<AuditLogEntryShape> Data { get; set; } = [];
	public string? NextCursor { get; set; }
}

public sealed class AuditLogEntryShape {
	public Guid Id { get; set; }
	public Guid UserId { get; set; }
	public string UserName { get; set; } = string.Empty;
	public string UserEmail { get; set; } = string.Empty;
	public string Action { get; set; } = string.Empty;
	public Guid? TargetId { get; set; }
	public string? IpAddress { get; set; }
	public DateTime CreatedAt { get; set; }
}

internal static class FindTenantActivityHttpResponseExtensions {
	// System.Net.Http.Json's ReadFromJsonAsync is available; wrap it
	// under a domain-neutral name so both pages above stay terse.
	public static async System.Threading.Tasks.Task<T>
		ReadFromSystemTextJsonAsync<T>(
		this HttpContent content,
		System.Threading.CancellationToken cancellationToken = default
	) where T : class {
		return await content
			.ReadFromJsonAsync<T>(cancellationToken: cancellationToken)
			?? throw new InvalidOperationException(
				"Response body deserialized to null");
	}
}
