
using System.Net;
using System.Reflection;
using System.Text;
using System.Text.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

// SetExportMaxRows mutates the global AppEnvironment singleton via reflection.
// DisableParallelization ensures this class never overlaps with other test
// classes that might hit the export endpoint or mutate the same field.
[CollectionDefinition("TenantUserExport", DisableParallelization = true)]
public class TenantUserExportCollection;

[Collection("TenantUserExport")]
public sealed class ExportTenantUsersAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public ExportTenantUsersAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetExportUrl(
		string tenantId,
		string? search = null,
		string? status = null,
		string? level = null,
		string? ids = null
	) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.ExportFn(tenantId)
		);

		var queryParams = new List<string>();
		if (search is not null) {
			queryParams.Add($"q={Uri.EscapeDataString(search)}");
		}
		if (status is not null) {
			queryParams.Add($"status={Uri.EscapeDataString(status)}");
		}
		if (level is not null) {
			queryParams.Add($"level={Uri.EscapeDataString(level)}");
		}
		if (ids is not null) {
			queryParams.Add($"ids={Uri.EscapeDataString(ids)}");
		}

		return queryParams.Count == 0
			? url
			: url + "?" + string.Join("&", queryParams);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantId.ToString())
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForTenantUser() {
		var tenantToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantId.ToString())
		).WithSessionToken(tenantToken);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var staffToken = await _authClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantId.ToString())
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl("not-a-guid")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturn422ForInvalidStatus() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantId.ToString(), status: "bogus")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldReturn422ForInvalidIds() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantId.ToString(), ids: "not-a-guid")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldReturn422WhenIdsExceedTheMaximumCount() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		var ids = string.Join(",", Enumerable.Range(0, 101).Select(_ => Guid.NewGuid()));

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantId.ToString(), ids: ids)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldReturn422WhenSearchExceedsTwoHundredCharacters() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		var tooLongSearch = new string('a', 201);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantId.ToString(), search: tooLongSearch)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldReturn422ForInvalidLevel() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantId.ToString(), level: "owner")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldReturn200ForWhitespaceStatus() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantId.ToString(), status: " ")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task ItShouldReturn200ForWhitespaceLevel() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantId.ToString(), level: " ")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task ItShouldReturn200ForWhitespaceIds() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantId.ToString(), ids: " ")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task ItShouldExcludeCrossTenantIdsFromExport() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var (tenantAId, _) = await SeedTenantWithAdminAsync();
		var (tenantBId, _) = await SeedTenantWithAdminAsync();

		var (tenantAUserId, tenantAEmail) = await SeedTenantUserWithIdAsync(tenantAId, "idor-tenant-a");
		var (tenantBUserId, tenantBEmail) = await SeedTenantUserWithIdAsync(tenantBId, "idor-tenant-b");

		// Ask tenant A's export for both tenant A's and tenant B's user ids: the tenant B
		// id must never leak into tenant A's CSV, no matter what `ids` claims.
		var ids = $"{tenantAUserId},{tenantBUserId}";

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantAId.ToString(), ids: ids)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var content = await response.Content.ReadAsStringAsync();
		content.Should().Contain(tenantAEmail);
		content.Should().NotContain(tenantBEmail);
	}

	[Fact]
	public async Task ItShouldReturnCsvWithExpectedHeadersAndContentType() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var (_, email) = await SeedTenantUserWithIdAsync(tenantId, "export-basic");

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		Assert.NotNull(response.Content.Headers.ContentType);
		response.Content.Headers.ContentType.MediaType.Should().Be("text/csv");

		var dispositionHeader = response.Content.Headers.ContentDisposition;
		dispositionHeader.Should().NotBeNull();
		Assert.NotNull(dispositionHeader);
		dispositionHeader.DispositionType.Should().Be("attachment");
		dispositionHeader.FileName.Should().StartWith("tenant-users-").And.EndWith(".csv");

		var content = await response.Content.ReadAsStringAsync();
		content.Should().StartWith("Email,FirstName,LastName,Level,Status,CreatedAt");
		content.Should().Contain(email);
	}

	[Fact]
	public async Task ItShouldApplyLevelFilterToExport() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var adminEmail = await SeedTenantUserWithEmailAsync(tenantId, AccountLevel.Admin, "export-admin");
		var userEmail = await SeedTenantUserWithEmailAsync(tenantId, AccountLevel.User, "export-user");

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantId.ToString(), level: "admin")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var content = await response.Content.ReadAsStringAsync();
		content.Should().Contain(adminEmail);
		content.Should().NotContain(userEmail);
	}

	[Fact]
	public async Task ItShouldHonorIdsSelectionForExport() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var (firstUserId, firstEmail) = await SeedTenantUserWithIdAsync(tenantId, "export-selected");
		var (_, secondEmail) = await SeedTenantUserWithIdAsync(tenantId, "export-unselected");

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantId.ToString(), ids: firstUserId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var content = await response.Content.ReadAsStringAsync();
		content.Should().Contain(firstEmail);
		content.Should().NotContain(secondEmail);
	}

	[Fact]
	public async Task ItShouldNeutralizeFormulaTriggerCharsWhenExportingCsv() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var rowMarker = $"row-marker-{Guid.NewGuid().ToString()[..8]}";

		await SeedTenantUserWithNameAsync(tenantId, $"=1+1 {rowMarker}", "Formula");
		await SeedTenantUserWithNameAsync(tenantId, $"+cmd|'/C calc'!A0 {rowMarker}", "Formula");
		await SeedTenantUserWithNameAsync(tenantId, $"-1+1 {rowMarker}", "Formula");
		await SeedTenantUserWithNameAsync(tenantId, $"@SUM(A1:A10) {rowMarker}", "Formula");

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var content = await response.Content.ReadAsStringAsync();

		content.Should().Contain($"'=1+1 {rowMarker}");
		content.Should().Contain($"'+cmd|'/C calc'!A0 {rowMarker}");
		content.Should().Contain($"'-1+1 {rowMarker}");
		content.Should().Contain($"'@SUM(A1:A10) {rowMarker}");

		var lines = content.Split('\n').Where(l => l.Contains(rowMarker)).ToList();
		foreach (var line in lines) {
			line.Should().NotContain(",=");
			line.Should().NotContain(",+cmd");
			line.Should().NotContain(",-1+1");
			line.Should().NotContain(",@SUM");
		}
	}

	[Fact]
	public async Task ItShouldWriteAnAuditLogBeforeStreamingTheExport() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		await SeedTenantUserWithIdAsync(tenantId, "export-audit");
		var startedAt = DateTime.UtcNow;

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var uploaderUserId = await AuditLogTestHelper.GetUserIdByEmailAsync(
			_fixture.Factory, TestConstants.StaffAdminEmail
		);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var auditLog = await (
			from log in dbContext.AuditLog
			where log.Action == AuditActions.TenantUserExported
				&& log.UserId == uploaderUserId
				&& log.TargetId == tenantId
				&& log.CreatedAt >= startedAt
			select log
		).FirstOrDefaultAsync();

		auditLog.Should().NotBeNull("a tenant user export must write an audit log entry");
		if (auditLog is null) {
			throw new InvalidOperationException("Export audit log was not written.");
		}

		auditLog.Details.Should().NotBeNull();
		Assert.NotNull(auditLog.Details);
		auditLog.Details.Should().Contain("RowCount");
	}

	[Fact]
	public async Task ItShouldTreatABarePercentSearchAsALiteralCharacterNotAWildcardForEveryRow() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var (tenantId, _) = await SeedTenantWithAdminAsync();
		var marker = Guid.NewGuid().ToString("N")[..8];
		await SeedTenantUserWithNameAsync(tenantId, $"Has%Percent{marker}", "Search");
		await SeedTenantUserWithNameAsync(tenantId, $"NoPercentAtAll{marker}", "Search");

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetExportUrl(tenantId.ToString(), search: "%")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var content = await response.Content.ReadAsStringAsync();
		// If '%' were interpolated unescaped into the ILIKE pattern, "%%%" collapses to
		// a bare wildcard that matches every row — an "empty search" that looks narrow
		// in the logs but dumps the whole tenant. Escaped, it must match only rows that
		// literally contain a '%' character.
		content.Should().Contain($"Has%Percent{marker}");
		content.Should().NotContain($"NoPercentAtAll{marker}");
	}

	// WriteCsvAsync's mid-stream failure path (r2 F6) cannot be exercised through
	// a real HTTP round-trip: TestServer has no way to make the buffered row
	// enumeration throw after rows have already been written. Call the (public)
	// streaming method directly with a throwing enumerable and a fake
	// IHttpRequestLifetimeFeature so the abort behavior is actually pinned.
	[Fact]
	public async Task ItShouldAbortTheConnectionWhenTheExportEnumerationThrowsMidStream() {
		var lifetimeFeature = new FakeHttpRequestLifetimeFeature();
		var features = new FeatureCollection();
		features.Set<IHttpRequestLifetimeFeature>(lifetimeFeature);
		features.Set<IHttpResponseFeature>(new HttpResponseFeature());
		features.Set<IHttpResponseBodyFeature>(new StreamResponseBodyFeature(new MemoryStream()));

		var httpContext = new DefaultHttpContext(features);

		var act = async () => await ExportTenantUsersAsStaff.WriteCsvAsync(
			httpContext,
			ThrowingExportItems(),
			CancellationToken.None
		);

		await act.Should().ThrowAsync<InvalidOperationException>();
		lifetimeFeature.WasAborted.Should().BeTrue(
			"a mid-stream failure must abort the connection, not silently truncate the CSV"
		);
	}

	private static IEnumerable<TenantUserExportItem> ThrowingExportItems() {
		yield return new TenantUserExportItem {
			Email = "first-row@example.com",
			Level = AccountLevel.User,
			Status = TenantUserStatus.Active,
			CreatedAt = DateTime.UtcNow,
		};
		throw new InvalidOperationException("Simulated mid-stream enumeration failure");
	}

	private sealed class FakeHttpRequestLifetimeFeature
		: IHttpRequestLifetimeFeature {
		public bool WasAborted { get; private set; }
		public CancellationToken RequestAborted { get; set; }

		public void Abort() {
			WasAborted = true;
		}
	}

	[Fact]
	public async Task ItShouldReturn400WhenExportExceedsLimit() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var (tenantId, _) = await SeedTenantWithAdminAsync();
		for (var i = 0; i < 3; i++) {
			await SeedTenantUserAsync(tenantId, "export-limit");
		}

		var originalLimit = AppEnvironment.Instance.TENANT_USER_EXPORT_MAX_ROWS;
		SetExportMaxRows(2);

		try {
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				GetExportUrl(tenantId.ToString())
			).WithSessionToken(token);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		} finally {
			SetExportMaxRows(originalLimit);
		}
	}

	[Fact]
	public async Task ItShouldExportAConsistentSnapshotWhenAMatchingUserIsInsertedAtTheLimit() {
		const int exportLimit = 2;
		var (tenantId, _) = await SeedTenantWithAdminAsync();
		var oldestCreatedAt = DateTime.UtcNow.AddDays(-1);
		var (_, oldestEmail) = await SeedTenantUserWithIdAsync(
			tenantId,
			"export-race-oldest",
			oldestCreatedAt
		);

		var connectionString = await GetConnectionStringAsync();
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql(connectionString)
			.Options;

		await using var exportDbContext = new AppDbContext(options);
		var queryService = new TenantUserQueryService(exportDbContext);
		var auditLogService = new BarrierAuditLogService();
		var authContext = new RequestAuthContext {
			AccountStaff = UserAccount.CreateStaffAccount(Guid.NewGuid())
		};

		await using var requestScope = _fixture.Factory.Services.CreateAsyncScope();
		var responseBody = new MemoryStream();
		var httpContext = new DefaultHttpContext {
			RequestServices = requestScope.ServiceProvider
		};
		httpContext.Response.Body = responseBody;

		var originalLimit = AppEnvironment.Instance.TENANT_USER_EXPORT_MAX_ROWS;
		SetExportMaxRows(exportLimit);

		try {
			var exportTask = ExportTenantUsersAsStaff.Handle(
				tenantId.ToString(),
				new ExportTenantUsersAsStaffQuery(),
				queryService,
				auditLogService,
				authContext,
				NullLogger<ExportTenantUsersAsStaff>.Instance,
				httpContext,
				CancellationToken.None
			);

			try {
				await auditLogService.Reached.Task.WaitAsync(TimeSpan.FromSeconds(10));

				_ = await SeedTenantUserWithIdAsync(
					tenantId,
					"export-race-concurrent",
					DateTime.UtcNow.AddDays(1)
				);
			} finally {
				auditLogService.Release.TrySetResult();
			}

			var result = await exportTask.WaitAsync(TimeSpan.FromSeconds(10));
			await result.ExecuteAsync(httpContext);

			var content = Encoding.UTF8.GetString(responseBody.ToArray());
			if (httpContext.Response.StatusCode == StatusCodes.Status400BadRequest) {
				content.Should().NotContain("Email,FirstName,LastName,Level,Status,CreatedAt");
				httpContext.Response.Headers.ContentDisposition.Should().BeEmpty();
				auditLogService.Entries.Should().BeEmpty();
				return;
			}

			httpContext.Response.StatusCode.Should().Be(StatusCodes.Status200OK);
			var emittedRowCount = content
				.Split('\n', StringSplitOptions.RemoveEmptyEntries)
				.Skip(1)
				.Count();

			emittedRowCount.Should().Be(exportLimit);
			content.Should().Contain(
				oldestEmail,
				"a successful snapshot export must not silently drop an older matching row"
			);

			var auditEntry = auditLogService.Entries.Should().ContainSingle().Subject;
			var details = JsonSerializer.SerializeToElement(auditEntry.Details);
			details.GetProperty("RowCount").GetInt32().Should().Be(emittedRowCount);
		} finally {
			auditLogService.Release.TrySetResult();
			SetExportMaxRows(originalLimit);
		}
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
			Name = $"Export Tenant {unique}",
			Code = Guid.NewGuid().ToString("N")[..12],
			Status = TenantStatus.Active,
			MaxUsers = 100,
		};
		var admin = new User {
			Email = $"export-admin-{unique}@example.com",
			Password = "unused",
			FirstName = "Export",
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

	private async Task<Guid> SeedTenantUserAsync(Guid tenantId, string emailPrefix) {
		var (userId, _) = await SeedTenantUserWithIdAsync(tenantId, emailPrefix);
		return userId;
	}

	private async Task<(Guid UserId, string Email)> SeedTenantUserWithIdAsync(
		Guid tenantId,
		string emailPrefix,
		DateTime? createdAt = null
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var unique = Guid.NewGuid().ToString("N");
		var email = $"{emailPrefix}-{unique}@example.com";
		var user = new User {
			Email = email,
			Password = "unused",
			FirstName = "Export",
			LastName = "User",
			Status = UserStatus.Active,
			IsVerified = true,
		};

		await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();

		var userId = user.GetRequiredId();
		if (createdAt is not null) {
			var usersToStamp =
				from candidate in dbContext.User
				where candidate.Id == userId
				select candidate;
			_ = await usersToStamp
				.ExecuteUpdateAsync(setters => setters
					.SetProperty(x => x.CreatedAt, createdAt.Value)
				);
		}

		await dbContext.UserAccount.AddAsync(
			UserAccount.CreateTenantAccount(userId, tenantId, AccountLevel.User)
		);
		await dbContext.SaveChangesAsync();

		return (userId, email);
	}

	private async Task<string> SeedTenantUserWithEmailAsync(
		Guid tenantId,
		AccountLevel level,
		string emailPrefix
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var unique = Guid.NewGuid().ToString("N");
		var email = $"{emailPrefix}-{unique}@example.com";
		var user = new User {
			Email = email,
			Password = "unused",
			FirstName = "Export",
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

		return email;
	}

	private async Task SeedTenantUserWithNameAsync(Guid tenantId, string firstName, string lastName) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var unique = Guid.NewGuid().ToString("N");
		var user = new User {
			Email = $"export-formula-{unique}@example.com",
			Password = "unused",
			FirstName = firstName,
			LastName = lastName,
			Status = UserStatus.Active,
			IsVerified = true,
		};

		await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();

		await dbContext.UserAccount.AddAsync(
			UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId, AccountLevel.User)
		);
		await dbContext.SaveChangesAsync();
	}

	private async Task<string> GetConnectionStringAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var connectionString = dbContext.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
		}

		return connectionString;
	}

	private sealed class BarrierAuditLogService : IAuditLogService {
		public List<CreateAuditLogArgs> Entries { get; } = [];
		public TaskCompletionSource Reached { get; } =
			new(TaskCreationOptions.RunContinuationsAsynchronously);
		public TaskCompletionSource Release { get; } =
			new(TaskCreationOptions.RunContinuationsAsynchronously);

		public async Task LogAsync(
			CreateAuditLogArgs args,
			CancellationToken cancellationToken = default
		) {
			Entries.Add(args);
			Reached.TrySetResult();
			await Release.Task.WaitAsync(cancellationToken);
		}

		public Task LogManyAsync(
			IReadOnlyCollection<CreateAuditLogArgs> argsList,
			CancellationToken cancellationToken = default
		) {
			Entries.AddRange(argsList);
			return Task.CompletedTask;
		}
	}

	// Uses reflection on the auto-property backing field because AppEnvironment
	// is a singleton with a get-only property. This will break if the property
	// becomes a non-auto property - update the field name accordingly if that happens.
	private static void SetExportMaxRows(int value) {
		var fieldName = $"<{nameof(AppEnvironment.TENANT_USER_EXPORT_MAX_ROWS)}>k__BackingField";
		var field = typeof(AppEnvironment).GetField(
			fieldName,
			BindingFlags.Instance | BindingFlags.NonPublic
		);

		if (field is null) {
			throw new InvalidOperationException(
				$"Backing field '{fieldName}' not found. Has the property changed from an auto-property?"
			);
		}

		field.SetValue(AppEnvironment.Instance, value);
	}
}
