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

// A5 (#636): GET /staff/jobs/system-jobs/{id} — one definition's detail with
// recent occurrences. Contract: 200 with the seeded row's fields, 404 unknown
// AND malformed id, 401 without a session, 403 unprivileged staff.
public sealed class GetSystemJobDefinitionForStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetSystemJobDefinitionForStaffSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _Url(string systemJobId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.JobsRoot,
			Routes.Jobs.ForStaff.SystemJobs.Root,
			Routes.Jobs.ForStaff.SystemJobs.GetByIdFn(systemJobId)
		);
	}

	[Fact]
	public async Task ItShouldReturnTheSeededDefinitionDetail() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var (jobKey, definitionId) = await _SeedDefinitionAsync();

		try {
			var request = new HttpRequestMessage(HttpMethod.Get, _Url(definitionId))
				.WithSessionToken(token);

			using var response = await _Http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			document.RootElement.GetProperty("id").GetString()
				.Should().Be(definitionId);
			document.RootElement.GetProperty("jobKey").GetString()
				.Should().Be(jobKey);
			document.RootElement.GetProperty("cronExpression").GetString()
				.Should().Be("0 0 3 * * ?");
			document.RootElement.GetProperty("isEnabled").GetBoolean()
				.Should().BeTrue();
			document.RootElement.GetProperty("scheduleEpoch").GetString()
				.Should().NotBeEmpty();
			document.RootElement.GetProperty("recentOccurrences")
				.ValueKind.Should().Be(JsonValueKind.Array);
			document.RootElement.TryGetProperty("data", out _)
				.Should().BeFalse("the detail is the row object itself");
		} finally {
			await _CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForUnknownId() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			_Url(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMalformedIdWithoutRouteConstraint() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(HttpMethod.Get, _Url("not-a-guid"))
			.WithSessionToken(token);

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldRequireASession() {
		using var response = await _Http.GetAsync(_Url(Guid.NewGuid().ToString()));

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var unprivileged = await _CreateUnprivilegedStaffUserAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			_Url(Guid.NewGuid().ToString())
		).WithSessionToken(unprivileged.Token);

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	// --- helpers ------------------------------------------------------------------------

	private async Task<(string JobKey, string DefinitionId)> _SeedDefinitionAsync() {
		var jobKey = $"spec.a5.sys-detail.{Guid.NewGuid():N}";
		var epoch = Guid.NewGuid();

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var definition = new SystemJobDefinition {
			JobKey = jobKey,
			CronExpression = "0 0 3 * * ?",
			ScheduleEpoch = epoch,
			IsEnabled = true,
			Description = "A5 endpoint spec row",
		};
		dbContext.SystemJobDefinition.Add(definition);
		_ = await dbContext.SaveChangesAsync();

		var id = definition.Id ?? throw new InvalidOperationException(
			"Inserted system_job_definitions row came back with a NULL id."
		);

		dbContext.SystemJobOccurrence.Add(new SystemJobOccurrence {
			JobKey = jobKey,
			ScheduledFireAt = DateTime.UtcNow.AddMinutes(-10),
			EnqueuedAt = DateTime.UtcNow.AddMinutes(-10),
		});
		_ = await dbContext.SaveChangesAsync();

		return (jobKey, id.ToString());
	}

	private async Task _CleanupAsync(string jobKey) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM system_job_occurrences WHERE job_key = {jobKey}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM system_job_definitions WHERE job_key = {jobKey}"
		);
	}

	private async Task<(string Token, Guid UserId)>
		_CreateUnprivilegedStaffUserAsync() {
		var email = $"no-perms-sys-detail-{Guid.NewGuid():N}@example.com";

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "SysDetail",
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

		var token = await _AuthClient.LoginAsync(email, TestConstants.SeedPassword);
		return (token, userId);
	}
}
