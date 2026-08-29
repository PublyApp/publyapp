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
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

// A5 (#636): GET /staff/jobs/queue — staff job-queue dashboard list read.
// Contract: 200 with a CursorPaginatedResult-shaped page containing the seeded
// row, 400 for an unknown status CSV token, 401 without a session, and 403 for
// staff without the jobs view permission.
public sealed class FindJobQueueItemsForStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindJobQueueItemsForStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string Url() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.JobsRoot,
			Routes.Jobs.ForStaff.Queue.Root
		);
	}

	[Fact]
	public async Task ItShouldListQueueItemsIncludingTheSeededPendingRow() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var jobType = await SeedQueueItemAsync();

		try {
			var request = new HttpRequestMessage(HttpMethod.Get, Url())
				.WithSessionToken(token);

			using var response = await _http.SendAsync(request);

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
			await CleanupAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldFilterByExactJobType() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var jobType = await SeedQueueItemAsync();

		try {
			var url = $"{Url()}?job_type={Uri.EscapeDataString(jobType)}";
			var request = new HttpRequestMessage(HttpMethod.Get, url)
				.WithSessionToken(token);

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			var data = document.RootElement.GetProperty("data");
			data.GetArrayLength().Should().BeGreaterThan(0);
			data.EnumerateArray().Should().OnlyContain(item =>
				item.GetProperty("jobType").GetString() == jobType
			);
		} finally {
			await CleanupAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForAnUnknownStatusToken() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{Url()}?status=not-a-status"
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldRequireASession() {
		using var response = await _http.GetAsync(Url());

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var unprivileged = await CreateUnprivilegedStaffUserAsync();

		var request = new HttpRequestMessage(HttpMethod.Get, Url())
			.WithSessionToken(unprivileged.Token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	// --- helpers ------------------------------------------------------------------------

	private async Task<string> SeedQueueItemAsync() {
		var jobType = $"spec.a5.queue.{Guid.NewGuid():N}";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		dbContext.JobQueue.Add(new JobQueueItem {
			JobType = jobType,
			Payload = "{}",
			Priority = 0,
			MaxAttempts = 10,
		});
		_ = await dbContext.SaveChangesAsync();

		return jobType;
	}

	private async Task CleanupAsync(string jobType) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		_ = await dbContext.JobQueue
			.Where(row => row.JobType == jobType)
			.ExecuteDeleteAsync();
	}

	private async Task<(string Token, Guid UserId)>
		CreateUnprivilegedStaffUserAsync() {
		var email = $"no-perms-queue-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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

		var token = await _authClient.LoginAsync(email, TestConstants.SeedPassword);
		return (token, userId);
	}
}
