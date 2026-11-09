
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
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Handlers;

public sealed class PasswordLoginSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _Http;

	private readonly ApiFixture _Fixture;

	public PasswordLoginSpec(
		ApiFixture fixture
	) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
	}

	private async Task<List<AuditLog>> _SignInEventsAsync(
		string action,
		string? emailContains = null
	) {
		using var scope =
			this._Fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var query =
			from auditLog in dbContext.AuditLog
				.AsNoTracking()
			where auditLog.Action == action
				&& (
					emailContains == null
					|| (
						auditLog.Details != null
						&& auditLog.Details.Contains(emailContains)
					)
				)
			orderby auditLog.CreatedAt descending
			select auditLog;

		return await query.ToListAsync();
	}

	[Fact]
	public async Task
	ItShouldReturnSessionTokenWithValidCredentials() {
		var loginRequest = new {
			email = TestConstants.StaffAdminEmail,
			password = TestConstants.SeedPassword
		};

		using var response = await this._Http.PostAsJsonAsync(
			Routes.Auth.Login,
			loginRequest
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<LoginResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SessionToken.Should().NotBeNullOrEmpty();
		result.UserId.Should().NotBeEmpty();
	}

	[Fact]
	public async Task
	ItShouldReturnSessionTokenWithMixedCaseEmail() {
		var mixedCaseEmail = TestConstants.StaffAdminEmail
			.Replace("staff", "StAfF", StringComparison.Ordinal)
			.Replace("admin", "AdMiN", StringComparison.Ordinal)
			.Replace("example", "ExAmPlE", StringComparison.Ordinal);

		var loginRequest = new {
			email = mixedCaseEmail,
			password = TestConstants.SeedPassword
		};

		using var response = await this._Http.PostAsJsonAsync(
			Routes.Auth.Login,
			loginRequest
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<LoginResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SessionToken.Should().NotBeNullOrEmpty();
		result.UserId.Should().NotBeEmpty();
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWithInvalidPassword() {
		var loginRequest = new {
			email = TestConstants.StaffAdminEmail,
			password = "wrong-password-at-least-6-chars"
		};

		using var response = await this._Http.PostAsJsonAsync(
			Routes.Auth.Login,
			loginRequest
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestForNonexistentUser() {
		var loginRequest = new {
			email = "nonexistent@example.com",
			password = "any-password-at-least-6"
		};

		using var response = await this._Http.PostAsJsonAsync(
			Routes.Auth.Login,
			loginRequest
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldWriteOneSucceededEventOnSuccessfulLogin() {
		var before =
			(await this._SignInEventsAsync(AuditActions.LoginSucceeded)).Count;
		var staffUserId =
			await AuditLogTestHelper.GetUserIdByEmailAsync(
				this._Fixture.Factory,
				TestConstants.StaffAdminEmail
			);

		using var response = await this._Http.PostAsJsonAsync(
			Routes.Auth.Login,
			new {
				email = TestConstants.StaffAdminEmail,
				password = TestConstants.SeedPassword,
			}
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var events =
			await this._SignInEventsAsync(AuditActions.LoginSucceeded);
		events.Should().HaveCount(before + 1);
		events[0].UserId.Should().Be(staffUserId);
	}

	[Fact]
	public async Task
		ItShouldWriteOneClassifiedEventForAnUnknownAccount() {
		var email = $"ghost-{Guid.NewGuid():N}@example.com";
		const string password = "not-a-real-password-123";

		using var response = await this._Http.PostAsJsonAsync(
			Routes.Auth.Login,
			new { email, password }
		);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var events = await this._SignInEventsAsync(
			AuditActions.LoginFailed,
			email
		);
		events.Should().HaveCount(1);
		// No account matched the email, so the event records the attempt
		// without inventing an actor.
		events[0].UserId.Should().BeNull();
		events[0].Details.Should()
			.Contain(SignInFailureReasons.UnknownAccount);
		events[0].Details.Should().NotContain(password);
		events[0].Details.Should()
			.NotContainEquivalentOf("password");
	}

	[Fact]
	public async Task
		ItShouldWriteOneClassifiedEventForAWrongPassword() {
		const string password = "wrong-password-at-least-6";

		using var response = await this._Http.PostAsJsonAsync(
			Routes.Auth.Login,
			new {
				email = TestConstants.StaffAdminEmail,
				password,
			}
		);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var events = await this._SignInEventsAsync(
			AuditActions.LoginFailed,
			TestConstants.StaffAdminEmail
		);
		events.Should().NotBeEmpty();
		events[0].Details.Should()
			.Contain(SignInFailureReasons.WrongPassword);
		events[0].Details.Should().NotContain(password);
		events[0].UserId.Should()
			.Be(
				await AuditLogTestHelper.GetUserIdByEmailAsync(
					this._Fixture.Factory,
					TestConstants.StaffAdminEmail
				)
			);
	}

	[Fact]
	public async Task
		ItShouldWriteOneClassifiedEventForASuspendedAccount() {
		var email = $"suspended-{Guid.NewGuid():N}@example.com";
		await StaffUserTestHelper.SeedStaffUserAsync(
			this._Fixture,
			email,
			status: UserStatus.Suspended
		);

		using var response = await this._Http.PostAsJsonAsync(
			Routes.Auth.Login,
			new {
				email,
				password = TestConstants.SeedPassword,
			}
		);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var events = await this._SignInEventsAsync(
			AuditActions.LoginFailed,
			email
		);
		events.Should().HaveCount(1);
		events[0].Details.Should()
			.Contain(SignInFailureReasons.Suspended);
	}

	[Fact]
	public async Task
		ItShouldNotRevealWhetherTheAccountExists() {
		var unknownEmail = $"nobody-{Guid.NewGuid():N}@example.com";

		using var unknownResponse = await this._Http.PostAsJsonAsync(
			Routes.Auth.Login,
			new {
				email = unknownEmail,
				password = "any-password-at-least-6",
			}
		);
		using var wrongPasswordResponse =
			await this._Http.PostAsJsonAsync(
				Routes.Auth.Login,
				new {
					email = TestConstants.StaffAdminEmail,
					password = "wrong-password-at-least-6",
				}
			);

		unknownResponse.StatusCode.Should()
			.Be(wrongPasswordResponse.StatusCode);

		var unknownBody =
			await unknownResponse.Content.ReadAsStringAsync();
		var wrongPasswordBody =
			await wrongPasswordResponse.Content.ReadAsStringAsync();

		// Same detail, same translation key: an attempt cannot be used to
		// enumerate accounts. (Only the per-request traceId differs.)
		using var unknownProblem = JsonDocument.Parse(unknownBody);
		using var wrongPasswordProblem =
			JsonDocument.Parse(wrongPasswordBody);
		foreach (var field in new[] {
			"type",
			"title",
			"status",
			"detail",
			"instance",
			"translationKey",
		}) {
			unknownProblem.RootElement.GetProperty(field).GetRawText()
				.Should()
				.Be(
					wrongPasswordProblem.RootElement
						.GetProperty(field)
						.GetRawText()
				);
		}
	}

	// Matches PasswordLoginResult in PassWordLogin.cs
	private record LoginResponse(
		Guid UserId,
		string SessionToken,
		DateTime SessionExpiresAt,
		double SessionExpiresInMs
	);
}
