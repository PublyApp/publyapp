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
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

// A5 (#636): POST /staff/jobs/system-jobs/{id}/trigger — trigger-now through the
// engine's own fences. Contract: 200 Enqueued → one pending queue row + one
// occurrence ledger row + one Triggered audit row; disabled key → deliberate 200
// NoOp with NOTHING written (verdict-r1 MEDIUM #2); 404 unknown/malformed;
// 401/403 auth gates. The rate-limit behavior has its own dedicated spec class.
public sealed class TriggerSystemJobDefinitionForStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public TriggerSystemJobDefinitionForStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string Url(string systemJobId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.JobsRoot,
			Routes.Jobs.ForStaff.SystemJobs.Root,
			Routes.Jobs.ForStaff.SystemJobs.GetByIdFn(systemJobId),
			"trigger"
		);
	}

	[Fact]
	public async Task ItShouldEnqueueOneOccurrenceLedgerRowAndAudit() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var (jobKey, definitionId) = await SeedDefinitionAsync(isEnabled: true);

		try {
			var request = new HttpRequestMessage(HttpMethod.Post, Url(definitionId))
				.WithSessionToken(token);
			request.Content = JsonContent.Create(new { });

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			var newJobId = document.RootElement.GetProperty("jobId").GetString();
			Guid.TryParse(newJobId, out _).Should()
				.BeTrue("the response names the enqueued queue row");
			document.RootElement.GetProperty("scheduleEpoch").GetString()
				.Should().NotBeEmpty();
			document.RootElement.GetProperty("key").GetString()
				.Should().Be(ResponseKeys.SystemJobTriggerSuccess.Value);

			// Exactly ONE queue copy for THIS occurrence.
			await using var verify = await CreateDbContextAsync();
			(await verify.JobQueue.SingleAsync(
				j => j.Id == Guid.Parse(newJobId!)
			)).Status.Should().Be(JobQueueStatus.Pending);

			// The occurrence ledger recorded this fire under the definition's key.
			(await verify.SystemJobOccurrence.CountAsync(o =>
				o.JobKey == jobKey && o.EnqueuedJobId == Guid.Parse(newJobId!)
			)).Should().Be(1);

			var audit = await verify.AuditLog
				.Where(a => a.TargetId == Guid.Parse(definitionId))
				.SingleOrDefaultAsync(a =>
					a.Action == AuditActions.JobSystemJobTriggered
				);
			audit.Should().NotBeNull("the trigger is audit-logged");
		} finally {
			await CleanupAsync(jobKey, definitionId);
		}
	}

	[Fact]
	public async Task ItShouldNoOpWithOkForADisabledKeyWritingNothing() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var (jobKey, definitionId) = await SeedDefinitionAsync(isEnabled: false);

		try {
			var request = new HttpRequestMessage(HttpMethod.Post, Url(definitionId))
				.WithSessionToken(token);
			request.Content = JsonContent.Create(new { });

			using var response = await _http.SendAsync(request);

			// Deliberate 200: the row exists, it just refused — that is not a 404.
			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			document.RootElement.GetProperty("jobId").GetString()
				.Should().Be(Guid.Empty.ToString(), "NoOp carries no real job id");
			document.RootElement.GetProperty("key").GetString()
				.Should().Be(ResponseKeys.SystemJobTriggerNoop.Value);

			// NOTHING was written: no queue copy, no ledger row, no audit row.
			await using var verify = await CreateDbContextAsync();
			(await verify.JobQueue.AnyAsync(j => j.JobType.StartsWith(jobKey)))
				.Should().BeFalse();
			(await verify.SystemJobOccurrence.AnyAsync(o => o.JobKey == jobKey))
				.Should().BeFalse();
			(await verify.AuditLog.AnyAsync(a =>
				a.Action == AuditActions.JobSystemJobTriggered
				&& a.TargetId == Guid.Parse(definitionId)
			)).Should().BeFalse();
		} finally {
			await CleanupAsync(jobKey, definitionId);
		}
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForUnknownId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Post,
			Url(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { });

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMalformedIdWithoutRouteConstraint() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(HttpMethod.Post, Url("not-a-guid"))
			.WithSessionToken(token);
		request.Content = JsonContent.Create(new { });

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldRequireASession() {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			Url(Guid.NewGuid().ToString())
		);
		request.Content = JsonContent.Create(new { });

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldWriteNothingWithoutPermission() {
		var unprivileged = await CreateUnprivilegedStaffUserAsync();
		var (jobKey, definitionId) = await SeedDefinitionAsync(isEnabled: true);

		try {
			var request = new HttpRequestMessage(HttpMethod.Post, Url(definitionId))
				.WithSessionToken(unprivileged.Token);
			request.Content = JsonContent.Create(new { });

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

			await using var verify = await CreateDbContextAsync();
			(await verify.SystemJobOccurrence.AnyAsync(o => o.JobKey == jobKey))
				.Should().BeFalse();
			(await verify.AuditLog.AnyAsync(a =>
				a.Action == AuditActions.JobSystemJobTriggered
				&& a.TargetId == Guid.Parse(definitionId)
			)).Should().BeFalse();
		} finally {
			await CleanupAsync(jobKey, definitionId);
		}
	}

	// --- helpers ------------------------------------------------------------------------

	private async Task<(string JobKey, string DefinitionId)> SeedDefinitionAsync(
		bool isEnabled
	) {
		var jobKey = $"spec.a5.trigger.{Guid.NewGuid():N}";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var definition = new SystemJobDefinition {
			JobKey = jobKey,
			CronExpression = "0 0 3 * * ?",
			ScheduleEpoch = Guid.NewGuid(),
			IsEnabled = isEnabled,
			Description = "A5 endpoint spec row",
		};
		dbContext.SystemJobDefinition.Add(definition);
		_ = await dbContext.SaveChangesAsync();

		var id = definition.Id ?? throw new InvalidOperationException(
			"Inserted system_job_definitions row came back with a NULL id."
		);
		return (jobKey, id.ToString());
	}

	private async Task CleanupAsync(string jobKey, string definitionId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_queue WHERE job_type LIKE {jobKey + "%"}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			DELETE FROM audit_logs
			WHERE target_id = {Guid.Parse(definitionId)}
			"""
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM system_job_occurrences WHERE job_key = {jobKey}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM system_job_definitions WHERE job_key = {jobKey}"
		);
	}

	private async Task<AppDbContext> CreateDbContextAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was null."
			);
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString).Options
		);
	}

	private async Task<(string Token, Guid UserId)>
		CreateUnprivilegedStaffUserAsync() {
		var email = $"no-perms-sys-trigger-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "SysTrigger",
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
