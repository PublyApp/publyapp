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

// A5 (#636): GET /staff/jobs/queue/{id} — one queue row's full detail, payload
// included. Contract: 200 with the seeded row's fields, 404 unknown AND
// malformed id (no route constraints), 401 without a session, 403 unprivileged.
public sealed class GetJobQueueItemForStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetJobQueueItemForStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string Url(string queueItemId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.JobsRoot,
			Routes.Jobs.ForStaff.Queue.Root,
			Routes.Jobs.ForStaff.Queue.GetByIdFn(queueItemId)
		);
	}

	[Fact]
	public async Task ItShouldReturnTheSeededRowDetail() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var (jobType, queueItemId) = await SeedQueueItemAsync();

		try {
			var request = new HttpRequestMessage(HttpMethod.Get, Url(queueItemId))
				.WithSessionToken(token);

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			document.RootElement.GetProperty("id").GetString()
				.Should().Be(queueItemId);
			document.RootElement.GetProperty("jobType").GetString()
				.Should().Be(jobType);
			document.RootElement.GetProperty("status").GetString()
				.Should().Be("pending");
			document.RootElement.GetProperty("payload").GetString()
				.Should().NotBeNullOrEmpty("detail reads carry the real payload");
			document.RootElement.TryGetProperty("data", out _)
				.Should().BeFalse("the detail is the row object itself");
		} finally {
			await CleanupAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForUnknownId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			Url(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMalformedIdWithoutRouteConstraint() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(HttpMethod.Get, Url("not-a-guid"))
			.WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldRequireASession() {
		using var response = await _http.GetAsync(Url(Guid.NewGuid().ToString()));

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var unprivileged = await CreateUnprivilegedStaffUserAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			Url(Guid.NewGuid().ToString())
		).WithSessionToken(unprivileged.Token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	// --- helpers ------------------------------------------------------------------------

	private async Task<(string JobType, string QueueItemId)> SeedQueueItemAsync() {
		var jobType = $"spec.a5.queue-detail.{Guid.NewGuid():N}";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var item = new JobQueueItem {
			JobType = jobType,
			Payload = "{\"spec\":true}",
			Priority = 0,
			MaxAttempts = 10,
		};
		dbContext.JobQueue.Add(item);
		_ = await dbContext.SaveChangesAsync();

		var id = item.Id ?? throw new InvalidOperationException(
			"Inserted job_queue row came back with a NULL id."
		);
		return (jobType, id.ToString());
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
		var email = $"no-perms-queue-item-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "QueueItem",
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
