using System.Globalization;
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Projects.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Tenants.Services;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Dashboard.Handlers.Staff;

public sealed class GetDashboardSeriesForStaffSpec
	: IClassFixture<ApiFixture> {
	private static readonly string _SeriesUrl =
		PathUtils.Join(
			Routes.Staff.Root,
			Routes.Dashboard.ForStaff.Root,
			Routes.Dashboard.ForStaff.Series
		);

	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetDashboardSeriesForStaffSpec(
		ApiFixture fixture
	) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetUrl(
		string? metric,
		string? startDate,
		string? endDate
	) {
		var query = new List<string>();
		if (metric is not null) {
			query.Add($"metric={metric}");
		}
		if (startDate is not null) {
			query.Add($"start_date={startDate}");
		}
		if (endDate is not null) {
			query.Add($"end_date={endDate}");
		}

		return GetDashboardSeriesForStaffSpec._SeriesUrl
			+ "?"
			+ string.Join("&", query);
	}

	private async Task<Guid> _StaffUserIdAsync() {
		return await AuditLogTestHelper.GetUserIdByEmailAsync(
			this._Fixture.Factory,
			TestConstants.StaffAdminEmail
		);
	}

	[Fact]
	public async Task
		ItShouldReturnOneZeroFilledPointPerUtcDayInclusive() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetDashboardSeriesForStaffSpec._GetUrl(
				"audit_events",
				"2020-03-01",
				"2020-03-03"
			)
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<SeriesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Metric.Should().Be("audit_events");
		result.StartDate.Should().Be("2020-03-01");
		result.EndDate.Should().Be("2020-03-03");
		result.Points.Should().HaveCount(3);
		result.Points.Select(point => point.Date)
			.Should()
			.Equal(
				"2020-03-01",
				"2020-03-02",
				"2020-03-03"
			);
		result.Points.Should()
			.OnlyContain(point => point.Value == 0);
	}

	[Fact]
	public async Task
		ItShouldCountAuditEventsOnTheirUtcDayWithinInclusiveBounds() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var staffUserId =
			await this._StaffUserIdAsync();

		// Both window bounds are inclusive: midnight on the first day and
		// the last second of the last day count. The two neighbours do not.
		await AuditLogTestHelper.SeedAuditLogAsync(
			this._Fixture.Factory,
			staffUserId,
			AuditActions.TenantUpdated,
			createdAt: new DateTime(
				2020, 4, 1, 0, 0, 0, DateTimeKind.Utc
			)
		);
		await AuditLogTestHelper.SeedAuditLogAsync(
			this._Fixture.Factory,
			staffUserId,
			AuditActions.TenantUpdated,
			createdAt: new DateTime(
				2020, 4, 1, 8, 30, 0, DateTimeKind.Utc
			)
		);
		await AuditLogTestHelper.SeedAuditLogAsync(
			this._Fixture.Factory,
			staffUserId,
			AuditActions.TenantUpdated,
			createdAt: new DateTime(
				2020, 4, 2, 12, 0, 0, DateTimeKind.Utc
			)
		);
		await AuditLogTestHelper.SeedAuditLogAsync(
			this._Fixture.Factory,
			staffUserId,
			AuditActions.TenantUpdated,
			createdAt: new DateTime(
				2020, 4, 3, 23, 59, 59, DateTimeKind.Utc
			)
		);
		await AuditLogTestHelper.SeedAuditLogAsync(
			this._Fixture.Factory,
			staffUserId,
			AuditActions.TenantUpdated,
			createdAt: new DateTime(
				2020, 3, 31, 23, 59, 59, DateTimeKind.Utc
			)
		);
		await AuditLogTestHelper.SeedAuditLogAsync(
			this._Fixture.Factory,
			staffUserId,
			AuditActions.TenantUpdated,
			createdAt: new DateTime(
				2020, 4, 4, 0, 0, 0, DateTimeKind.Utc
			)
		);

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetDashboardSeriesForStaffSpec._GetUrl(
				"audit_events",
				"2020-04-01",
				"2020-04-03"
			)
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<SeriesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Points.Select(point => point.Value)
			.Should()
			.Equal(2, 1, 1);
	}

	[Fact]
	public async Task
		ItShouldCountSignInsOnTheirUtcDayWithinInclusiveBounds() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var staffUserId =
			await this._StaffUserIdAsync();

		// Both window bounds are inclusive. The two neighbours and every
		// failed sign-in do not belong to this series.
		foreach (var createdAt in new[] {
			new DateTime(2020, 10, 1, 0, 0, 0, DateTimeKind.Utc),
			new DateTime(2020, 10, 1, 9, 15, 0, DateTimeKind.Utc),
			new DateTime(2020, 10, 2, 23, 59, 59, DateTimeKind.Utc),
			new DateTime(2020, 9, 30, 23, 59, 59, DateTimeKind.Utc),
			new DateTime(2020, 10, 3, 0, 0, 0, DateTimeKind.Utc),
		}) {
			await AuditLogTestHelper.SeedAuditLogAsync(
				this._Fixture.Factory,
				staffUserId,
				AuditActions.LoginSucceeded,
				createdAt: createdAt
			);
		}
		await AuditLogTestHelper.SeedAuditLogAsync(
			this._Fixture.Factory,
			staffUserId,
			AuditActions.LoginFailed,
			createdAt: new DateTime(
				2020, 10, 1, 10, 0, 0, DateTimeKind.Utc
			)
		);

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetDashboardSeriesForStaffSpec._GetUrl(
				"sign_ins",
				"2020-10-01",
				"2020-10-02"
			)
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<SeriesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Metric.Should().Be("sign_ins");
		result.Points.Select(point => point.Value)
			.Should()
			.Equal(2, 1);
	}

	[Fact]
	public async Task
		ItShouldCountFailedSignInsOnTheirUtcDay() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var staffUserId =
			await this._StaffUserIdAsync();

		await AuditLogTestHelper.SeedAuditLogAsync(
			this._Fixture.Factory,
			staffUserId,
			AuditActions.LoginFailed,
			createdAt: new DateTime(
				2020, 11, 5, 8, 0, 0, DateTimeKind.Utc
			)
		);
		await AuditLogTestHelper.SeedAuditLogAsync(
			this._Fixture.Factory,
			staffUserId,
			AuditActions.LoginSucceeded,
			createdAt: new DateTime(
				2020, 11, 6, 8, 0, 0, DateTimeKind.Utc
			)
		);

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetDashboardSeriesForStaffSpec._GetUrl(
				"failed_sign_ins",
				"2020-11-05",
				"2020-11-06"
			)
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<SeriesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Metric.Should().Be("failed_sign_ins");
		result.Points.Select(point => point.Value)
			.Should()
			.Equal(1, 0);
	}

	[Fact]
	public async Task
		ItShouldAcceptAWindowSpanning366ElapsedDays() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		// 2020-01-01 → 2021-01-01 is 366 elapsed days (leap year), which is
		// what the 12-month preset can legitimately ask for.
		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetDashboardSeriesForStaffSpec._GetUrl(
				"audit_events",
				"2020-01-01",
				"2021-01-01"
			)
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<SeriesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Points.Should().HaveCount(367);
	}

	[Fact]
	public async Task
		ItShouldReturn422WhenStartDateIsAfterEndDate() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetDashboardSeriesForStaffSpec._GetUrl(
				"audit_events",
				"2020-05-02",
				"2020-05-01"
			)
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("start_date");
	}

	[Fact]
	public async Task
		ItShouldReturn422WhenWindowExceeds366Days() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetDashboardSeriesForStaffSpec._GetUrl(
				"audit_events",
				"2020-01-01",
				"2021-01-02"
			)
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("end_date");
	}

	[Fact]
	public async Task
		ItShouldReplayTheStoredTransitionsAcrossTheWindow() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext =
			scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenantId = Guid.NewGuid();
		var createdAt =
			new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);

		var code = tenantId.ToString();

		// The window's value BEFORE this spec's tenant exists: other rows in
		// the table (seeded tenants, other specs) must never make the
		// assertion an absolute global count (#2349 MEDIUM-4).
		var before = await this._GetSeriesAsync(
			token,
			"active_tenants",
			"2020-06-01",
			"2020-06-04"
		);

		try {
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				INSERT INTO tenants
					(id, code, name, status, max_users, created_at,
					 updated_at, is_deleted)
				VALUES
					({tenantId}, {code}, {code}, {(int)TenantStatus.Active},
					 5, {createdAt}, {createdAt}, false)
				"""
			);
			// The creation row the trigger writes is dated now(), outside this
			// 2020 window: the rows below are the whole in-window history.

			// Active exactly at the window's first midnight (inclusive start),
			// suspended mid-day, reactivated at the last day's midnight
			// (inclusive end).
			foreach (var (status, occurredAt) in new[] {
				(
					TenantLifecycleStatus.Active,
					new DateTime(2020, 6, 1, 0, 0, 0, DateTimeKind.Utc)
				),
				(
					TenantLifecycleStatus.Suspended,
					new DateTime(2020, 6, 2, 12, 0, 0, DateTimeKind.Utc)
				),
				(
					TenantLifecycleStatus.Active,
					new DateTime(2020, 6, 4, 0, 0, 0, DateTimeKind.Utc)
				),
			}) {
				await dbContext.Database.ExecuteSqlAsync(
					$"""
					INSERT INTO tenant_status_history
						(tenant_id, status, occurred_at, created_at)
					VALUES
						({tenantId}, {(int)status}, {occurredAt}, {occurredAt})
					"""
				);
			}

			var result = await this._GetSeriesAsync(
				token,
				"active_tenants",
				"2020-06-01",
				"2020-06-04"
			);

			result.Metric.Should().Be("active_tenants");
			result.Points.Select(point => point.Date)
				.Should()
				.Equal(
					"2020-06-01",
					"2020-06-02",
					"2020-06-03",
					"2020-06-04"
				);
			// One active on the 1st, none after the suspend, none on the empty
			// day (zero-filled), one again after the reactivation — relative to
			// whatever the rest of the table contributes.
			result.Points.Select(point => point.Value)
				.Should()
				.Equal(
					before.Points[0].Value + 1,
					before.Points[1].Value,
					before.Points[2].Value,
					before.Points[3].Value + 1
				);
		} finally {
			// No FK on tenant_id (see TenantStatusHistory): the hard delete
			// writes its terminal row first, then this spec removes both.
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				DELETE FROM tenants WHERE id = {tenantId}
				"""
			);
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				DELETE FROM tenant_status_history
				WHERE tenant_id = {tenantId}
				"""
			);
		}
	}

	[Fact]
	public async Task
		ItShouldDrawTheCurveFromTheTransitionsTheTriggerRecords() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext =
			scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenantService =
			scope.ServiceProvider.GetRequiredService<ITenantAsStaffService>();

		var tenantId = Guid.NewGuid();
		var today = DateTime.UtcNow.Date;
		var startIso = today.AddDays(-1).ToString(
			"yyyy-MM-dd",
			CultureInfo.InvariantCulture
		);
		var endIso = today.ToString(
			"yyyy-MM-dd",
			CultureInfo.InvariantCulture
		);

		// Relative to the table as it stands, never an absolute global count.
		var before = await this._GetSeriesAsync(
			token,
			"active_tenants",
			startIso,
			endIso
		);
		before.Points.Should().HaveCount(2);
		before.Points.Select(point => point.Date)
			.Should()
			.Equal(startIso, endIso);

		// The day history starts is the earliest recorded transition: the
		// client must not show the days before it as measured 0s (#2349).
		var earliest = await dbContext.TenantStatusHistory
			.MinAsync(history => (DateTime?)history.OccurredAt);
		earliest.Should().NotBeNull();
		before.RecordedSince.Should().Be(
			earliest.Value.ToString(
				"yyyy-MM-dd",
				CultureInfo.InvariantCulture
			)
		);

		try {
			// 1) INSERT: the trigger records the creation transition.
			var createdAt = DateTime.UtcNow;
			var code = tenantId.ToString();
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				INSERT INTO tenants
					(id, code, name, status, max_users, created_at,
					 updated_at, is_deleted)
				VALUES
					({tenantId}, {code}, {code}, {(int)TenantStatus.Active},
					 5, {createdAt}, {createdAt}, false)
				"""
			);

			var created = await this._GetSeriesAsync(
				token,
				"active_tenants",
				startIso,
				endIso
			);
			created.Points[0].Value.Should().Be(
				before.Points[0].Value,
				"the creation happened today, not yesterday"
			);
			created.Points[1].Value.Should().Be(before.Points[1].Value + 1);

			// 2) Status change through the service's ExecuteUpdate.
			(await tenantService.SuspendTenantAsync(tenantId))
				.Should().BeOfType<SuspendTenantResult.Success>();
			(await this._GetSeriesAsync(token, "active_tenants", startIso, endIso))
				.Points[1].Value.Should().Be(before.Points[1].Value);

			(await tenantService.ReactivateTenantAsync(tenantId))
				.Should().BeOfType<ReactivateTenantResult.Success>();
			(await this._GetSeriesAsync(token, "active_tenants", startIso, endIso))
				.Points[1].Value.Should().Be(before.Points[1].Value + 1);

			// 3) Soft delete: the organisation leaves the active curve.
			(await tenantService.SuspendTenantAsync(tenantId))
				.Should().BeOfType<SuspendTenantResult.Success>();
			(await tenantService.DeleteTenantAsync(tenantId))
				.Should().BeOfType<DeleteTenantResult.Success>();
			(await this._GetSeriesAsync(token, "active_tenants", startIso, endIso))
				.Points[1].Value.Should().Be(before.Points[1].Value);
		} finally {
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				DELETE FROM tenants WHERE id = {tenantId}
				"""
			);
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				DELETE FROM tenant_status_history
				WHERE tenant_id = {tenantId}
				"""
			);
		}
	}

	[Fact]
	public async Task
		ItShouldServeA366DayWindowForActiveTenants() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		// 2020-01-01 → 2021-01-01 is 366 elapsed days. The active-tenants
		// series has its own day loop and endExclusive, so it needs its own
		// bounds spec (#2349 MEDIUM-3).
		var result = await this._GetSeriesAsync(
			token,
			"active_tenants",
			"2020-01-01",
			"2021-01-01"
		);

		result.Points.Should().HaveCount(367);
		result.Points[0].Date.Should().Be("2020-01-01");
		result.Points[^1].Date.Should().Be("2021-01-01");
		// Every transition is recorded after 2021: the exclusive end excludes
		// them all, and the days are zero-filled.
		result.Points.Should().OnlyContain(point => point.Value == 0);
	}

	[Fact]
	public async Task
		ItShouldReturn422WhenTheActiveTenantsWindowIsInverted() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetDashboardSeriesForStaffSpec._GetUrl(
				"active_tenants",
				"2020-05-02",
				"2020-05-01"
			)
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("start_date");
	}

	// ---- members / pending_invitations (#2355) ----
	// Windows sit in 2021: every other row of the shared database is dated
	// now, so these assertions are exact, not relative.

	private static DateTime _Utc(
		int year,
		int month,
		int day,
		int hour = 0
	) {
		return new DateTime(year, month, day, hour, 0, 0, DateTimeKind.Utc);
	}

	private sealed class SeededRows {
		public List<Guid> TenantIds { get; } = [];
		public List<Guid> ProjectIds { get; } = [];
		public List<Guid> UserIds { get; } = [];
		public List<Guid> AccountIds { get; } = [];
		public List<Guid> InvitationIds { get; } = [];
	}

	private async Task<Guid> _SeedTenantAsync(
		SeededRows rows,
		DateTime createdAt,
		TenantStatus status = TenantStatus.Active,
		DateTime? deletedAt = null
	) {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenant = new Tenant {
			Name = $"series-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = status,
			MaxUsers = 10,
		};
		await db.Tenant.AddAsync(tenant);
		await db.SaveChangesAsync();
		var id = tenant.GetRequiredId();
		rows.TenantIds.Add(id);

		// ExecuteUpdate bypasses the SaveChanges timestamp rewrite.
		await db.Tenant
			.Where(row => row.Id == id)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(row => row.CreatedAt, createdAt)
				.SetProperty(row => row.IsDeleted, deletedAt is not null)
				.SetProperty(row => row.DeletedAt, deletedAt));
		return id;
	}

	private async Task<Guid> _SeedProjectAsync(
		SeededRows rows,
		Guid tenantId
	) {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var project = new Project {
			TenantId = tenantId,
			Name = $"series-project-{Guid.NewGuid():N}",
		};
		await db.Project.AddAsync(project);
		await db.SaveChangesAsync();
		rows.ProjectIds.Add(project.GetRequiredId());
		return project.GetRequiredId();
	}

	/// <summary>
	/// A project-scope account: it CARRIES the tenant id, so only the scope
	/// predicate keeps it out of the members series.
	/// </summary>
	private async Task _SeedProjectMemberAsync(
		SeededRows rows,
		Guid tenantId,
		Guid projectId,
		DateTime createdAt
	) {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var user = new User {
			Email = $"series-{Guid.NewGuid():N}@example.com",
			Password = "x",
			IsVerified = true,
			Status = UserStatus.Active,
		};
		await db.User.AddAsync(user);
		await db.SaveChangesAsync();
		var account = UserAccount.CreateProjectAccount(
			user.GetRequiredId(),
			tenantId,
			projectId
		);
		await db.UserAccount.AddAsync(account);
		await db.SaveChangesAsync();

		var userId = user.GetRequiredId();
		var accountId = account.GetRequiredId();
		rows.UserIds.Add(userId);
		rows.AccountIds.Add(accountId);
		await db.UserAccount
			.Where(row => row.Id == accountId)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(row => row.CreatedAt, createdAt));
	}

	private async Task<Guid> _SeedMemberAsync(
		SeededRows rows,
		Guid tenantId,
		DateTime createdAt,
		DateTime? accountDeletedAt = null,
		DateTime? userDeletedAt = null,
		AccountStatus accountStatus = AccountStatus.Active,
		UserStatus userStatus = UserStatus.Active
	) {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var user = new User {
			Email = $"series-{Guid.NewGuid():N}@example.com",
			Password = "x",
			IsVerified = true,
			Status = userStatus,
		};
		await db.User.AddAsync(user);
		await db.SaveChangesAsync();
		var account = UserAccount.CreateTenantAccount(
			user.GetRequiredId(),
			tenantId
		);
		account.Status = accountStatus;
		await db.UserAccount.AddAsync(account);
		await db.SaveChangesAsync();

		var userId = user.GetRequiredId();
		var accountId = account.GetRequiredId();
		rows.UserIds.Add(userId);
		rows.AccountIds.Add(accountId);
		await db.User
			.Where(row => row.Id == userId)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(row => row.CreatedAt, createdAt)
				.SetProperty(row => row.IsDeleted, userDeletedAt is not null)
				.SetProperty(row => row.DeletedAt, userDeletedAt));
		await db.UserAccount
			.Where(row => row.Id == accountId)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(row => row.CreatedAt, createdAt)
				.SetProperty(row => row.IsDeleted, accountDeletedAt is not null)
				.SetProperty(row => row.DeletedAt, accountDeletedAt));
		return accountId;
	}

	private async Task<Guid> _SeedInvitationAsync(
		SeededRows rows,
		Guid? tenantId,
		DateTime createdAt,
		DateTime expiresAt,
		InvitationStatus status = InvitationStatus.Pending,
		DateTime? acceptedAt = null,
		DateTime? revokedAt = null,
		Guid? projectId = null
	) {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var inviter = await db.User
			.Where(user => user.Email == TestConstants.StaffAdminEmail)
			.FirstAsync();
		var email = $"series-{Guid.NewGuid():N}@example.com";
		var token = Guid.NewGuid().ToString("N")[..32];
		Invitation invitation;
		if (tenantId is { } id && projectId is { } project) {
			invitation = Invitation.CreateProjectInvitationWithRoles(
				email, id, project, [], inviter.GetRequiredId(), expiresAt, token);
		} else if (tenantId is { } tenantOnly) {
			invitation = Invitation.CreateTenantInvitationWithRoles(
				email, tenantOnly, [], inviter.GetRequiredId(), expiresAt, token);
		} else {
			invitation = Invitation.CreateStaffInvitationWithRoles(
				email, [], inviter.GetRequiredId(), expiresAt, token);
		}
		await db.Invitation.AddAsync(invitation);
		await db.SaveChangesAsync();

		var invitationId = invitation.GetRequiredId();
		rows.InvitationIds.Add(invitationId);
		await db.Invitation
			.Where(row => row.Id == invitationId)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(row => row.CreatedAt, createdAt)
				.SetProperty(row => row.Status, status)
				.SetProperty(row => row.AcceptedAt, acceptedAt)
				.SetProperty(row => row.RevokedAt, revokedAt));
		return invitationId;
	}

	private async Task _CleanUpAsync(SeededRows rows) {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await db.Invitation
			.Where(row => rows.InvitationIds.Contains(row.Id ?? Guid.Empty))
			.ExecuteDeleteAsync();
		await db.UserAccountRole
			.Where(row => rows.AccountIds.Contains(row.UserAccountId))
			.ExecuteDeleteAsync();
		await db.UserAccount
			.Where(row => rows.AccountIds.Contains(row.Id ?? Guid.Empty))
			.ExecuteDeleteAsync();
		await db.User
			.Where(row => rows.UserIds.Contains(row.Id ?? Guid.Empty))
			.ExecuteDeleteAsync();
		// The staff assign flow gives the membership a default tenant role.
		var roleIds = await db.Role
			.Where(row => rows.TenantIds.Contains(row.TenantId ?? Guid.Empty))
			.Select(row => row.Id ?? Guid.Empty)
			.ToListAsync();
		await db.UserAccountRole
			.Where(row => roleIds.Contains(row.RoleId))
			.ExecuteDeleteAsync();
		await db.RolePermission
			.Where(row => roleIds.Contains(row.RoleId))
			.ExecuteDeleteAsync();
		await db.Role
			.Where(row => roleIds.Contains(row.Id ?? Guid.Empty))
			.ExecuteDeleteAsync();
		await db.Project
			.Where(row => rows.ProjectIds.Contains(row.Id ?? Guid.Empty))
			.ExecuteDeleteAsync();
		await db.Tenant
			.Where(row => rows.TenantIds.Contains(row.Id ?? Guid.Empty))
			.ExecuteDeleteAsync();
		await db.TenantStatusHistory
			.Where(row => rows.TenantIds.Contains(row.TenantId))
			.ExecuteDeleteAsync();
	}

	[Fact]
	public async Task
		ItShouldCountMembersAtTheEndOfEachUtcDayFromTheirOwnTimestamps() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var rows = new SeededRows();
		try {
			var tenant = await this._SeedTenantAsync(
				rows,
				GetDashboardSeriesForStaffSpec._Utc(2021, 1, 1)
			);
			var deletedTenant = await this._SeedTenantAsync(
				rows,
				GetDashboardSeriesForStaffSpec._Utc(2021, 1, 1),
				deletedAt: GetDashboardSeriesForStaffSpec._Utc(2021, 3, 3, 6)
			);

			// Never removed.
			await this._SeedMemberAsync(rows, tenant, GetDashboardSeriesForStaffSpec._Utc(2021, 3, 1, 10));
			// Removed on the 4th at noon: out from the 4th's end of day.
			await this._SeedMemberAsync(
				rows,
				tenant,
				GetDashboardSeriesForStaffSpec._Utc(2021, 3, 2, 10),
				accountDeletedAt: GetDashboardSeriesForStaffSpec._Utc(2021, 3, 4, 12)
			);
			// Suspended memberships still count, like the card.
			await this._SeedMemberAsync(
				rows,
				tenant,
				GetDashboardSeriesForStaffSpec._Utc(2021, 3, 2, 10),
				accountStatus: AccountStatus.Suspended
			);
			// Its user is deleted on the 5th.
			await this._SeedMemberAsync(
				rows,
				tenant,
				GetDashboardSeriesForStaffSpec._Utc(2021, 3, 3, 10),
				userDeletedAt: GetDashboardSeriesForStaffSpec._Utc(2021, 3, 5, 8)
			);
			// Its organisation is deleted on the 3rd: members leave with it.
			await this._SeedMemberAsync(
				rows,
				deletedTenant,
				GetDashboardSeriesForStaffSpec._Utc(2021, 3, 1, 10)
			);
			// A suspended organisation's members still count, like the card.
			var suspendedTenant = await this._SeedTenantAsync(
				rows,
				GetDashboardSeriesForStaffSpec._Utc(2021, 1, 1),
				TenantStatus.Suspended
			);
			await this._SeedMemberAsync(
				rows,
				suspendedTenant,
				GetDashboardSeriesForStaffSpec._Utc(2021, 3, 1, 10)
			);
			// So does the membership of a globally suspended user.
			await this._SeedMemberAsync(
				rows,
				tenant,
				GetDashboardSeriesForStaffSpec._Utc(2021, 3, 3, 10),
				userStatus: UserStatus.Suspended
			);

			var result = await this._GetSeriesAsync(
				token,
				"members",
				"2021-03-01",
				"2021-03-06"
			);

			result.Metric.Should().Be("members");
			result.RecordedSince.Should().BeNull();
			result.Points.Select(point => point.Value)
				.Should()
				.Equal(3, 5, 6, 5, 4, 4);
		} finally {
			await this._CleanUpAsync(rows);
		}
	}

	[Fact]
	public async Task ItShouldIgnoreProjectScopeAccountsForMembers() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var rows = new SeededRows();
		try {
			var tenant = await this._SeedTenantAsync(
				rows,
				GetDashboardSeriesForStaffSpec._Utc(2021, 1, 1)
			);
			var project = await this._SeedProjectAsync(rows, tenant);
			await this._SeedMemberAsync(
				rows,
				tenant,
				GetDashboardSeriesForStaffSpec._Utc(2021, 4, 1, 10)
			);
			// Carries the tenant id: only the scope predicate excludes it.
			await this._SeedProjectMemberAsync(
				rows,
				tenant,
				project,
				GetDashboardSeriesForStaffSpec._Utc(2021, 4, 1, 10)
			);

			var result = await this._GetSeriesAsync(
				token,
				"members",
				"2021-04-01",
				"2021-04-02"
			);

			result.Points.Select(point => point.Value)
				.Should()
				.Equal(1, 1);
		} finally {
			await this._CleanUpAsync(rows);
		}
	}

	[Fact]
	public async Task
		ItShouldCountAMemberRestoredByTheStaffAssignFlowContinuouslyFromTheirFirstJoin() {
		// Documented ceiling (#2355): the staff assign flow revives the removed
		// account's row (DeletedAt cleared, CreatedAt kept), so the removal
		// instant is gone and the member counts without a gap from the first
		// join. This drives the real endpoints; if the flow ever inserts a new
		// row instead, this spec fails and the ceiling can be dropped.
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var rows = new SeededRows();
		try {
			var tenant = await this._SeedTenantAsync(
				rows,
				GetDashboardSeriesForStaffSpec._Utc(2021, 1, 1)
			);
			var firstJoin = GetDashboardSeriesForStaffSpec._Utc(2021, 6, 1, 10);
			var accountId = await this._SeedMemberAsync(rows, tenant, firstJoin);
			var userId = rows.UserIds[^1];
			var companiesUrl = PathUtils.Join(
				Routes.Staff.Root,
				$"/tenant-users/{userId}/companies"
			);

			using var removeRequest = new HttpRequestMessage(
				HttpMethod.Post,
				PathUtils.Join(companiesUrl, "/bulk-remove")
			).WithSessionToken(token);
			removeRequest.Content = JsonContent.Create(
				new { tenantIds = new[] { tenant } }
			);
			using var removed = await this._Http.SendAsync(removeRequest);
			removed.StatusCode.Should().Be(HttpStatusCode.OK);

			using var assignRequest = new HttpRequestMessage(
				HttpMethod.Post,
				companiesUrl
			).WithSessionToken(token);
			assignRequest.Content = JsonContent.Create(
				new { tenantIds = new[] { tenant } }
			);
			using var assigned = await this._Http.SendAsync(assignRequest);
			assigned.StatusCode.Should().Be(HttpStatusCode.OK);

			await using (var scope =
				this._Fixture.Factory.Services.CreateAsyncScope()) {
				var db = scope.ServiceProvider
					.GetRequiredService<AppDbContext>();
				var memberships = await db.UserAccount
					.AsNoTracking()
					.Where(row => row.UserId == userId
						&& row.TenantId == tenant)
					.ToListAsync();
				// The SAME row, revived with its original CreatedAt.
				var revived = memberships.Should().ContainSingle().Subject;
				revived.Id.Should().Be(accountId);
				revived.IsDeleted.Should().BeFalse();
				revived.DeletedAt.Should().BeNull();
				revived.CreatedAt.Should().Be(firstJoin);
			}

			var result = await this._GetSeriesAsync(
				token,
				"members",
				"2021-06-01",
				"2021-06-05"
			);

			result.Points.Select(point => point.Value)
				.Should()
				.Equal(1, 1, 1, 1, 1);
		} finally {
			await this._CleanUpAsync(rows);
		}
	}

	[Fact]
	public async Task
		ItShouldCountPendingOrganisationInvitationsAtTheEndOfEachUtcDay() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var rows = new SeededRows();
		var farFuture = GetDashboardSeriesForStaffSpec._Utc(2030, 1, 1);
		DateTime may(int day, int hour = 0) {
			return GetDashboardSeriesForStaffSpec._Utc(2021, 5, day, hour);
		}
		try {
			var tenantCreated = GetDashboardSeriesForStaffSpec._Utc(2021, 1, 1);
			var tenant = await this._SeedTenantAsync(rows, tenantCreated);
			var suspended = await this._SeedTenantAsync(
				rows,
				tenantCreated,
				TenantStatus.Suspended
			);
			var deleted = await this._SeedTenantAsync(
				rows,
				tenantCreated,
				deletedAt: may(3, 6)
			);
			var project = await this._SeedProjectAsync(rows, tenant);

			// Pending throughout.
			await this._SeedInvitationAsync(rows, tenant, may(1, 10), farFuture);
			// Accepted on the 3rd at noon: out from the 3rd's end of day.
			await this._SeedInvitationAsync(
				rows, tenant, may(1, 10), farFuture,
				InvitationStatus.Accepted, acceptedAt: may(3, 12));
			// Revoked on the 4th at noon: out from the 4th's end of day.
			await this._SeedInvitationAsync(
				rows, tenant, may(2, 10), farFuture,
				InvitationStatus.Revoked, revokedAt: may(4, 12));
			// Expires exactly at the 3rd's end instant (4th, 00:00): expiry
			// is exclusive, so it is already out of the 3rd.
			await this._SeedInvitationAsync(rows, tenant, may(2, 10), may(4));
			// A suspended organisation still counts, like the tenants read.
			await this._SeedInvitationAsync(
				rows, suspended, may(1, 10), farFuture);
			// The organisation is deleted on the 3rd: its invitation leaves.
			await this._SeedInvitationAsync(
				rows, deleted, may(1, 10), farFuture);
			// A project-scope invitation CARRIES the tenant id: only the scope
			// predicate keeps it out (like a staff-scope one, which has none).
			await this._SeedInvitationAsync(
				rows, tenant, may(1, 10), farFuture, projectId: project);
			await this._SeedInvitationAsync(rows, null, may(1, 10), farFuture);

			var result = await this._GetSeriesAsync(
				token,
				"pending_invitations",
				"2021-05-01",
				"2021-05-06"
			);

			result.Metric.Should().Be("pending_invitations");
			result.RecordedSince.Should().BeNull();
			result.Points.Select(point => point.Value)
				.Should()
				.Equal(4, 6, 3, 2, 2, 2);
		} finally {
			await this._CleanUpAsync(rows);
		}
	}

	[Fact]
	public async Task
		ItShouldMatchTheTenantsReadOnTheCurrentUtcDayForBothSeries() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var today = DateTime.UtcNow.Date.ToString(
			"yyyy-MM-dd",
			CultureInfo.InvariantCulture
		);
		var rows = new SeededRows();
		try {
			var before = await this._GetTodayAsync(token, today);

			var tenant = await this._SeedTenantAsync(
				rows,
				DateTime.UtcNow.AddDays(-2)
			);
			await this._SeedMemberAsync(
				rows,
				tenant,
				DateTime.UtcNow.AddMinutes(-5)
			);
			await this._SeedInvitationAsync(
				rows,
				tenant,
				DateTime.UtcNow.AddMinutes(-5),
				DateTime.UtcNow.AddDays(3)
			);
			// An expired one is in neither figure.
			await this._SeedInvitationAsync(
				rows,
				tenant,
				DateTime.UtcNow.AddDays(-2),
				DateTime.UtcNow.AddMinutes(-1)
			);

			var after = await this._GetTodayAsync(token, today);

			// The series' last point (end_date = the current UTC day) IS the
			// figure the cards read from the tenants read...
			after.SeriesMembers.Should().Be(after.ReadMembers);
			after.SeriesPending.Should().Be(after.ReadPending);
			// ...and the rows seeded here are the ones that moved it.
			(after.SeriesMembers - before.SeriesMembers).Should().Be(1);
			(after.SeriesPending - before.SeriesPending).Should().Be(1);
		} finally {
			await this._CleanUpAsync(rows);
		}
	}

	private sealed record TodayFigures(
		int SeriesMembers,
		int SeriesPending,
		int ReadMembers,
		int ReadPending
	);

	private async Task<TodayFigures> _GetTodayAsync(
		string token,
		string today
	) {
		var members = await this._GetSeriesAsync(
			token, "members", today, today);
		var pending = await this._GetSeriesAsync(
			token, "pending_invitations", today, today);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			TenantTestHelper.GetFindUrl(limit: 1)
		).WithSessionToken(token);
		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var read = await response.Content
			.ReadFromJsonAsync<TenantsReadResponse>();
		Assert.NotNull(read);

		return new TodayFigures(
			members.Points[0].Value,
			pending.Points[0].Value,
			read.Counts.Members,
			read.Counts.PendingInvitations
		);
	}

	private sealed record TenantsReadResponse {
		public TenantsReadCounts Counts { get; init; } = new();
	}

	private sealed record TenantsReadCounts {
		public int Members { get; init; }
		public int PendingInvitations { get; init; }
	}

	[Fact]
	public async Task ItShouldReturn422ForAnUnknownMetricAndNameTheNewOnes() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetDashboardSeriesForStaffSpec._GetUrl(
				"nope",
				"2021-01-01",
				"2021-01-02"
			)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var body = await response.Content.ReadAsStringAsync();
		body.Should().Contain("members");
		body.Should().Contain("pending_invitations");
	}

	private async Task<SeriesResponse> _GetSeriesAsync(
		string token,
		string metric,
		string startDate,
		string endDate
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetDashboardSeriesForStaffSpec._GetUrl(
				metric,
				startDate,
				endDate
			)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<SeriesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		return result;
	}

	[Fact]
	public async Task ItShouldReturn422WhenMetricIsMissing() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetDashboardSeriesForStaffSpec._GetUrl(
				null,
				"2020-07-01",
				"2020-07-02"
			)
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("metric");
	}

	[Fact]
	public async Task
		ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token =
			await this._AuthClient.LoginAsync(
				TestConstants.StaffUserEmail,
				TestConstants.SeedPassword
			);

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetDashboardSeriesForStaffSpec._GetUrl(
				"audit_events",
				"2020-08-01",
				"2020-08-02"
			)
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetDashboardSeriesForStaffSpec._GetUrl(
				"audit_events",
				"2020-09-01",
				"2020-09-02"
			)
		);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	private sealed record SeriesResponse {
		public string? Metric { get; init; }
		public string? StartDate { get; init; }
		public string? EndDate { get; init; }
		public string? RecordedSince { get; init; }
		public List<SeriesPoint> Points { get; init; } = [];
	}

	private sealed record SeriesPoint {
		public string? Date { get; init; }
		public int Value { get; init; }
	}
}
