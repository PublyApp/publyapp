using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.ProblemResults;
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

// A5 (#636): PATCH /staff/jobs/system-jobs/{id}/enabled — enable/disable flip
// with audit + K-3 protected-key guard. Contract: 200 with the new state and
// exactly one Enabled/Disabled audit row; disable of a protected key → 409
// with nothing written; 404 unknown/malformed; 401/403 auth gates.
public sealed class UpdateSystemJobDefinitionEnabledForStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UpdateSystemJobDefinitionEnabledForStaffSpec(ApiFixture fixture) {
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
			"enabled"
		);
	}

	[Fact]
	public async Task ItShouldDisableADefinitionAndAuditIt() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var (jobKey, definitionId) = await SeedDefinitionAsync(isEnabled: true);

		try {
			var request = new HttpRequestMessage(HttpMethod.Patch, Url(definitionId))
				.WithSessionToken(token);
			request.Content = JsonContent.Create(new { isEnabled = false });

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			document.RootElement.GetProperty("id").GetString()
				.Should().Be(definitionId);
			document.RootElement.GetProperty("isEnabled").GetBoolean()
				.Should().BeFalse();
			document.RootElement.GetProperty("key").GetString()
				.Should().Be(ResponseKeys.SystemJobDefinitionUpdateSuccess.Value);

			await using var verify = await CreateDbContextAsync();
			var row = await verify.SystemJobDefinition
				.SingleAsync(d => d.JobKey == jobKey);
			row.IsEnabled.Should().BeFalse();

			var audit = await verify.AuditLog
				.Where(a => a.TargetId == Guid.Parse(definitionId))
				.SingleOrDefaultAsync(a =>
					a.Action == AuditActions.JobSystemJobDisabled
				);
			audit.Should().NotBeNull("the disable is audit-logged");
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldEnableADisabledDefinitionAndAuditIt() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var (jobKey, definitionId) = await SeedDefinitionAsync(isEnabled: false);

		try {
			var request = new HttpRequestMessage(HttpMethod.Patch, Url(definitionId))
				.WithSessionToken(token);
			request.Content = JsonContent.Create(new { isEnabled = true });

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			document.RootElement.GetProperty("isEnabled").GetBoolean()
				.Should().BeTrue();

			await using var verify = await CreateDbContextAsync();
			var audit = await verify.AuditLog
				.Where(a => a.TargetId == Guid.Parse(definitionId))
				.SingleOrDefaultAsync(a =>
					a.Action == AuditActions.JobSystemJobEnabled
				);
			audit.Should().NotBeNull("the enable is audit-logged");
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldRefuseDisablingAProtectedKeyWithConflict() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		const string protectedJobKey =
			PublyApp.Api.Modules.Messaging.Jobs.EmailPreparedSendsRetentionHandler
				.JobKey;

		// The seeder plants this exact row (unique ux_system_job_definitions_job_key),
		// so the spec reuses it instead of inserting a duplicate.
		var definitionId = await GetExistingOrSeedAsync(protectedJobKey);

		try {
			var request = new HttpRequestMessage(HttpMethod.Patch, Url(definitionId))
				.WithSessionToken(token);
			request.Content = JsonContent.Create(new { isEnabled = false });

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.Conflict);
			var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
			Assert.NotNull(problem);
			problem.TranslationKey.Should()
				.Be(ResponseKeys.SystemJobDisableProtected.Value);

			// Nothing changed: K-3 keeps the protected key enabled.
			await using var verify = await CreateDbContextAsync();
			(await verify.SystemJobDefinition.SingleAsync(
				d => d.JobKey == protectedJobKey
			)).IsEnabled.Should().BeTrue("K-3: the disable must not land");

			// No audit row for a refused write.
			(await verify.AuditLog.AnyAsync(a =>
				a.Action == AuditActions.JobSystemJobDisabled
				&& a.TargetId == Guid.Parse(definitionId)
			)).Should().BeFalse();
		} finally {
			// No cleanup: this is the seeder-owned row.
		}
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForUnknownId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Patch,
			Url(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { isEnabled = true });

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMalformedIdWithoutRouteConstraint() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(HttpMethod.Patch, Url("not-a-guid"))
			.WithSessionToken(token);
		request.Content = JsonContent.Create(new { isEnabled = true });

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldRequireASession() {
		var request = new HttpRequestMessage(
			HttpMethod.Patch,
			Url(Guid.NewGuid().ToString())
		);
		request.Content = JsonContent.Create(new { isEnabled = false });

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenAndChangeNothingWithoutPermission() {
		var unprivileged = await CreateUnprivilegedStaffUserAsync();
		var (jobKey, definitionId) = await SeedDefinitionAsync(isEnabled: true);

		try {
			var request = new HttpRequestMessage(HttpMethod.Patch, Url(definitionId))
				.WithSessionToken(unprivileged.Token);
			request.Content = JsonContent.Create(new { isEnabled = false });

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

			await using var verify = await CreateDbContextAsync();
			(await verify.SystemJobDefinition
				.SingleAsync(d => d.JobKey == jobKey))
				.IsEnabled.Should().BeTrue("nothing changes without permission");
			(await verify.AuditLog.AnyAsync(a =>
				a.TargetId == Guid.Parse(definitionId)
			)).Should().BeFalse();
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	// --- helpers ------------------------------------------------------------------------

	private async Task<(string JobKey, string DefinitionId)> SeedDefinitionAsync(
		bool isEnabled
	) {
		var jobKey = $"spec.a5.sys-enabled.{Guid.NewGuid():N}";

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

	// The seeder owns the protected key row; reuse it when present so the unique
	// ux_system_job_definitions_job_key index never trips.
	private async Task<string> GetExistingOrSeedAsync(string jobKey) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var existing = await dbContext.SystemJobDefinition
			.AsNoTracking()
			.SingleOrDefaultAsync(row => row.JobKey == jobKey);
		if (existing?.Id is not null) {
			return existing.Id.ToString()!;
		}

		var definition = new SystemJobDefinition {
			JobKey = jobKey,
			CronExpression = "0 0/5 * * * ?",
			ScheduleEpoch = Guid.NewGuid(),
			IsEnabled = true,
			Description = "A5 spec fallback seed",
		};
		dbContext.SystemJobDefinition.Add(definition);
		_ = await dbContext.SaveChangesAsync();

		return (definition.Id ?? throw new InvalidOperationException(
			"Inserted system_job_definitions row came back with a NULL id."
		)).ToString()!;
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
		var email = $"no-perms-sys-enabled-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "SysEnabled",
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
