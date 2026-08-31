
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Tenants.Services;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

using AppRoutes = PublyApp.Api.Lib.Routes.Routes;

namespace PublyApp.Api.Lib.Filters;

// This class, GetTenantAsStaffSpec, GetUserTenantsForPickerSpec, and
// UpdateTenantAsStaffSpec all suspend/reactivate/rename/edit-notes on the
// shared seeded Acme tenant (looked up by name) and restore it in a
// best-effort `finally`. Sharing this DisableParallelization collection stops
// them from racing each other's mutation window; other classes that only
// *read* Acme by name (e.g. via TenantTestHelper.GetTenantIdByNameAsync) are
// unaffected since they run in their own default collections.
[CollectionDefinition("AcmeTenantMutation", DisableParallelization = true)]
public class AcmeTenantMutationCollection;

[Collection("AcmeTenantMutation")]
public sealed class TenantAuthFilterSpec
	: IClassFixture<ApiFixture> {
	// The real tenant-scoped profile endpoint sits behind tenantGroup,
	// which applies session + tenant header + tenant auth. Probing it keeps
	// this spec honest: a real handler answers, not a stub.
	private static string GetTestEndpoint() {
		return PathUtils.Join(
			AppRoutes.Tenant.Root,
			AppRoutes.Account.ForTenant.Root,
			AppRoutes.Account.ForTenant.Profile
		);
	}

	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public TenantAuthFilterSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnOkForActiveTenant() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetTestEndpoint()
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task
	ItShouldReturn403ForSuspendedTenant() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Suspend Acme
		using var suspend =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, acmeId
			);
		suspend.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			var acmeAdminToken =
				await _authClient.LoginAsync(
					TestConstants.AcmeAdminEmail,
					TestConstants.SeedPassword
				);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				GetTestEndpoint()
			)
				.WithSessionToken(acmeAdminToken)
				.WithTenantId(acmeId);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.Forbidden);

			var problem = await response.Content
				.ReadFromJsonAsync<AppProblemDetails>();
			problem.Should().NotBeNull();
			Assert.NotNull(problem);
			problem.TranslationKey.Should()
							.Be("tenant-suspended");
		} finally {
			using var cleanup =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_http, staffToken, acmeId
					);
		}
	}

	[Fact]
	public async Task
	ItShouldReturn403ForNonMember() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// TechStart admin is NOT a member of Acme
		var techStartAdminToken =
			await _authClient.LoginAsync(
				TestConstants.TechStartAdminEmail,
				TestConstants.SeedPassword
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetTestEndpoint()
		)
			.WithSessionToken(techStartAdminToken)
			.WithTenantId(acmeId);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		// Non-member gets generic forbidden, NOT
		// "tenant-suspended"
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("forbidden");
	}

	[Fact]
	public async Task
	ItShouldReturn403WhenStaffAccessesTenantEndpoint() {
		// Staff user has no tenant membership (mutual
		// exclusivity), so accessing a tenant endpoint
		// should return generic 403
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetTestEndpoint()
		)
			.WithSessionToken(staffToken)
			.WithTenantId(acmeId);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("forbidden");
	}

	[Fact]
	public async Task
	ItShouldReturn400WhenTenantHeaderMissing() {
		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetTestEndpoint()
		).WithSessionToken(acmeAdminToken);
		// Deliberately NOT setting tenant header

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
					.Be("tenant-id-required");
	}

	[Fact]
	public async Task
	ItShouldReturn400WhenTenantHeaderIsInvalidGuid() {
		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetTestEndpoint()
		).WithSessionToken(acmeAdminToken);

		request.Headers.TryAddWithoutValidation(
			TestConstants.TenantIdHeader,
			"not-a-valid-guid"
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
					.Be("bad-request");
	}

	[Fact]
	public async Task
	ItShouldReturn401WhenSessionTokenMissing() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetTestEndpoint()
		).WithTenantId(acmeId);
		// Deliberately NOT setting session token

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturn401WhenSessionTokenInvalid() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetTestEndpoint()
		)
			.WithSessionToken("invalid-token")
			.WithTenantId(acmeId);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturn403ForMemberOfSoftDeletedTenant() {
		// #365 R5 / #1510: a soft-deleted tenant's members cannot act in tenant
		// scope. TenantAuthFilter resolves the tenant through
		// GetTenantByIdIncludingSuspendedAsync, which excludes IsDeleted rows, so
		// membership alone must NOT reopen access after deletion. Prior to this
		// spec nothing exercised the deleted path (only suspended/reactivated),
		// leaving the boundary a promise.
		var (tenantId, memberUserId, memberEmail) =
			await SeedMemberOfFreshTenantAsync();

		try {
			var memberToken = await _authClient.LoginAsync(
				memberEmail, TestConstants.SeedPassword
			);

			// Sanity: before deletion the member can reach the tenant-scope surface.
			using (var beforeRequest = new HttpRequestMessage(
				HttpMethod.Get, GetTestEndpoint()
			)
				.WithSessionToken(memberToken)
				.WithTenantId(tenantId)) {
				using var beforeResponse =
					await _http.SendAsync(beforeRequest);
				beforeResponse.StatusCode.Should()
					.Be(HttpStatusCode.OK);
			}

			// Delete the tenant (soft) directly: the same row state
			// CleanupExpiredSessions-style sweeps operate on.
			await using (var deleteScope =
				_fixture.Factory.Services.CreateAsyncScope()) {
				var dbContext = deleteScope.ServiceProvider
					.GetRequiredService<AppDbContext>();
				await dbContext.Tenant
					.Where(t => t.Id == tenantId)
					.ExecuteUpdateAsync(setters => setters
						.SetProperty(t => t.IsDeleted, true)
						.SetProperty(t => t.DeletedAt, DateTime.UtcNow));
			}

			using var request = new HttpRequestMessage(
				HttpMethod.Get, GetTestEndpoint()
			)
				.WithSessionToken(memberToken)
				.WithTenantId(tenantId);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.Forbidden,
					"[#1510] a member of a soft-deleted tenant must lose tenant-scope "
					+ "access — the deleted-tenant boundary is not a promise");
		} finally {
			await HardDeleteMemberOfFreshTenantAsync(tenantId, memberUserId);
		}
	}

	[Fact]
	public async Task
	ItShouldRestoreAccessAfterReactivation() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Suspend
		using var suspend =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, acmeId
			);
		suspend.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			// Reactivate
			using var reactivate =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_http, staffToken, acmeId
					);
			reactivate.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			// Now access should work
			var acmeAdminToken =
				await _authClient.LoginAsync(
					TestConstants.AcmeAdminEmail,
					TestConstants.SeedPassword
				);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				GetTestEndpoint()
			)
				.WithSessionToken(acmeAdminToken)
				.WithTenantId(acmeId);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);
		} finally {
			// Safety net if reactivate didn't run
			try {
				using var cleanup =
					await TenantTestHelper
						.ReactivateTenantAsync(
							_http, staffToken, acmeId
						);
			} catch {
				// Ignore — tenant may already be active
			}
		}
	}

	[Fact]
	public async Task
	ItShouldSetLastActivityAtWhenNullOnTenantScopedRequest() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		await SetLastActivityAtAsync(acmeId, null);

		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetTestEndpoint()
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var lastActivityAt =
			await GetLastActivityAtAsync(acmeId);
		lastActivityAt.Should().NotBeNull();
		lastActivityAt!.Value.Should().BeCloseTo(
			DateTime.UtcNow, TimeSpan.FromSeconds(10)
		);
	}

	[Fact]
	public async Task
	ItShouldNotRewriteLastActivityAtWithinThrottleWindow() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		await SetLastActivityAtAsync(acmeId, null);

		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using (var firstRequest = new HttpRequestMessage(
			HttpMethod.Get,
			GetTestEndpoint()
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId)) {
			using var firstResponse =
				await _http.SendAsync(firstRequest);
			firstResponse.StatusCode.Should()
				.Be(HttpStatusCode.OK);
		}

		var firstValue =
			await GetLastActivityAtAsync(acmeId);
		firstValue.Should().NotBeNull();

		using (var secondRequest = new HttpRequestMessage(
			HttpMethod.Get,
			GetTestEndpoint()
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId)) {
			using var secondResponse =
				await _http.SendAsync(secondRequest);
			secondResponse.StatusCode.Should()
				.Be(HttpStatusCode.OK);
		}

		var secondValue =
			await GetLastActivityAtAsync(acmeId);
		secondValue.Should().Be(firstValue);
	}

	[Fact]
	public async Task
	ItShouldNotSetLastActivityAtForStaffRequests() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		await SetLastActivityAtAsync(acmeId, null);

		var url = PathUtils.Join(
			AppRoutes.Staff.Root,
			AppRoutes.Tenants.ForStaff.Root,
			AppRoutes.Tenants.ForStaff.GetByIdFn(
				acmeId.ToString()
			)
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var lastActivityAt =
			await GetLastActivityAtAsync(acmeId);
		lastActivityAt.Should().BeNull();
	}

	[Fact]
	public async Task
	ItShouldNotOverwriteLastActivityAtWhenAlreadyFreshEvenWhenTouchedDirectly() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Within the default 5-minute throttle window, but distinguishable from
		// "now" by far more than any reasonable test-timing slop.
		var freshValue = DateTime.UtcNow.AddMinutes(-1);
		await SetLastActivityAtAsync(acmeId, freshValue);

		// Calls the service directly, bypassing TenantAuthFilter's own in-memory
		// pre-check, to prove the ExecuteUpdateAsync WHERE clause itself is the
		// guard: concurrent requests racing on a stale in-memory snapshot must
		// not all issue a write once one of them has already refreshed the row.
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var tenantService =
			scope.ServiceProvider.GetRequiredService<ITenantService>();
		await tenantService.TouchLastActivityAsync(acmeId);

		var afterValue = await GetLastActivityAtAsync(acmeId);
		afterValue.Should().BeCloseTo(freshValue, TimeSpan.FromSeconds(1));
	}

	[Fact]
	public async Task
	ItShouldStillReturnOkWhenTheLastActivityWriteThrows() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		await SetLastActivityAtAsync(acmeId, null);

		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		await using var throwingFactory =
			_fixture.Factory.WithWebHostBuilder(builder => {
				builder.ConfigureServices(services => {
					services.RemoveAll<ITenantService>();
					services.AddScoped<ITenantService>(sp =>
						new ThrowingTouchTenantService(
							new TenantService(
								sp.GetRequiredService<AppDbContext>()
							)
						));
				});
			});
		using var throwingClient = throwingFactory.CreateClient(
			new WebApplicationFactoryClientOptions {
				HandleCookies = false
			}
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetTestEndpoint()
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId);

		using var response =
			await throwingClient.SendAsync(request);

		// The proof this test exists for: an ancillary write failure must not
		// turn an otherwise-valid tenant request into a 500 (round-6 F8).
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var lastActivityAt =
			await GetLastActivityAtAsync(acmeId);
		lastActivityAt.Should().BeNull();
	}

	// Decorates the real TenantService so reads behave normally but the
	// ancillary write always fails, proving TenantAuthFilter isolates that
	// failure from the request's success path.
	private sealed class ThrowingTouchTenantService : ITenantService {
		private readonly ITenantService _inner;

		public ThrowingTouchTenantService(ITenantService inner) {
			_inner = inner;
		}

		public Task<Tenant?> GetTenantByIdAsync(
			Guid tenantId,
			CancellationToken cancellationToken = default
		) {
			return _inner.GetTenantByIdAsync(tenantId, cancellationToken);
		}

		public Task<Tenant?> GetTenantByIdIncludingSuspendedAsync(
			Guid tenantId,
			CancellationToken cancellationToken = default
		) {
			return _inner.GetTenantByIdIncludingSuspendedAsync(
				tenantId, cancellationToken
			);
		}

		public Task TouchLastActivityAsync(
			Guid tenantId,
			CancellationToken cancellationToken = default
		) {
			throw new InvalidOperationException(
				"simulated last-activity write failure"
			);
		}
	}

	private async Task SetLastActivityAtAsync(
		Guid tenantId,
		DateTime? value
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		await dbContext.Tenant
			.Where(t => t.Id == tenantId)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(t => t.LastActivityAt, value));
	}

	private async Task<DateTime?> GetLastActivityAtAsync(
		Guid tenantId
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		return await dbContext.Tenant
			.AsNoTracking()
			.Where(t => t.Id == tenantId)
			.Select(t => t.LastActivityAt)
			.SingleAsync();
	}

	// Seeds a fresh tenant + one member user (with a real password, so the member
	// can log in through the HTTP surface like production). Returns the tenant id,
	// the user id, and the email — the caller owns cleanup via
	// <see cref="HardDeleteMemberOfFreshTenantAsync"/>.
	private async Task<(Guid tenantId, Guid userId, string email)>
		SeedMemberOfFreshTenantAsync() {
		var email = $"deleted-tenant-member-{Guid.NewGuid():N}@example.com";

		await using var dbContext =
			_fixture.Factory.Services.CreateAsyncScope()
				.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Code = $"deleted-probe-{Guid.NewGuid():N}",
			Name = "Deleted Probe Tenant",
			Status = TenantStatus.Active,
			MaxUsers = 10
		};
		dbContext.Tenant.Add(tenant);

		var member = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "Deleted",
			LastName = "Probe",
			Status = UserStatus.Active,
			IsVerified = true
		};
		dbContext.User.Add(member);
		await dbContext.SaveChangesAsync();

		dbContext.UserAccount.Add(UserAccount.CreateTenantAccount(
			member.GetRequiredId(), tenant.GetRequiredId()
		));
		await dbContext.SaveChangesAsync();

		return (tenant.GetRequiredId(), member.GetRequiredId(), email);
	}

	// Hard-deletes the probe tenant + member + account so the spec leaves no
	// soft-deleted rows behind (the point of the spec is the boundary, not
	// retention-sweep behavior).
	private async Task HardDeleteMemberOfFreshTenantAsync(
		Guid tenantId,
		Guid userId
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var accounts = await dbContext.UserAccount
			.Where(a => a.TenantId == tenantId || a.UserId == userId)
			.ToListAsync();
		dbContext.UserAccount.RemoveRange(accounts);

		var tenant = await dbContext.Tenant
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(t => t.Id == tenantId);
		if (tenant is not null) {
			dbContext.Tenant.Remove(tenant);
		}

		var member = await dbContext.User
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(u => u.Id == userId);
		if (member is not null) {
			dbContext.User.Remove(member);
		}

		await dbContext.SaveChangesAsync();
	}
}
