using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.Publishing.Providers;
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

// Integration spec for the tenant schedule endpoint (D3 Task 1). Real ephemeral
// Postgres via ApiFixture. Scheduling NEVER publishes: the fake IPublishProvider
// recorder proves the provider seam stays untouched on this path.
public sealed class SchedulePostForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public SchedulePostForTenantSpec(ApiFixture fixture) {
		_fixture = fixture;

		// Every request flows through a host whose IPublishProvider is the recording
		// fake, so any accidental provider contact fails the zero-call assertions.
		var spiedFactory = fixture.Factory.WithWebHostBuilder(
			builder => {
				builder.ConfigureServices(services => {
					services.RemoveAll<IPublishProvider>();
					services.AddSingleton<IPublishProvider>(
						RecordingPublishProvider.Instance
					);
				});
			}
		);
		_http = spiedFactory.CreateClient(
			new WebApplicationFactoryClientOptions {
				HandleCookies = false,
			}
		);
		_authClient = new TestAuthClient(_http);
		_http.DefaultRequestHeaders.Accept.Clear();
		_http.DefaultRequestHeaders.Accept.Add(
			new MediaTypeWithQualityHeaderValue("application/json")
		);
	}

	private static string ScheduleUrl(string postId) {
		return $"/posts/{postId}/schedule";
	}

	// 09:00 on 2099-08-26 in Europe/Paris summer time is 07:00Z. The wire field
	// carries an ISO INSTANT (with Z/offset designator) — not a bare wall clock.
	private const string FutureInstantJson = "2099-08-26T07:00:00Z";
	private static readonly DateTimeOffset FutureInstant =
		new(2099, 8, 26, 7, 0, 0, TimeSpan.Zero);
	private const string FutureZone = "Europe/Paris";

	[Fact]
	public async Task ItShouldScheduleOnePublicationPerAccountWithUtcInstantAndZone() {
		RecordingPublishProvider.Reset();
		var (tenantId, token, postId) = await CreatePostAsAcmeAdminAsync();

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var accountId = await SeedActiveAccountAsync(db, tenantId);

		using var request =
			new HttpRequestMessage(HttpMethod.Post, ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			accountIds = new[] { accountId.ToString() },
			scheduledAtLocal = FutureInstantJson,
			timeZone = FutureZone,
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		await using var verifyScope =
			_fixture.Factory.Services.CreateAsyncScope();
		var verifyDb =
			verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
		var postIdGuid = Guid.Parse(postId);
		var publication = await (
			from p in verifyDb.Publication.AsNoTracking()
			where p.PostId == postIdGuid
				&& p.TenantId == tenantId
				&& !p.IsDeleted
			select p
		).SingleAsync();

		publication.Status.Should().Be(PublicationStatus.Scheduled);
		new DateTimeOffset(publication.ScheduledAtUtc).Should().Be(FutureInstant);
		publication.ScheduledTimeZone.Should().Be(FutureZone);
		publication.SocialAccountId.Should().Be(accountId);
		publication.IdempotencyKey.Should().Be(
			PublicationIdempotencyKey.For(publication.GetRequiredId())
		);
		RecordingPublishProvider.CallCount.Current.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldCreateDistinctPublicationsForMultipleAccounts() {
		var (tenantId, token, postId) = await CreatePostAsAcmeAdminAsync();

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var first = await SeedActiveAccountAsync(db, tenantId);
		var second = await SeedActiveAccountAsync(db, tenantId);

		using var request =
			new HttpRequestMessage(HttpMethod.Post, ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			accountIds = new[] { first.ToString(), second.ToString() },
			scheduledAtLocal = FutureInstantJson,
			timeZone = FutureZone,
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		await using var verifyScope =
			_fixture.Factory.Services.CreateAsyncScope();
		var verifyDb =
			verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
		var postIdGuid = Guid.Parse(postId);
		var publications = await (
			from p in verifyDb.Publication.AsNoTracking()
			where p.PostId == postIdGuid
				&& p.TenantId == tenantId
				&& !p.IsDeleted
			select p
		).ToListAsync();
		publications.Should().HaveCount(2);
		publications.Select(p => p.Id).Should().OnlyHaveUniqueItems();
		publications.Select(p => p.IdempotencyKey).Should().OnlyHaveUniqueItems();
	}

	[Fact]
	public async Task ItShouldReturn422WhenAccountIsNotVisibleInThePostProject() {
		var (tenantId, token, postId) = await CreatePostAsAcmeAdminAsync();

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		// Attach the post to a dedicated project, then seed an account attached to
		// that SAME project — the account is visible in the project, so scheduling
		// succeeds. This pins the positive side of the visibility gate before the
		// negative cases below.
		var project = new Modules.Projects.Entities.Project {
			TenantId = tenantId,
			Name = "sched-probe-" + Guid.NewGuid().ToString("N")[..8],
		};
		db.Project.Add(project);
		await db.SaveChangesAsync();
		await db.Post
			.Where(p => p.Id == Guid.Parse(postId))
			.ExecuteUpdateAsync(
				s => s.SetProperty(p => p.ProjectId, project.Id)
			);

		var accountId = await SeedActiveAccountAsync(db, tenantId, project.Id);

		using var request =
			new HttpRequestMessage(HttpMethod.Post, ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			accountIds = new[] { accountId.ToString() },
			scheduledAtLocal = FutureInstantJson,
			timeZone = FutureZone,
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);
	}

	[Fact]
	public async Task ItShouldReturn422WhenAccountIsAttachedToAnotherProject() {
		var (tenantId, token, postId) = await CreatePostAsAcmeAdminAsync();

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var postProject = new Modules.Projects.Entities.Project {
			TenantId = tenantId,
			Name = "sched-post-" + Guid.NewGuid().ToString("N")[..8],
		};
		db.Project.Add(postProject);
		await db.SaveChangesAsync();
		await db.Post
			.Where(p => p.Id == Guid.Parse(postId))
			.ExecuteUpdateAsync(
				s => s.SetProperty(p => p.ProjectId, postProject.Id)
			);

		var accountId = await SeedActiveAccountAsync(db, tenantId);

		// Attach the account to a DIFFERENT project: it is no longer visible in the
		// post's project, so the whole request must be refused with a stable key.
		var otherProject = new Modules.Projects.Entities.Project {
			TenantId = tenantId,
			Name = "sched-other-" + Guid.NewGuid().ToString("N")[..8],
		};
		db.Project.Add(otherProject);
		await db.SaveChangesAsync();
		db.Set<SocialAccountProject>().Add(new SocialAccountProject {
			SocialAccount = await db.SocialAccount.SingleAsync(
				a => a.Id == accountId
			),
			ProjectId = otherProject.GetRequiredId(),
		});
		await db.SaveChangesAsync();

		using var request =
			new HttpRequestMessage(HttpMethod.Post, ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			accountIds = new[] { accountId.ToString() },
			scheduledAtLocal = FutureInstantJson,
			timeZone = FutureZone,
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem =
			await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("accountIds");
		problem.Errors["accountIds"][0].Should().Be(
			"publication-schedule-account-not-in-project"
		);
		problem.TranslationKey.Should().Be("unprocessable-entity");
	}

	[Fact]
	public async Task ItShouldReturn422WhenAccountIdsEmpty() {
		var (tenantId, token, postId) = await CreatePostAsAcmeAdminAsync();

		using var request =
			new HttpRequestMessage(HttpMethod.Post, ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			accountIds = Array.Empty<string>(),
			scheduledAtLocal = FutureInstantJson,
			timeZone = FutureZone,
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldReturn422WhenInstantIsInThePastBeyondDrift() {
		var (tenantId, token, postId) = await CreatePostAsAcmeAdminAsync();

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var accountId = await SeedActiveAccountAsync(db, tenantId);

		using var request =
			new HttpRequestMessage(HttpMethod.Post, ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			accountIds = new[] { accountId.ToString() },
			scheduledAtLocal = "2001-01-01T12:00:00Z",
			timeZone = FutureZone,
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem =
			await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("scheduledAtLocal");
	}

	[Fact]
	public async Task ItShouldReturn400WhenPostIdMalformed() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();

		using var request =
			new HttpRequestMessage(
				HttpMethod.Post,
				ScheduleUrl("not-a-guid")
			)
				.WithSessionToken(token)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			accountIds = new[] { Guid.NewGuid().ToString() },
			scheduledAtLocal = FutureInstantJson,
			timeZone = FutureZone,
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturn403WithoutPostsPublishPermission() {
		var tenantId = await GetAcmeIdAsync();
		var adminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var postId = await CreatePostAsync(tenantId, adminToken);

		// AcmeUser has no profiles assigned, so the permission filter refuses.
		var userToken = await _authClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var accountId = await SeedActiveAccountAsync(db, tenantId);

		using var request =
			new HttpRequestMessage(HttpMethod.Post, ScheduleUrl(postId))
				.WithSessionToken(userToken)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			accountIds = new[] { accountId.ToString() },
			scheduledAtLocal = FutureInstantJson,
			timeZone = FutureZone,
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturn404ForUnknownAndCrossTenantPostIds() {
		var (acmeTenantId, acmeToken, postId) =
			await CreatePostAsAcmeAdminAsync();
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var techStartId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.TechStartName
		);

		// Unknown id in the caller's own tenant → 404.
		using var unknownRequest =
			new HttpRequestMessage(
				HttpMethod.Post,
				ScheduleUrl(Guid.NewGuid().ToString())
			)
				.WithSessionToken(acmeToken)
				.WithTenantId(acmeTenantId);
		unknownRequest.Content = JsonContent.Create(new {
			accountIds = new[] { Guid.NewGuid().ToString() },
			scheduledAtLocal = FutureInstantJson,
			timeZone = FutureZone,
		});
		using var unknownResponse = await _http.SendAsync(unknownRequest);
		unknownResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
		unknownResponse.Headers.Location.Should().BeNull();

		// An EXISTING post addressed from a foreign tenant → also 404.
		var techStartToken = await _authClient.LoginAsync(
			TestConstants.TechStartAdminEmail,
			TestConstants.SeedPassword
		);
		using var foreignRequest =
			new HttpRequestMessage(HttpMethod.Post, ScheduleUrl(postId))
				.WithSessionToken(techStartToken)
				.WithTenantId(techStartId);
		foreignRequest.Content = JsonContent.Create(new {
			accountIds = new[] { Guid.NewGuid().ToString() },
			scheduledAtLocal = FutureInstantJson,
			timeZone = FutureZone,
		});
		using var foreignResponse = await _http.SendAsync(foreignRequest);
		foreignResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);

		await using var verifyScope =
			_fixture.Factory.Services.CreateAsyncScope();
		var verifyDb =
			verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
		(await verifyDb.Publication.AsNoTracking().AnyAsync(
			p => p.PostId == Guid.Parse(postId)
		)).Should().BeFalse("a cross-tenant attempt must not create anything");
	}

	[Fact]
	public async Task ItShouldNotCallThePublishProviderOnTheSchedulingPath() {
		RecordingPublishProvider.Reset();
		var (tenantId, token, postId) = await CreatePostAsAcmeAdminAsync();

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var accountId = await SeedActiveAccountAsync(db, tenantId);

		using var request =
			new HttpRequestMessage(HttpMethod.Post, ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			accountIds = new[] { accountId.ToString() },
			scheduledAtLocal = FutureInstantJson,
			timeZone = FutureZone,
		});

		using var response = await _http.SendAsync(request);
		response.EnsureSuccessStatusCode();

		RecordingPublishProvider.CallCount.Current.Should().Be(
			0,
			"scheduling enqueues work, it never contacts the provider"
		);
	}

	private async Task<(Guid TenantId, string Token, string PostId)>
	CreatePostAsAcmeAdminAsync() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);
		return (tenantId, token, postId);
	}

	private async Task<(Guid TenantId, string Token)>
	LoginAsAcmeAdminAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		return (tenantId, token);
	}

	private async Task<string> CreatePostAsync(
		Guid tenantId,
		string token
	) {
		using var request = new HttpRequestMessage(HttpMethod.Post, "/posts")
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = JsonContent.Create(
			new { body = "post to schedule " + Guid.NewGuid().ToString("N")[..8] }
		);

		using var response = await _http.SendAsync(request);
		response.EnsureSuccessStatusCode();
		var payload =
			await response.Content.ReadFromJsonAsync<ScheduleProbePostCreated>();
		Assert.NotNull(payload);
		return payload.Id.ToString();
	}

	private record ScheduleProbePostCreated(Guid Id);

	private async Task<Guid> GetAcmeIdAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
	}

	/// <summary>
	/// Seeds an Active social account for the tenant. When projectId is given the
	/// account is attached to that project only (so it is invisible elsewhere);
	/// otherwise it has no project rows and VisibleIn treats it as visible
	/// everywhere in the tenant.
	/// </summary>
	private static async Task<Guid> SeedActiveAccountAsync(
		AppDbContext db,
		Guid tenantId,
		Guid? projectId = null
	) {
		var account = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = "did:plc:" + Guid.NewGuid().ToString("N"),
			DisplayHandle = "@sched." + Guid.NewGuid().ToString("N")[..6]
				+ ".bsky.social",
			ProtectedCredentials = "enc-spec-blob",
			Status = SocialAccountStatus.Active,
		};
		db.SocialAccount.Add(account);
		if (projectId.HasValue) {
			db.Set<SocialAccountProject>().Add(new SocialAccountProject {
				SocialAccount = account,
				ProjectId = projectId.Value,
			});
		}
		await db.SaveChangesAsync();
		return account.GetRequiredId();
	}
}

/// <summary>
/// Test double swapped into DI by the spec constructor: records every publish call
/// so specs can prove the scheduling path NEVER reaches the provider.
/// </summary>
public sealed class RecordingPublishProvider : IPublishProvider {
	public static readonly RecordingPublishProvider Instance = new();

	public static class CallCount {
		public static int Current;
	}

	public static void Reset() {
		CallCount.Current = 0;
	}

	public Task<PublishResult> PublishAsync(
		PublishRequest request,
		CancellationToken cancellationToken
	) {
		Interlocked.Increment(ref CallCount.Current);
		throw new InvalidOperationException(
			"Scheduling must never reach the publish provider."
		);
	}
}
