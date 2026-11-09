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
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Tenants.Services;

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
