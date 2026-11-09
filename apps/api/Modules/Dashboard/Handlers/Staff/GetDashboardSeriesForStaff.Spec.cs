using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.AuditLogs.Entities;

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
		ItShouldReturn422WhenActiveTenantsMetricIsRequested() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetDashboardSeriesForStaffSpec._GetUrl(
				"active_tenants",
				"2020-06-01",
				"2020-06-02"
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
		problem.Errors["metric"].Should()
			.Contain(message =>
				message.Contains(
					"active_tenants is not available",
					StringComparison.Ordinal
				)
			);
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
		public List<SeriesPoint> Points { get; init; } = [];
	}

	private sealed record SeriesPoint {
		public string? Date { get; init; }
		public int Value { get; init; }
	}
}
