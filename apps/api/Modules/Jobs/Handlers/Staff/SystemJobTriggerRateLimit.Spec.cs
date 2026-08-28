using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Jobs.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

// A5 (#636): the system-job-trigger policy rate-limits POST trigger requests by
// VALIDATED SESSION FINGERPRINT (#1458 follow-up 5): the hashed validated session
// id stamped by session auth. The 31st trigger within the window on ONE session
// is refused with an RFC 7807 429 while a SECOND session's very next request
// still passes on its own independent budget.
//
// The target definition is seeded DISABLED: every in-budget request is then a
// deliberate 200 NoOp that writes NOTHING (no queue copy, no ledger, no audit)
// while still consuming exactly one limiter permit — the limiter fires before
// any handler logic. Zero side effects, full rate-limit coverage.
public sealed class SystemJobTriggerRateLimitSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public SystemJobTriggerRateLimitSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldRefuseTheThirtyFirstTriggerOnOneSessionButPassAnotherSession() {
		var permitLimit = AppEnvironment
			.Instance.SYSTEM_JOB_TRIGGER_RATE_LIMIT_PERMIT_LIMIT;

		var definitionId = await SeedDisabledDefinitionAsync();

		try {
			await using var factory = CreateFactory(permitLimit: permitLimit);
			using var client = CreateClient(factory);

			var firstToken = await new TestAuthClient(client)
				.LoginAsStaffAdminAsync();

			// Burn exactly the session budget; every in-budget request must pass.
			HttpResponseMessage? rejected = null;
			try {
				for (
					var requestNumber = 1;
					requestNumber <= permitLimit + 1;
					requestNumber++
				) {
					using var request = CreateTriggerRequest(
						firstToken, definitionId
					);
					var response = await client.SendAsync(request);

					if (requestNumber <= permitLimit) {
						response.StatusCode.Should().Be(
							HttpStatusCode.OK,
							$"trigger {requestNumber} of {permitLimit} must pass"
						);
						response.Dispose();
					} else {
						rejected = response;
					}
				}
			} finally {
				if (rejected is not null) {
					using (rejected) {
						await AssertRateLimitedResponseAsync(rejected);
					}
				}
			}

			// A second staff session partitions independently: its budget is
			// intact, so its very next trigger passes even though session one
			// is exhausted.
			var secondToken = await new TestAuthClient(client)
				.LoginAsStaffAdminAsync();
			using var secondSessionRequest =
				CreateTriggerRequest(secondToken, definitionId);
			using var secondSessionResponse =
				await client.SendAsync(secondSessionRequest);
			secondSessionResponse.StatusCode.Should().Be(
				HttpStatusCode.OK,
				"partition key is the validated session fingerprint, "
				+ "not a global bucket"
			);
		} finally {
			await CleanupAsync(definitionId);
		}
	}

	private static HttpRequestMessage CreateTriggerRequest(
		string token,
		string definitionId
	) {
		return new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Jobs.ForStaff.JobsRoot,
				Routes.Jobs.ForStaff.SystemJobs.Root,
				Routes.Jobs.ForStaff.SystemJobs.GetByIdFn(definitionId),
				"trigger"
			)
		).WithSessionToken(token);
	}

	private async Task<string> SeedDisabledDefinitionAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var definition = new SystemJobDefinition {
			JobKey = $"spec.a5.trigger-limit.{Guid.NewGuid():N}",
			CronExpression = "0 0 3 * * ?",
			ScheduleEpoch = Guid.NewGuid(),
			IsEnabled = false,
			Description = "A5 rate-limit spec row",
		};
		dbContext.SystemJobDefinition.Add(definition);
		_ = await dbContext.SaveChangesAsync();

		return (definition.Id ?? throw new InvalidOperationException(
			"Inserted system_job_definitions row came back with a NULL id."
		)).ToString();
	}

	private async Task CleanupAsync(string definitionId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM audit_logs WHERE target_id = {Guid.Parse(definitionId)}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM system_job_definitions WHERE id = {Guid.Parse(definitionId)}"
		);
	}

	private WebApplicationFactory<Program> CreateFactory(int permitLimit) {
		const int longWindowSeconds = 3600;
		const int generousOtherLimits = 10000;
		var anonymousSettings = new AnonymousAuthRateLimitSettings(
			PerIp: new RateLimitWindowSettings(
				generousOtherLimits,
				longWindowSeconds
			),
			PerEmail: new RateLimitWindowSettings(
				generousOtherLimits,
				longWindowSeconds
			),
			PasswordResetPerEmail: new RateLimitWindowSettings(
				generousOtherLimits,
				longWindowSeconds
			)
		);
		var apiSettings = new ApiRateLimitSettings(
			Global: new RateLimitWindowSettings(
				generousOtherLimits, longWindowSeconds
			),
			AnonymousOther: new RateLimitWindowSettings(
				generousOtherLimits, longWindowSeconds
			),
			Authenticated: new RateLimitWindowSettings(
				generousOtherLimits, longWindowSeconds
			),
			HeavySearch: new RateLimitWindowSettings(
				generousOtherLimits, longWindowSeconds
			),
			Bulk: new RateLimitWindowSettings(
				generousOtherLimits, longWindowSeconds
			),
			TenantBulk: new RateLimitWindowSettings(
				generousOtherLimits, longWindowSeconds
			),
			Email: new RateLimitWindowSettings(
				generousOtherLimits, longWindowSeconds
			),
			TenantEmail: new RateLimitWindowSettings(
				generousOtherLimits, longWindowSeconds
			),
			Export: new RateLimitWindowSettings(
				generousOtherLimits, longWindowSeconds
			),
			TenantExport: new RateLimitWindowSettings(
				generousOtherLimits, longWindowSeconds
			),
			Upload: new RateLimitWindowSettings(
				generousOtherLimits, longWindowSeconds
			),
			SocialConnect: new RateLimitWindowSettings(
				generousOtherLimits, longWindowSeconds
			),
			// A5 (#636): the ONLY tight window in this spec; every other policy
			// stays generous so login/setup traffic never trips anything else.
			SystemJobTrigger: new RateLimitWindowSettings(
				permitLimit, longWindowSeconds
			)
		);

		return _fixture.Factory.WithWebHostBuilder(
			builder => {
				builder.ConfigureServices(services => {
					services.RemoveAll<AnonymousAuthRateLimitSettings>();
					services.RemoveAll<ApiRateLimitSettings>();
					services.AddSingleton(anonymousSettings);
					services.AddSingleton(apiSettings);
				});
			}
		);
	}

	private static HttpClient CreateClient(
		WebApplicationFactory<Program> factory
	) {
		return factory.CreateClient(
			new WebApplicationFactoryClientOptions {
				HandleCookies = false,
			}
		);
	}

	private static async Task AssertRateLimitedResponseAsync(
		HttpResponseMessage response
	) {
		response.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
		response.Content.Headers.ContentType?.MediaType
			.Should().Be("application/problem+json");

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Status.Should().Be(StatusCodes.Status429TooManyRequests);
		problem.Title.Should().Be("Too Many Requests");
		problem.TranslationKey.Should().Be(ResponseKeys.TooManyRequests);

		response.Headers.TryGetValues(
			"Retry-After",
			out var retryAfterValues
		).Should().BeTrue();
		var retryAfter = retryAfterValues?.Single();
		int.TryParse(retryAfter, out var retryAfterSeconds)
			.Should().BeTrue();
		retryAfterSeconds.Should().BeGreaterThan(0);
	}
}
