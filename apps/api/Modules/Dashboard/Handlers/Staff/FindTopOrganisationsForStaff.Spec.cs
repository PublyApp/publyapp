using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Mvc;
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

namespace PublyApp.Api.Modules.Dashboard.Handlers.Staff;

public sealed class FindTopOrganisationsForStaffSpec
	: IClassFixture<ApiFixture> {
	private static readonly string _TopOrganisationsUrl =
		PathUtils.Join(
			Routes.Staff.Root,
			Routes.Dashboard.ForStaff.Root,
			Routes.Dashboard.ForStaff.TopOrganisations
		);

	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public FindTopOrganisationsForStaffSpec(
		ApiFixture fixture
	) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetUrl(
		string startDate,
		string endDate,
		int? size = null
	) {
		var url =
			FindTopOrganisationsForStaffSpec._TopOrganisationsUrl
			+ $"?start_date={startDate}"
			+ $"&end_date={endDate}";
		return size.HasValue
			? url + $"&size={size.Value}"
			: url;
	}

	private async Task<Guid> _SeedTenantAsync(
		string namePrefix
	) {
		await using var scope =
			this._Fixture.Factory.Services
				.CreateAsyncScope();
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

	private async Task<Guid> _SeedTenantMemberAsync(
		Guid tenantId
	) {
		await using var scope =
			this._Fixture.Factory.Services
				.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = $"top-orgs-{Guid.NewGuid():N}@example.com",
			Password = PasswordUtils.HashPassword(
				TestConstants.SeedPassword
			),
			FirstName = "Top",
			LastName = "Orgs",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();

		var account = UserAccount.CreateTenantAccount(
			user.GetRequiredId(),
			tenantId
		);
		await dbContext.UserAccount.AddAsync(account);
		await dbContext.SaveChangesAsync();

		return user.GetRequiredId();
	}

	private async Task<Guid> _StaffUserIdAsync() {
		return await AuditLogTestHelper.GetUserIdByEmailAsync(
			this._Fixture.Factory,
			TestConstants.StaffAdminEmail
		);
	}

	private async Task _SeedEntryAsync(
		Guid actorUserId,
		string action,
		Guid? targetId,
		DateTime createdAt
	) {
		await AuditLogTestHelper.SeedAuditLogAsync(
			this._Fixture.Factory,
			actorUserId,
			action,
			targetId,
			createdAt: createdAt
		);
	}

	[Fact]
	public async Task
		ItShouldRankOrganisationsByAuditEventsInTheWindow() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var staffUserId =
			await this._StaffUserIdAsync();

		var tenantAlpha =
			await this._SeedTenantAsync(
				"TopOrgs Rank Alpha"
			);
		var tenantBeta =
			await this._SeedTenantAsync(
				"TopOrgs Rank Beta"
			);
		await this._SeedTenantAsync(
			"TopOrgs Rank Gamma"
		);
		var memberAlpha =
			await this._SeedTenantMemberAsync(
				tenantAlpha
			);
		var memberBeta =
			await this._SeedTenantMemberAsync(
				tenantBeta
			);

		var inWindow = new DateTime(
			2020, 6, 2, 12, 0, 0, DateTimeKind.Utc
		);
		// Alpha: two member entries, one staff entry targeting it, and one
		// entry that is BOTH a member entry and targets it. The last one
		// must count once, not twice.
		await this._SeedEntryAsync(
			memberAlpha,
			AuditActions.PostCreated,
			null,
			inWindow
		);
		await this._SeedEntryAsync(
			memberAlpha,
			AuditActions.PostUpdated,
			null,
			inWindow
		);
		await this._SeedEntryAsync(
			staffUserId,
			AuditActions.TenantUpdated,
			tenantAlpha,
			inWindow
		);
		await this._SeedEntryAsync(
			memberAlpha,
			AuditActions.PostDeleted,
			tenantAlpha,
			inWindow
		);
		// Beta: one member entry inside the window, one outside it.
		await this._SeedEntryAsync(
			memberBeta,
			AuditActions.PostCreated,
			null,
			inWindow
		);
		await this._SeedEntryAsync(
			memberBeta,
			AuditActions.PostCreated,
			null,
			new DateTime(
				2020, 5, 31, 12, 0, 0, DateTimeKind.Utc
			)
		);

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTopOrganisationsForStaffSpec._GetUrl(
				"2020-06-01",
				"2020-06-03"
			)
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<TopOrganisationsResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Items.Should().HaveCount(2);
		result.Items[0].Id.Should().Be(tenantAlpha);
		result.Items[0].Count.Should().Be(4);
		result.Items[1].Id.Should().Be(tenantBeta);
		result.Items[1].Count.Should().Be(1);
		result.Items.Should()
			.NotContain(item =>
				(item.Name ?? string.Empty).Contains(
					"TopOrgs Rank Gamma",
					StringComparison.Ordinal
				)
			);
	}

	[Fact]
	public async Task
		ItShouldRespectSizeAndOrderTiesByName() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var staffUserId =
			await this._StaffUserIdAsync();

		var tenantAlpha =
			await this._SeedTenantAsync(
				"TopOrgs Tie Alpha"
			);
		var tenantBeta =
			await this._SeedTenantAsync(
				"TopOrgs Tie Beta"
			);
		var tenantGamma =
			await this._SeedTenantAsync(
				"TopOrgs Tie Gamma"
			);

		var day = new DateTime(
			2020, 7, 1, 12, 0, 0, DateTimeKind.Utc
		);
		await this._SeedEntryAsync(
			staffUserId,
			AuditActions.TenantUpdated,
			tenantAlpha,
			day
		);
		await this._SeedEntryAsync(
			staffUserId,
			AuditActions.TenantUpdated,
			tenantBeta,
			day
		);
		for (var index = 0; index < 2; index++) {
			await this._SeedEntryAsync(
				staffUserId,
				AuditActions.TenantUpdated,
				tenantGamma,
				day
			);
		}

		var topTwo = await this._GetAsync(
			FindTopOrganisationsForStaffSpec._GetUrl(
				"2020-07-01",
				"2020-07-01",
				2
			),
			token
		);
		topTwo.Items.Should().HaveCount(2);
		topTwo.Items[0].Id.Should().Be(tenantGamma);
		topTwo.Items[1].Id.Should().Be(tenantAlpha);

		var topOne = await this._GetAsync(
			FindTopOrganisationsForStaffSpec._GetUrl(
				"2020-07-01",
				"2020-07-01",
				1
			),
			token
		);
		topOne.Items.Should().ContainSingle();
		topOne.Items[0].Id.Should().Be(tenantGamma);
	}

	[Fact]
	public async Task
		ItShouldDefaultToFiveAndAcceptUpToTwenty() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var staffUserId =
			await this._StaffUserIdAsync();

		var day = new DateTime(
			2020, 12, 1, 12, 0, 0, DateTimeKind.Utc
		);
		for (var index = 0; index < 6; index++) {
			var tenantId =
				await this._SeedTenantAsync(
					$"TopOrgs Default {index:D2}"
				);
			await this._SeedEntryAsync(
				staffUserId,
				AuditActions.TenantUpdated,
				tenantId,
				day
			);
		}

		var byDefault = await this._GetAsync(
			FindTopOrganisationsForStaffSpec._GetUrl(
				"2020-12-01",
				"2020-12-01"
			),
			token
		);
		byDefault.Items.Should().HaveCount(5);

		var cappedAtTwenty = await this._GetAsync(
			FindTopOrganisationsForStaffSpec._GetUrl(
				"2020-12-01",
				"2020-12-01",
				20
			),
			token
		);
		cappedAtTwenty.Items.Should().HaveCount(6);
	}

	[Fact]
	public async Task
		ItShouldReturnEmptyItemsForAWindowWithNoEvents() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var result = await this._GetAsync(
			FindTopOrganisationsForStaffSpec._GetUrl(
				"2021-02-01",
				"2021-02-02"
			),
			token
		);

		result.Items.Should().BeEmpty();
		result.StartDate.Should().Be("2021-02-01");
		result.EndDate.Should().Be("2021-02-02");
	}

	[Fact]
	public async Task
		ItShouldReturn422WhenSizeExceedsTwenty() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTopOrganisationsForStaffSpec._GetUrl(
				"2020-08-01",
				"2020-08-02",
				21
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
		problem.Errors.Should().ContainKey("size");
	}

	[Fact]
	public async Task ItShouldReturn422WhenSizeIsZero() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTopOrganisationsForStaffSpec._GetUrl(
				"2020-08-03",
				"2020-08-04",
				0
			)
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
		ItShouldReturn422WhenStartDateIsAfterEndDate() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTopOrganisationsForStaffSpec._GetUrl(
				"2020-09-02",
				"2020-09-01"
			)
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
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
			FindTopOrganisationsForStaffSpec._GetUrl(
				"2020-10-01",
				"2020-10-02"
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
			FindTopOrganisationsForStaffSpec._GetUrl(
				"2020-11-01",
				"2020-11-02"
			)
		);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	private async Task<TopOrganisationsResponse> _GetAsync(
		string url,
		string token
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);
		response.StatusCode.Should()
			.Be(
				HttpStatusCode.OK,
				await response.Content.ReadAsStringAsync()
			);

		var result = await response.Content
			.ReadFromJsonAsync<TopOrganisationsResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		return result;
	}

	private sealed record TopOrganisationsResponse {
		public string? StartDate { get; init; }
		public string? EndDate { get; init; }
		public List<TopOrganisation> Items { get; init; } = [];
	}

	private sealed record TopOrganisation {
		public Guid Id { get; init; }
		public string? Name { get; init; }
		public int Count { get; init; }
	}
}
