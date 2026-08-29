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
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

// A5 (#636): PATCH /staff/jobs/system-jobs/{id}/cron — cron rewrite with audit,
// Quartz validation, and the NO-DOUBLE-ROTATION contract: the response carries
// the UNCHANGED schedule_epoch; SyncSystemJobsJob is its sole writer. Contract:
// 200 + unchanged epoch + CronUpdated audit row; 404 unknown/malformed; 422
// invalid cron with nothing written; 401/403 auth gates.
public sealed class UpdateSystemJobDefinitionCronForStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UpdateSystemJobDefinitionCronForStaffSpec(ApiFixture fixture) {
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
			"cron"
		);
	}

	[Fact]
	public async Task ItShouldUpdateTheCronAndAuditWithoutRotatingTheEpoch() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var (jobKey, definitionId, originalEpoch) = await SeedDefinitionAsync();

		try {
			const string newCron = "0 30 4 * * ?";
			var request = new HttpRequestMessage(HttpMethod.Patch, Url(definitionId))
				.WithSessionToken(token);
			request.Content = JsonContent.Create(
				new { cronExpression = newCron }
			);

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			document.RootElement.GetProperty("id").GetString()
				.Should().Be(definitionId);

			// NO-DOUBLE-ROTATION: the wire epoch equals the stored, unchanged one.
			document.RootElement.GetProperty("scheduleEpoch").GetString()
				.Should().Be(originalEpoch.ToString());

			await using var verify = await CreateDbContextAsync();
			var row = await verify.SystemJobDefinition
				.SingleAsync(d => d.JobKey == jobKey);
			row.CronExpression.Should().Be(newCron);
			row.ScheduleEpoch.Should().Be(originalEpoch);
			row.IsEnabled.Should().BeTrue("the cron write must not touch enabled");

			var audit = await verify.AuditLog
				.Where(a => a.TargetId == Guid.Parse(definitionId))
				.SingleOrDefaultAsync(a =>
					a.Action == AuditActions.JobSystemJobCronUpdated
				);
			audit.Should().NotBeNull("the cron update is audit-logged");
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityForAnInvalidCron() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var (jobKey, definitionId, originalEpoch) = await SeedDefinitionAsync();

		try {
			var request = new HttpRequestMessage(HttpMethod.Patch, Url(definitionId))
				.WithSessionToken(token);
			request.Content = JsonContent.Create(
				new { cronExpression = "not a quartz cron at all" }
			);

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.UnprocessableEntity);
			var problem = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(problem);
			problem.RootElement.GetProperty("errors")
				.GetProperty("cron_expression").EnumerateArray()
				.Should().NotBeEmpty();

			// Nothing written: cron AND epoch stay exactly as seeded.
			await using var verify = await CreateDbContextAsync();
			var row = await verify.SystemJobDefinition
				.SingleAsync(d => d.JobKey == jobKey);
			row.CronExpression.Should().Be("0 0 3 * * ?");
			row.ScheduleEpoch.Should().Be(originalEpoch);
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForUnknownId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Patch,
			Url(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(
			new { cronExpression = "0 0 3 * * ?" }
		);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMalformedIdWithoutRouteConstraint() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(HttpMethod.Patch, Url("not-a-guid"))
			.WithSessionToken(token);
		request.Content = JsonContent.Create(
			new { cronExpression = "0 0 3 * * ?" }
		);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldRequireASession() {
		var request = new HttpRequestMessage(
			HttpMethod.Patch,
			Url(Guid.NewGuid().ToString())
		);
		request.Content = JsonContent.Create(
			new { cronExpression = "0 0 3 * * ?" }
		);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenAndChangeNothingWithoutPermission() {
		var unprivileged = await CreateUnprivilegedStaffUserAsync();
		var (jobKey, definitionId, _) = await SeedDefinitionAsync();

		try {
			var request = new HttpRequestMessage(HttpMethod.Patch, Url(definitionId))
				.WithSessionToken(unprivileged.Token);
			request.Content = JsonContent.Create(
				new { cronExpression = "0 15 5 * * ?" }
			);

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

			await using var verify = await CreateDbContextAsync();
			(await verify.SystemJobDefinition
				.SingleAsync(d => d.JobKey == jobKey))
				.CronExpression.Should()
				.Be("0 0 3 * * ?", "nothing changes without permission");
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	// --- helpers ------------------------------------------------------------------------

	private async Task<(string JobKey, string DefinitionId, Guid Epoch)>
		SeedDefinitionAsync() {
		var jobKey = $"spec.a5.sys-cron.{Guid.NewGuid():N}";
		var epoch = Guid.NewGuid();

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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
		return (jobKey, id.ToString(), epoch);
	}

	private async Task CleanupAsync(string jobKey) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			DELETE FROM audit_logs
			WHERE target_id IN (
				SELECT id FROM system_job_definitions WHERE job_key = {jobKey}
			)
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
		var email = $"no-perms-sys-cron-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "SysCron",
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
