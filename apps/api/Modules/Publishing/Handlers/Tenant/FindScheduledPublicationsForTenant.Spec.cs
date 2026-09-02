using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

// Integration spec for the tenant publications list (D3 Task 4). Real ephemeral
// Postgres via ApiFixture. Covers keyset pagination over the schedule window,
// status CSV filtering, window validation, wire snake_case status values, and
// the DST-aware zone-local ISO string.
public sealed class FindScheduledPublicationsForTenantSpec : IClassFixture<
	ApiFixture> {
	private const string FindUrl = "/posts/publications";
	private const string ParisZone = "Europe/Paris";

	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindScheduledPublicationsForTenantSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.Factory.CreateClient(
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

	private async Task<Guid> GetAcmeIdAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<Guid> GetTechStartIdAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.TechStartName
		);
	}

	// Seeds a post + one Scheduled publication at a FIXED future instant so
	// window/order assertions stay deterministic regardless of run time.
	private async Task<(
		Guid PublicationId,
		Guid PostId,
		Guid AccountId
	)> CreateScheduledRowAsync(
		Guid tenantId,
		string body,
		DateTime scheduledAtUtc,
		string zone = ParisZone,
		PublicationStatus seedStatus = PublicationStatus.Scheduled
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var author = await db.User.AsNoTracking().SingleAsync(
			u => u.Email == TestConstants.AcmeAdminEmail
		);

		var post = new Modules.Posts.Entities.Post {
			TenantId = tenantId,
			Body = body,
			CreatedByUserId = author.GetRequiredId(),
		};
		db.Post.Add(post);

		var account = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = "did:plc:" + Guid.NewGuid().ToString("N"),
			DisplayHandle = "@find." + Guid.NewGuid().ToString("N")[..5]
				+ ".bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();

		var publication = new Publication {
			TenantId = tenantId,
			PostId = post.GetRequiredId(),
			SocialAccountId = account.GetRequiredId(),
			Status = seedStatus,
			ScheduledAtUtc = scheduledAtUtc,
			ScheduledTimeZone = zone,
			IdempotencyKey = "pending",
		};
		db.Publication.Add(publication);
		await db.SaveChangesAsync();

		return (
			publication.GetRequiredId(),
			post.GetRequiredId(),
			account.GetRequiredId()
		);
	}

	private static string WindowQuery(string from, string to) {
		return $"?from={from}&to={to}";
	}

	private static async Task<JsonElement> GetJsonAsync(
		HttpResponseMessage response
	) {
		var stream = await response.Content.ReadAsStreamAsync();
		var doc = await JsonDocument.ParseAsync(stream);
		return doc.RootElement.Clone();
	}

	[Fact]
	public async Task ItShouldReturnScheduledRowsInWindowOrderedByInstant() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var first = await CreateScheduledRowAsync(
			tenantId,
			"find queue alpha",
			new DateTime(2099, 6, 1, 10, 0, 0, DateTimeKind.Utc)
		);
		var second = await CreateScheduledRowAsync(
			tenantId,
			"find queue beta",
			new DateTime(2099, 6, 2, 9, 0, 0, DateTimeKind.Utc)
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindUrl + WindowQuery("2099-05-31T00%3A00%3A00Z",
				"2099-07-01T00%3A00%3A00Z")
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var doc = await GetJsonAsync(response);
		var data = doc.GetProperty("data");
		data.ValueKind.Should().Be(JsonValueKind.Array);

		var ids = data.EnumerateArray()
			.Select(row => row.GetProperty("publicationId").GetString())
			.ToList();
		var firstId = first.PublicationId.ToString();
		var secondId = second.PublicationId.ToString();
		ids.Should().Contain(firstId);
		ids.Should().Contain(secondId);
		ids.IndexOf(firstId).Should().BeLessThan(ids.IndexOf(secondId));

		var firstRow = data.EnumerateArray()
			.First(row => row.GetProperty("publicationId").GetString()
				== firstId);
		firstRow.GetProperty("status").GetString().Should().Be("scheduled");
		firstRow.GetProperty("postBodyPreview").GetString().Should()
			.Contain("alpha");
		firstRow.GetProperty("timeZone").GetString().Should().Be(ParisZone);
		firstRow.GetProperty("scheduledAtLocal").GetString().Should()
			.Be("2099-06-01T12:00:00+02:00");
		firstRow.GetProperty("accountDisplayHandle").GetString().Should()
			.StartWith("@find.");
		firstRow.TryGetProperty("nextCursor", out _).Should().BeFalse();
		doc.TryGetProperty("nextCursor", out var nextCursor)
			.Should().BeTrue();
	}

	[Fact]
	public async Task ItShouldFilterByStatusCsv() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		_ = await CreateScheduledRowAsync(
			tenantId,
			"filter csv target",
			new DateTime(2099, 6, 3, 8, 0, 0, DateTimeKind.Utc)
		);

		var failing = await CreateScheduledRowAsync(
			tenantId,
			"filter csv failed target",
			new DateTime(2099, 6, 4, 8, 0, 0, DateTimeKind.Utc),
			seedStatus: PublicationStatus.Failed
		);

		// LastError mirrors the failed-state cause the handler reports. Seeded via
		// a tracked load + modify (a non-Status property), which the #1446 guard
		// permits — only raw/unstamped Status writes are rejected.
		await using var errScope = _fixture.Factory.Services.CreateAsyncScope();
		var errDb = errScope.ServiceProvider.GetRequiredService<AppDbContext>();
		var failedRow = await errDb.Publication.SingleAsync(
			p => p.Id == failing.PublicationId
		);
		failedRow.LastError = "provider rejected the media";
		await errDb.SaveChangesAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-05-31T00%3A00%3A00Z"
			+ "&to=2099-07-01T00%3A00%3A00Z&status=failed,published"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var doc = await GetJsonAsync(response);
		var statuses = doc.GetProperty("data")
			.EnumerateArray()
			.Select(row => row.GetProperty("status").GetString())
			.ToList();
		statuses.Should().NotContain("scheduled");
		statuses.Should().Contain("failed");
		statuses.Where(s => s == "failed").Should().OnlyHaveUniqueItems();
	}

	[Fact]
	public async Task ItShouldPaginateByKeysetAcrossPages() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		for (var index = 0; index < 3; index++) {
			_ = await CreateScheduledRowAsync(
				tenantId,
				$"pagination row {index}",
				new DateTime(2099, 6, 10 + index, 6, 0, 0, DateTimeKind.Utc)
			);
		}

		using var pageOneRequest = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-05-31T00%3A00%3A00Z"
			+ "&to=2099-07-01T00%3A00%3A00Z&limit=2"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var pageOneResponse = await _http.SendAsync(pageOneRequest);

		pageOneResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		var pageOne = await GetJsonAsync(pageOneResponse);
		pageOne.GetProperty("data").GetArrayLength().Should().Be(2);
		var nextCursor = pageOne.GetProperty("nextCursor").GetString();
		nextCursor.Should().NotBeNullOrEmpty();

		using var pageTwoRequest = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-05-31T00%3A00%3A00Z"
			+ $"&to=2099-07-01T00%3A00%3A00Z&limit=2&cursor="
			+ Uri.EscapeDataString(nextCursor!)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var pageTwoResponse = await _http.SendAsync(pageTwoRequest);

		pageTwoResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		var pageTwo = await GetJsonAsync(pageTwoResponse);

		var pageOneIds = pageOne.GetProperty("data")
			.EnumerateArray()
			.Select(row => row.GetProperty("publicationId").GetString())
			.ToList();
		var pageTwoIds = pageTwo.GetProperty("data")
			.EnumerateArray()
			.Select(row => row.GetProperty("publicationId").GetString())
			.ToList();

		pageTwoIds.Should().HaveCountGreaterThanOrEqualTo(1);
		pageTwoIds.Should().NotIntersectWith(pageOneIds);
	}

	[Fact]
	public async Task ItShouldReturnInvalidWindowProblemWhenFromAfterTo() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-07-02T00%3A00%3A00Z"
			+ "&to=2099-07-01T00%3A00%3A00Z"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem!.Errors.Should().ContainKey("publication-window-invalid");
	}

	[Fact]
	public async Task ItShouldReturnTooWideProblemWhenWindowExceeds32Days() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-06-01T00%3A00%3A00Z"
			+ "&to=2099-08-01T00%3A00%3A00Z"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem!.Errors.Should().ContainKey("publication-window-too-wide");
	}

	[Fact]
	public async Task ItShouldAllowA31DayMonthAcrossADaylightSavingFallback() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-09-30T22%3A00%3A00Z"
				+ "&to=2099-10-31T22%3A59%3A59Z"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task ItShouldReturn400WhenCursorIsUnknown() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		_ = await CreateScheduledRowAsync(
			tenantId,
			"cursor probe",
			new DateTime(2099, 6, 20, 8, 0, 0, DateTimeKind.Utc)
		);

		var bogusCursor = Uri.EscapeDataString(Convert.ToBase64String(
			"not-a-real-cursor|00000000-0000-0000-0000-000000000000"u8
				.ToArray()
		));

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-05-31T00%3A00%3A00Z"
			+ $"&to=2099-07-01T00%3A00%3A00Z&cursor={bogusCursor}"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturn422WhenStatusCsvIsUnknown() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-05-31T00%3A00%3A00Z"
			+ "&to=2099-07-01T00%3A00%3A00Z&status=bogus_status"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldReturn403WithoutViewPermission() {
		var tenantId = await GetAcmeIdAsync();
		var userToken = await _authClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-05-31T00%3A00%3A00Z"
			+ "&to=2099-07-01T00%3A00%3A00Z"
		)
			.WithSessionToken(userToken)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturn401WithoutSessionToken() {
		var tenantId = await GetAcmeIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-05-31T00%3A00%3A00Z"
			+ "&to=2099-07-01T00%3A00%3A00Z"
		)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnOnlyCurrentTenantRows() {
		var acmeId = await GetAcmeIdAsync();
		var techStartId = await GetTechStartIdAsync();
		var acmeToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var techStartToken = await _authClient.LoginAsync(
			TestConstants.TechStartAdminEmail,
			TestConstants.SeedPassword
		);

		_ = await CreateScheduledRowAsync(
			acmeId,
			"acme only row",
			new DateTime(2099, 6, 25, 7, 0, 0, DateTimeKind.Utc)
		);
		_ = await CreateScheduledRowAsync(
			techStartId,
			"techstart private row",
			new DateTime(2099, 6, 26, 7, 0, 0, DateTimeKind.Utc)
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-05-31T00%3A00%3A00Z"
			+ "&to=2099-07-01T00%3A00%3A00Z"
		)
			.WithSessionToken(acmeToken)
			.WithTenantId(acmeId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var doc = await GetJsonAsync(response);
		var previews = doc.GetProperty("data")
			.EnumerateArray()
			.Select(row => row.GetProperty("postBodyPreview").GetString())
			.ToList();
		previews.Should().NotContain(p => p!.Contains("techstart"));
	}

	[Fact]
	public async Task ItShouldReturn422WhenFromIsMissingOrToIsMalformed() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var missingRequest = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?to=2099-07-01T00%3A00%3A00Z"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var missingResponse = await _http.SendAsync(missingRequest);

		missingResponse.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		using var malformedRequest = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-06-01T00%3A00%3A00Z&to=not-a-date"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var malformedResponse = await _http.SendAsync(malformedRequest);

		malformedResponse.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldExcludeDeletedAndCancelledPublications() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var seeded = await CreateScheduledRowAsync(
			tenantId,
			"deleted row probe",
			new DateTime(2099, 6, 28, 8, 0, 0, DateTimeKind.Utc)
		);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		_ = await db.Publication
			.Where(p => p.Id == seeded.PublicationId)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(p => p.IsDeleted, true)
				.SetProperty(p => p.DeletedAt, DateTime.UtcNow));
		await using var verifyScope =
			_fixture.Factory.Services.CreateAsyncScope();
		var verifyDb =
			verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
		var softDeletedCount = await verifyDb.Publication.IgnoreQueryFilters()
			.CountAsync(p => p.Id == seeded.PublicationId && p.IsDeleted);
		softDeletedCount.Should().Be(1);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-05-31T00%3A00%3A00Z"
			+ "&to=2099-07-01T00%3A00%3A00Z"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var doc = await GetJsonAsync(response);
		var previews = doc.GetProperty("data")
			.EnumerateArray()
			.Select(row => row.GetProperty("postBodyPreview").GetString())
			.ToList();
		previews.Should().NotContain(p => p!.Contains("deleted row probe"));
	}

	[Fact]
	public async Task ItShouldApplyDstAwareZoneOffsetInScheduledAtLocal() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		// Winter instant in Europe/Paris: offset +01:00 (vs summer +02:00).
		_ = await CreateScheduledRowAsync(
			tenantId,
			"winter dst probe",
			new DateTime(2099, 12, 15, 8, 0, 0, DateTimeKind.Utc)
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-12-01T00%3A00%3A00Z"
			+ "&to=2100-01-01T00%3A00%3A00Z"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var doc = await GetJsonAsync(response);
		var local = doc.GetProperty("data")
			.EnumerateArray()
			.Select(row => (
				Preview: row.GetProperty("postBodyPreview").GetString(),
				LocalIso: row.GetProperty("scheduledAtLocal").GetString()
			))
			.First(row => row.Preview!.Contains("winter dst probe"))
			.LocalIso;
		local.Should().Be("2099-12-15T09:00:00+01:00");
	}

	[Fact]
	public async Task ItShouldReturnAnEmptyPageWhenTheWindowMatchesNoRows() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		// Deliberately FAR future window: no seeded spec row lands there, so
		// this exercises the "empty window is a normal page, not an error" case
		// (round-2 finding: the keyset tail read rows[^1] unconditionally and
		// 500'd on an empty result set).
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2100-03-01T00%3A00%3A00Z"
			+ "&to=2100-03-31T00%3A00%3A00Z"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var doc = await GetJsonAsync(response);
		doc.GetProperty("data").GetArrayLength().Should().Be(0);
		doc.GetProperty("nextCursor").ValueKind.Should()
			.Be(JsonValueKind.Null);
	}

	[Fact]
	public async Task ItShouldRejectALimitAboveThePaginationMax() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		// Round-2 finding: removing the base CursorPaginatedQuery lost the
		// interval check, so limit=999 was accepted silently (Take(1000)).
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-05-31T00%3A00%3A00Z"
			+ "&to=2099-07-01T00%3A00%3A00Z&limit=999"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem!.Errors.Should().ContainKey("limit");
	}

	[Fact]
	public async Task ItShouldRejectALimitBelowTheMinimum() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		// Round-2 finding: with the interval check gone, limit=0 sailed
		// through and silently returned an (at most) 1-row page instead of
		// a 422 naming the cause.
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-05-31T00%3A00%3A00Z"
			+ "&to=2099-07-01T00%3A00%3A00Z&limit=0"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem!.Errors.Should().ContainKey("limit");
	}

	[Fact]
	public async Task ItShouldRejectANonNumericLimitWithAReadableCause() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		// Rule of the house: an unanalysable input must fail LOUDLY with a
		// named cause. Today GetLimit() throws inside the handler and the
		// generic middleware turns it into a 500 "Internal server error".
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-05-31T00%3A00%3A00Z"
			+ "&to=2099-07-01T00%3A00%3A00Z&limit=abc"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem!.Errors.Should().ContainKey("limit");
	}

	[Fact]
	public async Task ItShouldReturn400ForCursorWithForgedTimestamp() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var storedInstant = new DateTime(
			2099, 6, 15, 8, 0, 0, DateTimeKind.Utc
		);
		var seeded = await CreateScheduledRowAsync(
			tenantId,
			"forged timestamp cursor target",
			storedInstant
		);
		var forgedInstant = storedInstant.AddHours(-1);
		var cursor = Uri.EscapeDataString(Convert.ToBase64String(
			System.Text.Encoding.UTF8.GetBytes(
				$"{forgedInstant:O}|{seeded.PublicationId}"
			)
		));

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-05-31T00%3A00%3A00Z"
			+ $"&to=2099-07-01T00%3A00%3A00Z&cursor={cursor}"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturn400ForCursorOutsideWindow() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var seeded = await CreateScheduledRowAsync(
			tenantId,
			"cross-window cursor target",
			new DateTime(2099, 6, 15, 8, 0, 0, DateTimeKind.Utc)
		);

		// Build a valid cursor for the seeded row but query a DIFFERENT
		// window that does not include it.
		var cursor = Uri.EscapeDataString(Convert.ToBase64String(
			System.Text.Encoding.UTF8.GetBytes(
				$"{new DateTime(2099, 6, 15, 8, 0, 0, DateTimeKind.Utc):O}|{seeded.PublicationId}"
			)
		));

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-07-01T00%3A00%3A00Z"
			+ $"&to=2099-08-01T00%3A00%3A00Z&cursor={cursor}"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturn400ForCursorWithExcludedStatus() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var seeded = await CreateScheduledRowAsync(
			tenantId,
			"cross-status cursor target",
			new DateTime(2099, 6, 18, 8, 0, 0, DateTimeKind.Utc),
			seedStatus: PublicationStatus.Failed
		);

		// Build a valid cursor for the seeded row but query with a status
		// filter that excludes the row's actual status.
		var cursor = Uri.EscapeDataString(Convert.ToBase64String(
			System.Text.Encoding.UTF8.GetBytes(
				$"{new DateTime(2099, 6, 18, 8, 0, 0, DateTimeKind.Utc):O}|{seeded.PublicationId}"
			)
		));

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-05-31T00%3A00%3A00Z"
			+ $"&to=2099-07-01T00%3A00%3A00Z&status=scheduled&cursor={cursor}"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturn400ForCursorPointingToDeletedPublication() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var seeded = await CreateScheduledRowAsync(
			tenantId,
			"deleted cursor target",
			new DateTime(2099, 6, 22, 8, 0, 0, DateTimeKind.Utc)
		);

		// Soft-delete the seeded publication.
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		_ = await db.Publication
			.Where(p => p.Id == seeded.PublicationId)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(p => p.IsDeleted, true)
				.SetProperty(p => p.DeletedAt, DateTime.UtcNow));

		// Build a valid cursor for the deleted row.
		var cursor = Uri.EscapeDataString(Convert.ToBase64String(
			System.Text.Encoding.UTF8.GetBytes(
				$"{new DateTime(2099, 6, 22, 8, 0, 0, DateTimeKind.Utc):O}|{seeded.PublicationId}"
			)
		));

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{FindUrl}?from=2099-05-31T00%3A00%3A00Z"
			+ $"&to=2099-07-01T00%3A00%3A00Z&cursor={cursor}"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}
}
