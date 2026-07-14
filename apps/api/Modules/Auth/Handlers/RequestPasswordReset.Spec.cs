using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fakes;
using PublyApp.Api.Lib.Testing.Fixtures;
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

	// r5/W5-PROOF: asserting only `200` + `status == "success"` for the
	// non-existent-email case leaves room for a response shaped like
	// `{ "status": "success", "accountExists": false }` to still pass —
	// reopening account enumeration through an extra field the deserializer
	// above never looks at. Compares the full raw response (status code,
	// content type, and exact body bytes) across an existing-verified, an
	// existing-unverified, and a non-existent email so any distinguishing
	// field — known or not yet invented — fails this test.
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

		var verifiedBody = await verifiedResponse.Content.ReadAsStringAsync();
		var unverifiedBody = await unverifiedResponse.Content.ReadAsStringAsync();
		var nonExistentBody = await nonExistentResponse.Content.ReadAsStringAsync();

		unverifiedBody.Should().Be(verifiedBody);
		nonExistentBody.Should().Be(verifiedBody);
	}

	// r5/W5-PROOF: nothing previously asserted that the reset email was ever
	// actually sent — "token persisted but no email ever sent" is exactly the
	// bug this whole forgot-password chain exists to prevent, and it would
	// pass every other assertion in this file silently.
	[Fact]
	public async Task
	ItShouldSendTheResetEmailWithThePersistedTokenForAVerifiedUserOnly() {
		var fakeEmailSender = _fixture.GetFakeEmailSender();
		fakeEmailSender.Clear();

		var unverifiedEmail = await CreateUnverifiedUserAsync();
		var nonExistentEmail = $"nonexistent-{Guid.NewGuid():N}@example.com";

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

		var sentEmail = await WaitForSingleEmailAsync(
			fakeEmailSender,
			TestConstants.StaffAdminEmail
		);
		sentEmail.Should().NotBeNull();
		Assert.NotNull(sentEmail);

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

		sentEmail.HtmlBody.Should().Contain(user.PasswordResetToken);

		// Give any (incorrect) fire-and-forget send for the unverified/
		// non-existent cases a moment to land before asserting their absence.
		await Task.Delay(200);
		fakeEmailSender.SentEmails
			.Should().NotContain(e => e.To == unverifiedEmail);
		fakeEmailSender.SentEmails
			.Should().NotContain(e => e.To == nonExistentEmail);
	}

	private static async Task<EmailRequest?> WaitForSingleEmailAsync(
		FakeEmailSender fakeEmailSender,
		string email
	) {
		const int maxAttempts = 10;

		for (var attempt = 0; attempt < maxAttempts; attempt++) {
			var sentEmail = fakeEmailSender.SentEmails
				.SingleOrDefault(x => x.To == email);

			if (sentEmail is not null) {
				return sentEmail;
			}

			await Task.Delay(100);
		}

		return null;
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
