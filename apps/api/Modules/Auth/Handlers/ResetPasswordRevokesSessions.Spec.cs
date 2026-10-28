using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

using AppRoutes = PublyApp.Api.Lib.Routes.Routes;

namespace PublyApp.Api.Modules.Auth.Handlers;

/// <summary>
/// #1498: a completed password reset is a credential change, so every session
/// issued under the old password must stop authenticating. Clearing the
/// browser cookie is not enough — the rows live server-side until they expire.
/// </summary>
public sealed class ResetPasswordRevokesSessionsSpec
	: IClassFixture<ApiFixture> {
	private const string _NewPassword = "Correct horse battery 42";

	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;
	private readonly ApiFixture _Fixture;

	public ResetPasswordRevokesSessionsSpec(
		ApiFixture fixture
	) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	/// <summary>
	/// A verified, active user with no tenant account — enough to log in and
	/// hold a session, which is all this spec needs.
	/// </summary>
	private async Task<string> _CreateVerifiedUserAsync() {
		var email = $"reset-{Guid.NewGuid():N}@example.com";

		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(
				TestConstants.SeedPassword
			),
			FirstName = "Reset",
			LastName = "Subject",
			IsVerified = true,
			Status = UserStatus.Active,
		};

		_ = dbContext.User.Add(user);
		_ = await dbContext.SaveChangesAsync();

		return email;
	}

	private async Task<string> _RequestResetTokenAsync(string email) {
		using var response = await this._Http.PostAsJsonAsync(
			AppRoutes.Auth.RequestPasswordReset,
			new { email }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var token = await dbContext.User
			.AsNoTracking()
			.Where(user => user.Email == email)
			.Select(user => user.PasswordResetToken)
			.FirstAsync();

		if (token is null) {
			throw new InvalidOperationException(
				"password reset token was not issued"
			);
		}

		return token;
	}

	private async Task<HttpStatusCode> _ResetPasswordAsync(
		string email,
		string resetToken
	) {
		using var response = await this._Http.PostAsJsonAsync(
			AppRoutes.Auth.ResetPassword,
			new {
				id = CryptoUtils.EncryptString(email),
				token = resetToken,
				newPassword = ResetPasswordRevokesSessionsSpec._NewPassword,
				confirmPassword = ResetPasswordRevokesSessionsSpec._NewPassword,
			}
		);

		return response.StatusCode;
	}

	private async Task _AssertTokenIsDeadAsync(string sessionToken) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			AppRoutes.Auth.GetUserAuthData
		).WithSessionToken(sessionToken);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldRevokeEverySessionOfTheUserWhenThePasswordIsReset() {
		// Arrange: one user, two independent sessions (two devices).
		var email = await this._CreateVerifiedUserAsync();
		var resetToken = await this._RequestResetTokenAsync(email);

		var firstDeviceToken = await this._AuthClient.LoginAsync(
			email,
			TestConstants.SeedPassword
		);
		var secondDeviceToken = await this._AuthClient.LoginAsync(
			email,
			TestConstants.SeedPassword
		);
		firstDeviceToken.Should().NotBe(secondDeviceToken);

		// Act
		var status = await this._ResetPasswordAsync(email, resetToken);

		// Assert I: the reset itself succeeds.
		status.Should().Be(HttpStatusCode.OK);

		// Assert II: neither pre-change session authenticates any more.
		await this._AssertTokenIsDeadAsync(firstDeviceToken);
		await this._AssertTokenIsDeadAsync(secondDeviceToken);

		// Assert III: the user is not locked out — the new password logs in.
		var freshToken = await this._AuthClient.LoginAsync(
			email,
			ResetPasswordRevokesSessionsSpec._NewPassword
		);
		freshToken.Should().NotBeNullOrEmpty();
	}

	[Fact]
	public async Task
	ItShouldNotRevokeAnotherUsersSessionsWhenThePasswordIsReset() {
		// Arrange: the subject and an unrelated user, each with a session.
		var subjectEmail = await this._CreateVerifiedUserAsync();
		var bystanderEmail = await this._CreateVerifiedUserAsync();

		var resetToken = await this._RequestResetTokenAsync(subjectEmail);

		var subjectToken = await this._AuthClient.LoginAsync(
			subjectEmail,
			TestConstants.SeedPassword
		);
		var bystanderToken = await this._AuthClient.LoginAsync(
			bystanderEmail,
			TestConstants.SeedPassword
		);

		// Act
		var status = await this._ResetPasswordAsync(
			subjectEmail,
			resetToken
		);

		// Assert: the delete is scoped to the user whose password changed.
		status.Should().Be(HttpStatusCode.OK);
		await this._AssertTokenIsDeadAsync(subjectToken);

		using var bystanderRequest = new HttpRequestMessage(
			HttpMethod.Get,
			AppRoutes.Auth.GetUserAuthData
		).WithSessionToken(bystanderToken);

		using var bystanderResponse =
			await this._Http.SendAsync(bystanderRequest);

		bystanderResponse.StatusCode.Should().Be(HttpStatusCode.OK);
	}
}
