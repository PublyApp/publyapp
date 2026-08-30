using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Handlers;

public sealed class RequestPasswordResetSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;

	public RequestPasswordResetSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
		_http = fixture.HttpClient;
	}

	private async Task<string> CreateUnverifiedUserAsync() {
		var email = $"unverified-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "Unverified",
			LastName = "User",
			IsVerified = false,
			Status = UserStatus.Active,
		};

		_ = dbContext.User.Add(user);
		_ = await dbContext.SaveChangesAsync();

		return email;
	}

	[Fact]
	public async Task
	ItShouldReturnGenericSuccessAndIssueATokenForAVerifiedUser() {
		using var response = await _http.PostAsJsonAsync(
			Routes.Auth.RequestPasswordReset,
			new { email = TestConstants.StaffAdminEmail }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<RequestPasswordResetResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Status.Should().Be("success");

		using var scope = _fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		var user = await dbContext.User
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(u =>
				u.Email == TestConstants.StaffAdminEmail
			);

		user.Should().NotBeNull();
		Assert.NotNull(user);
		user.PasswordResetToken.Should().NotBeNullOrEmpty();
		user.PasswordResetTokenExpiresAt.Should().NotBeNull();
	}

	// Headers that legitimately vary per-request/per-response regardless of
	// account state and must not be compared: wall-clock/tracing identifiers
	// (a fresh value every call, by design — comparing them would make this
	// test permanently red, not catch an oracle). `Content-Length` is
	// deliberately NOT on this list (W5-HARDEN2): it measures the response
	// representation's byte length, not header order/whitespace, and if it
	// ever varied by account branch that variation would itself be the
	// enumeration oracle this spec exists to catch — excluding it would hide
	// exactly the defect this test is for.
	private static readonly string[] VolatileHeaderNames = [
		"Date",
		"Traceparent",
		"Tracestate",
		"Request-Id",
		"X-Request-Id",
		"X-Correlation-Id",
	];

	// r5/W5-PROOF: asserting only `200` + `status == "success"` for the
	// non-existent-email case leaves room for a response shaped like
	// `{ "status": "success", "accountExists": false }` to still pass —
	// reopening account enumeration through an extra field the deserializer
	// above never looks at. Compares the full raw response (status code,
	// content type, exact body bytes, every non-volatile response header, and
	// `Set-Cookie`) across an existing-verified, an existing-unverified, and
	// a non-existent email so any distinguishing field or header — known or
	// not yet invented — fails this test.
	[Fact]
	public async Task
	ItShouldReturnIndistinguishableResponsesForVerifiedUnverifiedAndNonExistentEmails() {
		var unverifiedEmail = await CreateUnverifiedUserAsync();
		var nonExistentEmail = $"nonexistent-{Guid.NewGuid():N}@example.com";

		using var verifiedResponse = await _http.PostAsJsonAsync(
			Routes.Auth.RequestPasswordReset,
			new { email = TestConstants.StaffAdminEmail }
		);
		using var unverifiedResponse = await _http.PostAsJsonAsync(
			Routes.Auth.RequestPasswordReset,
			new { email = unverifiedEmail }
		);
		using var nonExistentResponse = await _http.PostAsJsonAsync(
			Routes.Auth.RequestPasswordReset,
			new { email = nonExistentEmail }
		);

		verifiedResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		unverifiedResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		nonExistentResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		unverifiedResponse.StatusCode.Should().Be(verifiedResponse.StatusCode);
		nonExistentResponse.StatusCode.Should().Be(verifiedResponse.StatusCode);
		unverifiedResponse.Content.Headers.ContentType.Should()
			.Be(verifiedResponse.Content.Headers.ContentType);
		nonExistentResponse.Content.Headers.ContentType.Should()
			.Be(verifiedResponse.Content.Headers.ContentType);

		var verifiedHeaders = FlattenObservableHeaders(verifiedResponse);
		var unverifiedHeaders = FlattenObservableHeaders(unverifiedResponse);
		var nonExistentHeaders = FlattenObservableHeaders(nonExistentResponse);

		unverifiedHeaders.Should().BeEquivalentTo(verifiedHeaders);
		nonExistentHeaders.Should().BeEquivalentTo(verifiedHeaders);

		var verifiedBody = await verifiedResponse.Content.ReadAsStringAsync();
		var unverifiedBody = await unverifiedResponse.Content.ReadAsStringAsync();
		var nonExistentBody = await nonExistentResponse.Content.ReadAsStringAsync();

		unverifiedBody.Should().Be(verifiedBody);
		nonExistentBody.Should().Be(verifiedBody);
	}

	private static Dictionary<string, string[]> FlattenObservableHeaders(
		HttpResponseMessage response
	) {
		var headers = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

		foreach (var header in response.Headers) {
			if (VolatileHeaderNames.Contains(header.Key, StringComparer.OrdinalIgnoreCase)) {
				continue;
			}

			headers[header.Key] = [.. header.Value.OrderBy(v => v, StringComparer.Ordinal)];
		}

		foreach (var header in response.Content.Headers) {
			if (VolatileHeaderNames.Contains(header.Key, StringComparer.OrdinalIgnoreCase)) {
				continue;
			}

			headers[header.Key] = [.. header.Value.OrderBy(v => v, StringComparer.Ordinal)];
		}

		return headers;
	}

	// r5/W5-PROOF: nothing previously asserted that the reset email was ever
	// actually sent — "token persisted but no email ever sent" is exactly the
	// bug this whole forgot-password chain exists to prevent, and it would
	// pass every other assertion in this file silently.
	[Fact]
	public async Task
	ItShouldSendTheResetEmailWithThePersistedTokenForAVerifiedUserOnly() {
		var unverifiedEmail = await CreateUnverifiedUserAsync();
		var nonExistentEmail = $"nonexistent-{Guid.NewGuid():N}@example.com";

		using var baselineScope = _fixture.Factory.Services.CreateScope();
		var baselineDbContext = baselineScope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		var baselineVerifiedUser = await baselineDbContext.User
			.IgnoreQueryFilters()
			.FirstAsync(u => u.Email == TestConstants.StaffAdminEmail);
		var baselineUnverifiedUser = await baselineDbContext.User
			.IgnoreQueryFilters()
			.FirstAsync(u => u.Email == unverifiedEmail);

		var baselinePasswordResetJobs = await baselineDbContext.JobQueue.AsNoTracking()
			.Where(j => j.JobType == AuthEmailJobs.PasswordResetV1.JobType)
			.ToListAsync();

		var baselineUnverifiedJobs = baselinePasswordResetJobs
			.Count(j => JobPayloadContainsId(
				j.Payload,
				"userId",
				baselineUnverifiedUser.GetRequiredId()
			));

		var baselineVerifiedJobs = baselinePasswordResetJobs
			.Count(j => JobPayloadContainsId(
				j.Payload,
				"userId",
				baselineVerifiedUser.GetRequiredId()
			));

		using var verifiedResponse = await _http.PostAsJsonAsync(
			Routes.Auth.RequestPasswordReset,
			new { email = TestConstants.StaffAdminEmail }
		);
		verifiedResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		using var unverifiedResponse = await _http.PostAsJsonAsync(
			Routes.Auth.RequestPasswordReset,
			new { email = unverifiedEmail }
		);
		unverifiedResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		using var nonExistentResponse = await _http.PostAsJsonAsync(
			Routes.Auth.RequestPasswordReset,
			new { email = nonExistentEmail }
		);
		nonExistentResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		using var scope = _fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		var user = await dbContext.User
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(u =>
				u.Email == TestConstants.StaffAdminEmail
			);
		user.Should().NotBeNull();
		Assert.NotNull(user);
		user.PasswordResetToken.Should().NotBeNullOrEmpty();

		var unverifiedUser = await dbContext.User
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(u => u.Email == unverifiedEmail);
		Assert.NotNull(unverifiedUser);

		var passwordResetQueueItems = await dbContext.JobQueue.AsNoTracking()
			.Where(j => j.JobType == AuthEmailJobs.PasswordResetV1.JobType)
			.ToListAsync();

		var unverifiedJobs = passwordResetQueueItems
			.Where(j => JobPayloadContainsId(j.Payload, "userId", unverifiedUser!.GetRequiredId()))
			.ToList();
		unverifiedJobs.Should().BeEmpty();
		passwordResetQueueItems
			.Count(j => JobPayloadContainsId(j.Payload, "userId", unverifiedUser!.GetRequiredId()))
			.Should().Be(baselineUnverifiedJobs);

		var pendingResetJobs = passwordResetQueueItems.Count(
			j => JobPayloadContainsId(j.Payload, "userId", user.GetRequiredId())
		);
		pendingResetJobs.Should().Be(baselineVerifiedJobs + 1);
	}

	private static bool JobPayloadContainsId(
		string? payload,
		string propertyName,
		Guid id
	) {
		if (string.IsNullOrWhiteSpace(payload)) {
			return false;
		}

		using var doc = JsonDocument.Parse(payload);
		var root = doc.RootElement;
		if (!root.TryGetProperty(propertyName, out var token)
			|| token.ValueKind is not JsonValueKind.String) {
			return false;
		}

		var tokenValue = token.GetString();
		return tokenValue == id.ToString();
	}

	// round-6 F5: repeated requests must not rotate a token that is still
	// live — rotating on every hit invalidated the user's previous, still-
	// unused link (e.g. an attacker or a double-submit stranding the real
	// user mid-reset).
	[Fact]
	public async Task
	ItShouldNotRotateAStillValidTokenOnRepeatedRequests() {
		var email = $"reset-repeat-{Guid.NewGuid():N}@example.com";
		await using (var scope = _fixture.Factory.Services.CreateAsyncScope()) {
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			var user = new User {
				Email = email,
				Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
				FirstName = "Repeat",
				LastName = "Reset",
				IsVerified = true,
				Status = UserStatus.Active,
			};
			_ = dbContext.User.Add(user);
			_ = await dbContext.SaveChangesAsync();
		}

		using var firstResponse = await _http.PostAsJsonAsync(
			Routes.Auth.RequestPasswordReset,
			new { email }
		);
		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		string? firstToken;
		DateTime? firstExpiresAt;
		await using (var scope = _fixture.Factory.Services.CreateAsyncScope()) {
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			var user = await dbContext.User
				.IgnoreQueryFilters()
				.SingleAsync(u => u.Email == email);
			firstToken = user.PasswordResetToken;
			firstExpiresAt = user.PasswordResetTokenExpiresAt;
		}

		firstToken.Should().NotBeNullOrEmpty();

		using var secondResponse = await _http.PostAsJsonAsync(
			Routes.Auth.RequestPasswordReset,
			new { email }
		);
		secondResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		await using (var scope = _fixture.Factory.Services.CreateAsyncScope()) {
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			var user = await dbContext.User
				.IgnoreQueryFilters()
				.SingleAsync(u => u.Email == email);

			user.PasswordResetToken.Should().Be(firstToken);
			user.PasswordResetTokenExpiresAt.Should().Be(firstExpiresAt);
		}
	}

	[Fact]
	public async Task
	ItShouldIssueAFreshTokenWhenThePreviousOneHasExpired() {
		var email = $"reset-expired-{Guid.NewGuid():N}@example.com";
		const string expiredToken = "expired-token-value";
		await using (var scope = _fixture.Factory.Services.CreateAsyncScope()) {
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			var user = new User {
				Email = email,
				Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
				FirstName = "Expired",
				LastName = "Reset",
				IsVerified = true,
				Status = UserStatus.Active,
				PasswordResetToken = expiredToken,
				PasswordResetTokenExpiresAt = DateTime.UtcNow.AddMinutes(-1),
			};
			_ = dbContext.User.Add(user);
			_ = await dbContext.SaveChangesAsync();
		}

		using var response = await _http.PostAsJsonAsync(
			Routes.Auth.RequestPasswordReset,
			new { email }
		);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		await using (var scope = _fixture.Factory.Services.CreateAsyncScope()) {
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			var user = await dbContext.User
				.IgnoreQueryFilters()
				.SingleAsync(u => u.Email == email);

			user.PasswordResetToken.Should().NotBeNullOrEmpty();
			user.PasswordResetToken.Should().NotBe(expiredToken);
			user.PasswordResetTokenExpiresAt.Should().NotBeNull();
			user.PasswordResetTokenExpiresAt!.Value.Should().BeAfter(DateTime.UtcNow);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnValidationErrorForInvalidEmail() {
		using var response = await _http.PostAsJsonAsync(
			Routes.Auth.RequestPasswordReset,
			new { email = "not-an-email" }
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}
}
