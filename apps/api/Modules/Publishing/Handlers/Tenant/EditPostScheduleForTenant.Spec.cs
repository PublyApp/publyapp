using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

// Integration spec for the tenant edit-schedule endpoint (D3 Task 2). The PATCH
// edits the post text and/or replaces the schedule pair (instant + IANA zone) on
// every Scheduled/Paused publication; the WHOLE edit is refused with a plain-words
// 409 while any publication is InProgress.
public sealed class EditPostScheduleForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public EditPostScheduleForTenantSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
		_Http.DefaultRequestHeaders.Accept.Clear();
		_Http.DefaultRequestHeaders.Accept.Add(
			new MediaTypeWithQualityHeaderValue("application/json")
		);
	}

	private static string _ScheduleUrl(string postId) {
		return $"/posts/{postId}/schedule";
	}

	// 09:00 on 2099-12-15 in Europe/Paris winter time is 08:00Z. The wire field
	// carries an ISO INSTANT.
	private const string _WinterInstantJson = "2099-12-15T08:00:00Z";
	private static readonly DateTimeOffset _WinterInstant =
		new(2099, 12, 15, 8, 0, 0, TimeSpan.Zero);
	private const string _ParisZone = "Europe/Paris";

	[Fact]
	public async Task ItShouldPatchTextAndInstantAndRescheduleEveryPublication() {
		var (tenantId, token, postId) = await _SeedScheduledPostAsync();

		using var request =
			new HttpRequestMessage(HttpMethod.Patch, _ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			body = "edited body for the scheduled post",
			scheduledAtLocal = _WinterInstantJson,
			timeZone = _ParisZone,
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var post = await db.Post.AsNoTracking().SingleAsync(
			p => p.Id == Guid.Parse(postId)
		);
		post.Body.Should().Be("edited body for the scheduled post");

		var publications = await (
			from p in db.Publication.AsNoTracking()
			where p.PostId == Guid.Parse(postId)
				&& p.TenantId == tenantId
				&& !p.IsDeleted
			select p
		).ToListAsync();
		publications.Should().HaveCount(2);
		foreach (var publication in publications) {
			new DateTimeOffset(publication.ScheduledAtUtc).Should().Be(
				_WinterInstant
			);
			publication.ScheduledTimeZone.Should().Be(_ParisZone);
			publication.Status.Should().Be(PublicationStatus.Scheduled);
			publication.LastError.Should().BeNull();
			publication.ExternalRecordId.Should().BeNull();
			publication.ExternalUrl.Should().BeNull();
		}

		var audits = await (
			from entry in db.AuditLog.AsNoTracking()
			where entry.TargetId == Guid.Parse(postId)
				&& (entry.Action == AuditActions.PublicationRescheduled
					|| entry.Action == AuditActions.PostUpdated)
			select entry.Action
		).ToListAsync();
		audits.Should().Contain(AuditActions.PostUpdated);
		audits.Should().Contain(AuditActions.PublicationRescheduled);
	}

	[Fact]
	public async Task ItShouldClearLastErrorAndExternalRefsOnReschedule() {
		var (tenantId, token, postId) = await _SeedScheduledPostAsync();

		// Give the rows a failed-looking state to prove reschedule cleans them up.
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await db.Publication
			.Where(p => p.PostId == Guid.Parse(postId)
				&& p.TenantId == tenantId)
			.ExecuteUpdateAsync(s => s
				.SetProperty(p => p.LastError, "provider said no")
				.SetProperty(
					p => p.ExternalRecordId,
					(string?)"at://stale/record"
				)
				.SetProperty(
					p => p.ExternalUrl,
					(string?)"https://bsky.app/profile/x/post/stale"
				));

		using var request =
			new HttpRequestMessage(HttpMethod.Patch, _ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			scheduledAtLocal = _WinterInstantJson,
			timeZone = _ParisZone,
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		await using var verifyScope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var verifyDb =
			verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
		var publications = await (
			from p in verifyDb.Publication.AsNoTracking()
			where p.PostId == Guid.Parse(postId)
				&& p.TenantId == tenantId
				&& !p.IsDeleted
			select p
		).ToListAsync();
		publications.Should().NotBeEmpty();
		publications.Should().OnlyContain(p => p.LastError == null);
		publications.Should().OnlyContain(p => p.ExternalRecordId == null);
		publications.Should().OnlyContain(p => p.ExternalUrl == null);
	}

	[Fact]
	public async Task ItShouldPatchTextOnlyWithoutTouchingTheSchedule() {
		var (tenantId, token, postId) = await _SeedScheduledPostAsync();

		await using var beforeScope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var beforeDb =
			beforeScope.ServiceProvider.GetRequiredService<AppDbContext>();
		var before = await (
			from p in beforeDb.Publication.AsNoTracking()
			where p.PostId == Guid.Parse(postId) && p.TenantId == tenantId
			select new { p.ScheduledAtUtc, p.ScheduledTimeZone }
		).ToListAsync();
		before.Should().NotBeEmpty();

		using var request =
			new HttpRequestMessage(HttpMethod.Patch, _ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			body = "text only edit",
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		await using var afterScope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var afterDb =
			afterScope.ServiceProvider.GetRequiredService<AppDbContext>();
		var publications = await (
			from p in afterDb.Publication.AsNoTracking()
			where p.PostId == Guid.Parse(postId) && p.TenantId == tenantId
			select p
		).ToListAsync();
		publications
			.Select(p => new { p.ScheduledAtUtc, p.ScheduledTimeZone })
			.Should().BeEquivalentTo(before);
	}

	[Fact]
	public async Task ItShouldRefuseTheWholeEditWhileAnyPublicationIsInProgress() {
		var (tenantId, token, postId) = await _SeedScheduledPostAsync();

		// One row is mid-flight (InProgress): the handler's InProgress gate must
		// refuse the edit. Seeded as a tracked insert (the #1446 guard permits
		// Status on Added rows; only raw/unstamped Status UPDATEs are rejected).
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var inProgress = await db.Publication
			.AsNoTracking()
			.Where(p => p.PostId == Guid.Parse(postId)
				&& p.TenantId == tenantId)
			.OrderBy(p => p.Id)
			.FirstAsync();

		// Distinct account so the InProgress row satisfies ux_publications_post_account.
		var inFlightAccount = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = "did:plc:" + Guid.NewGuid().ToString("N"),
			DisplayHandle = "@edit.inflight." + Guid.NewGuid().ToString("N")[..5]
				+ ".bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.SocialAccount.Add(inFlightAccount);
		await db.SaveChangesAsync();

		db.Publication.Add(new Publication {
			TenantId = tenantId,
			PostId = inProgress.PostId,
			SocialAccountId = inFlightAccount.GetRequiredId(),
			Status = PublicationStatus.InProgress,
			ScheduledAtUtc = inProgress.ScheduledAtUtc,
			ScheduledTimeZone = inProgress.ScheduledTimeZone,
			IdempotencyKey = "in-progress-seed",
		});
		await db.SaveChangesAsync();

		using var request =
			new HttpRequestMessage(HttpMethod.Patch, _ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			body = "should never be applied",
			scheduledAtLocal = _WinterInstantJson,
			timeZone = _ParisZone,
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Conflict);
		var problem =
			await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("publication-schedule-in-progress");
		problem.Detail.Should().NotBeNullOrWhiteSpace();

		// The refusal covers the TEXT too: nothing may change.
		await using var verifyScope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var verifyDb =
			verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
		var post = await verifyDb.Post.AsNoTracking().SingleAsync(
			p => p.Id == Guid.Parse(postId)
		);
		post.Body.Should().Be("original scheduled body");
	}

	[Fact]
	public async Task ItShouldReturn422WhenTimeZoneIsUnknown() {
		var (tenantId, token, postId) = await _SeedScheduledPostAsync();

		using var request =
			new HttpRequestMessage(HttpMethod.Patch, _ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			scheduledAtLocal = _WinterInstantJson,
			timeZone = "Mars/Olympus_Mons",
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem =
			await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		// Validator-originated keys carry the C# property name (shared
		// ReqBodyValidationFilter behavior); service-originated keys are camelCase.
		problem.Errors.Should().ContainKey("TimeZone");
	}

	[Fact]
	public async Task ItShouldReturn422WhenInstantIsInThePastBeyondDrift() {
		var (tenantId, token, postId) = await _SeedScheduledPostAsync();

		using var request =
			new HttpRequestMessage(HttpMethod.Patch, _ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			scheduledAtLocal = "2001-01-01T12:00:00Z",
			timeZone = _ParisZone,
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem =
			await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("scheduledAtLocal");
	}

	[Fact]
	public async Task ItShouldReturn403WithoutPostsPublishPermission() {
		var tenantId = await _GetAcmeIdAsync();
		var postId = await _CreateScheduledPostAsync(tenantId);

		var userToken = await _AuthClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		using var request =
			new HttpRequestMessage(HttpMethod.Patch, _ScheduleUrl(postId))
				.WithSessionToken(userToken)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new { body = "no permission" });

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturn404ForUnknownAndCrossTenantPostIds() {
		var (acmeTenantId, acmeToken, postId) =
			await _SeedScheduledPostAsync();
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var techStartId = await TenantTestHelper.GetTenantIdByNameAsync(
			_Http,
			staffToken,
			SeedConstants.Tenants.TechStartName
		);

		using var unknownRequest =
			new HttpRequestMessage(
				HttpMethod.Patch,
				_ScheduleUrl(Guid.NewGuid().ToString())
			)
				.WithSessionToken(acmeToken)
				.WithTenantId(acmeTenantId);
		unknownRequest.Content = JsonContent.Create(new { body = "x" });
		using var unknownResponse = await _Http.SendAsync(unknownRequest);
		unknownResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);

		var techStartToken = await _AuthClient.LoginAsync(
			TestConstants.TechStartAdminEmail,
			TestConstants.SeedPassword
		);
		using var foreignRequest =
			new HttpRequestMessage(HttpMethod.Patch, _ScheduleUrl(postId))
				.WithSessionToken(techStartToken)
				.WithTenantId(techStartId);
		foreignRequest.Content = JsonContent.Create(new { body = "x" });
		using var foreignResponse = await _Http.SendAsync(foreignRequest);
		foreignResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturn400WhenNoFieldsAreProvided() {
		var (tenantId, token, postId) = await _SeedScheduledPostAsync();

		using var request =
			new HttpRequestMessage(HttpMethod.Patch, _ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new { });

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	private async Task<(Guid TenantId, string Token, string PostId)>
	_SeedScheduledPostAsync() {
		var tenantId = await _GetAcmeIdAsync();
		var token = await _AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var postId = await _CreateScheduledPostAsync(tenantId);
		return (tenantId, token, postId);
	}

	/// <summary>
	/// Seeds an Acme post bound to two Scheduled publications (future instants) and
	/// returns the persisted post id as a string for URL building.
	/// </summary>
	private async Task<string> _CreateScheduledPostAsync(Guid tenantId) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var author = await db.User.AsNoTracking().SingleAsync(
			u => u.Email == TestConstants.AcmeAdminEmail
		);

		var post = new Modules.Posts.Entities.Post {
			TenantId = tenantId,
			Body = "original scheduled body",
			CreatedByUserId = author.GetRequiredId(),
		};
		db.Post.Add(post);
		var firstAccount = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = "did:plc:" + Guid.NewGuid().ToString("N"),
			DisplayHandle = "@edit.a." + Guid.NewGuid().ToString("N")[..5]
				+ ".bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		var secondAccount = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = "did:plc:" + Guid.NewGuid().ToString("N"),
			DisplayHandle = "@edit.b." + Guid.NewGuid().ToString("N")[..5]
				+ ".bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.SocialAccount.AddRange(firstAccount, secondAccount);
		await db.SaveChangesAsync();

		var accounts = new[] { firstAccount, secondAccount };
		foreach (var account in accounts) {
			db.Publication.Add(new Publication {
				TenantId = tenantId,
				PostId = post.GetRequiredId(),
				SocialAccountId = account.GetRequiredId(),
				Status = PublicationStatus.Scheduled,
				ScheduledAtUtc = DateTime.UtcNow.AddDays(30),
				ScheduledTimeZone = _ParisZone,
				IdempotencyKey = "pending",
			});
		}
		await db.SaveChangesAsync();

		return post.GetRequiredId().ToString();
	}

	private async Task<Guid> _GetAcmeIdAsync() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_Http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
	}
}
