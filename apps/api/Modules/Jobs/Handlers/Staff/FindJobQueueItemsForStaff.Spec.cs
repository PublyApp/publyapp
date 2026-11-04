using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

// A5 (#636): GET /staff/jobs/queue — staff job-queue dashboard list read.
// Contract: 200 with a CursorPaginatedResult-shaped page containing the seeded
// row, 400 for an unknown status CSV token, 401 without a session, and 403 for
// staff without the jobs view permission.
public sealed class FindJobQueueItemsForStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public FindJobQueueItemsForStaffSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _Url() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.JobsRoot,
			Routes.Jobs.ForStaff.Queue.Root
		);
	}

	[Fact]
	public async Task ItShouldListQueueItemsIncludingTheSeededPendingRow() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var jobType = await this._SeedQueueItemAsync();

		try {
			var request = new HttpRequestMessage(HttpMethod.Get, FindJobQueueItemsForStaffSpec._Url())
				.WithSessionToken(token);

			using var response = await this._Http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			var data = document.RootElement.GetProperty("data");
			data.GetArrayLength().Should().BeGreaterThan(0);
			data.EnumerateArray().Should().Contain(item =>
				item.GetProperty("jobType").GetString() == jobType
				&& item.GetProperty("status").GetString() == "pending",
				"the seeded pending row appears in the list page"
			);
		} finally {
			await this._CleanupAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldFilterByExactJobType() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var jobType = await this._SeedQueueItemAsync();

		try {
			var url = $"{FindJobQueueItemsForStaffSpec._Url()}?job_type={Uri.EscapeDataString(jobType)}";
			var request = new HttpRequestMessage(HttpMethod.Get, url)
				.WithSessionToken(token);

			using var response = await this._Http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			var data = document.RootElement.GetProperty("data");
			data.GetArrayLength().Should().BeGreaterThan(0);
			data.EnumerateArray().Should().OnlyContain(item =>
				item.GetProperty("jobType").GetString() == jobType
			);
		} finally {
			await this._CleanupAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForAnUnknownStatusToken() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindJobQueueItemsForStaffSpec._Url()}?status=not-a-status"
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldRequireASession() {
		using var response = await this._Http.GetAsync(FindJobQueueItemsForStaffSpec._Url());

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var unprivileged = await this._CreateUnprivilegedStaffUserAsync();

		var request = new HttpRequestMessage(HttpMethod.Get, FindJobQueueItemsForStaffSpec._Url())
			.WithSessionToken(unprivileged.Token);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnWholeFilteredCountsAndTheTenantName() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var (tenantId, tenantName) = await this._SeedTenantAsync();
		var jobType = await this._SeedQueueItemAsync(tenantId: tenantId);
		_ = await this._SeedQueueItemAsync();

		try {
			var url = $"{FindJobQueueItemsForStaffSpec._Url()}?q={Uri.EscapeDataString(jobType)}&limit=1";
			using var request = new HttpRequestMessage(HttpMethod.Get, url)
				.WithSessionToken(token);
			using var response = await this._Http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			var root = document.RootElement;

			// limit=1 proves the counts are the filtered collection, not the page.
			root.GetProperty("data").GetArrayLength().Should().Be(1);
			root.GetProperty("totalCount").GetInt32().Should().Be(1);
			root.GetProperty("counts").GetProperty("total").GetInt32().Should().Be(1);
			root.GetProperty("counts").GetProperty("pending").GetInt32().Should().Be(1);

			// The « Familles » panel counts these per job type, batched with the page.
			root.GetProperty("counts").GetProperty("byJobType").EnumerateArray()
				.Should().Contain(entry =>
					entry.GetProperty("jobType").GetString() == jobType
					&& entry.GetProperty("count").GetInt32() == 1
				);

			var row = root.GetProperty("data")[0];
			row.GetProperty("jobType").GetString().Should().Be(jobType);
			row.GetProperty("tenantName").GetString().Should().Be(tenantName);
		} finally {
			await this._CleanupAsync(jobType);
			await this._DeleteTenantAsync(tenantId);
		}
	}

	[Fact]
	public async Task ItShouldSearchLastErrorOnTheServer() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var marker = $"err-{Guid.NewGuid():N}";
		var jobType = await this._SeedQueueItemAsync(lastError: $"boom {marker}");

		try {
			var url = $"{FindJobQueueItemsForStaffSpec._Url()}?q={Uri.EscapeDataString(marker)}";
			using var request = new HttpRequestMessage(HttpMethod.Get, url)
				.WithSessionToken(token);
			using var response = await this._Http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			var data = document.RootElement.GetProperty("data");
			data.EnumerateArray().Should().Contain(item =>
				item.GetProperty("jobType").GetString() == jobType
			);
		} finally {
			await this._CleanupAsync(jobType);
		}
	}

	// --- helpers ------------------------------------------------------------------------

	private async Task<string> _SeedQueueItemAsync(
		Guid? tenantId = null,
		string? lastError = null
	) {
		var jobType = $"spec.a5.queue.{Guid.NewGuid():N}";

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		dbContext.JobQueue.Add(new JobQueueItem {
			JobType = jobType,
			Payload = "{}",
			Priority = 0,
			MaxAttempts = 10,
			TenantId = tenantId,
			LastError = lastError,
		});
		_ = await dbContext.SaveChangesAsync();

		return jobType;
	}

	private async Task<(Guid Id, string Name)> _SeedTenantAsync() {
		var name = $"Spec job tenant {Guid.NewGuid():N}";

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = name,
			Code = $"spec-{Guid.NewGuid():N}",
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		_ = await dbContext.Tenant.AddAsync(tenant);
		_ = await dbContext.SaveChangesAsync();

		return (tenant.GetRequiredId(), name);
	}

	private async Task _DeleteTenantAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		_ = await dbContext.Tenant
			.Where(row => row.Id == tenantId)
			.ExecuteDeleteAsync();
	}

	private async Task _CleanupAsync(string jobType) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		_ = await dbContext.JobQueue
			.Where(row => row.JobType == jobType)
			.ExecuteDeleteAsync();
	}

	private async Task<(string Token, Guid UserId)>
		_CreateUnprivilegedStaffUserAsync() {
		var email = $"no-perms-queue-{Guid.NewGuid():N}@example.com";

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "Queue",
			IsVerified = true,
			Status = UserStatus.Active,
		};

		_ = dbContext.User.Add(user);
		_ = await dbContext.SaveChangesAsync();

		var userId = user.GetRequiredId();
		var staffAccount = UserAccount.CreateStaffAccount(userId, AccountLevel.User);
		staffAccount.ValidateAccountType();
		_ = dbContext.UserAccount.Add(staffAccount);
		_ = await dbContext.SaveChangesAsync();

		var token = await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);
		return (token, userId);
	}
}
