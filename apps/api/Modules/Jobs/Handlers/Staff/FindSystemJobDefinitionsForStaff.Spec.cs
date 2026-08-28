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

// A5 (#636): GET /staff/jobs/system-jobs — system job definitions list read.
// Contract: 200 page including the seeded definition, is_enabled filter honored,
// 400 invalid filter, 401 without a session, 403 unprivileged staff.
public sealed class FindSystemJobDefinitionsForStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindSystemJobDefinitionsForStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string Url() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.JobsRoot,
			Routes.Jobs.ForStaff.SystemJobs.Root
		);
	}

	[Fact]
	public async Task ItShouldListDefinitionsIncludingTheSeededOne() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var jobKey = await SeedDefinitionAsync(isEnabled: true);

		try {
			var request = new HttpRequestMessage(HttpMethod.Get, Url())
				.WithSessionToken(token);

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			var data = document.RootElement.GetProperty("data");
			data.GetArrayLength().Should().BeGreaterThan(0);

			var seededItem = data.EnumerateArray().First(item =>
				item.GetProperty("jobKey").GetString() == jobKey
			);
			seededItem.GetProperty("isEnabled").GetBoolean().Should().BeTrue();

			// The list wire shape never carries payloads.
			seededItem.TryGetProperty("payload", out _)
				.Should().BeFalse();
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldFilterByIsEnabled() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var enabledKey = await SeedDefinitionAsync(isEnabled: true);
		var disabledKey = await SeedDefinitionAsync(isEnabled: false);

		try {
			var request = new HttpRequestMessage(HttpMethod.Get, $"{Url()}?is_enabled=false")
				.WithSessionToken(token);

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			var data = document.RootElement.GetProperty("data");
			data.EnumerateArray().Select(item => item.GetProperty("jobKey").GetString())
				.Should().Contain(disabledKey)
				.And.NotContain(enabledKey);
		} finally {
			await CleanupAsync(enabledKey);
			await CleanupAsync(disabledKey);
		}
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForAnInvalidIsEnabledFilter() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(HttpMethod.Get, $"{Url()}?is_enabled=yes")
			.WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
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

	private async Task<string> SeedDefinitionAsync(bool isEnabled) {
		var jobKey = $"spec.a5.sys-list.{Guid.NewGuid():N}";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		dbContext.SystemJobDefinition.Add(new SystemJobDefinition {
			JobKey = jobKey,
			CronExpression = "0 0 3 * * ?",
			ScheduleEpoch = Guid.NewGuid(),
			IsEnabled = isEnabled,
			Description = "A5 endpoint spec row",
		});
		_ = await dbContext.SaveChangesAsync();

		return jobKey;
	}

	private async Task CleanupAsync(string jobKey) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM system_job_occurrences WHERE job_key = {jobKey}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM system_job_definitions WHERE job_key = {jobKey}"
		);
	}

	private async Task<(string Token, Guid UserId)>
		CreateUnprivilegedStaffUserAsync() {
		var email = $"no-perms-sys-list-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "SysList",
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
