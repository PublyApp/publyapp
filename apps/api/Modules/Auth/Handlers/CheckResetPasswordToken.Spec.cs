using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Handlers;

public sealed class CheckResetPasswordTokenSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;

	public CheckResetPasswordTokenSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
	}

	[Fact]
	public async Task
	ItShouldReturnExpiredTranslationKeyWhenPasswordResetTokenExpired() {
		var user = await _CreateUserAsync(DateTime.UtcNow.AddMinutes(-1));

		using var response = await _CheckAsync(user.Email, user.Token);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("password-reset-token-expired");
	}

	[Fact]
	public async Task
	ItShouldReturnGenericInvalidTranslationKeyWhenPasswordResetIdCannotBeDecrypted() {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var userService = scope.ServiceProvider.GetRequiredService<IUserService>();
		var result = await CheckResetPasswordToken.Handle(
			new CheckResetPasswordTokenQuery {
				Id = "not-valid-encrypted-data",
				Token = $"unused-{Guid.NewGuid():N}"
			},
			userService,
			CancellationToken.None
		);

		var problem = await _ExecuteProblemAsync(result);

		problem.TranslationKey.Should().Be("invalid-password-reset-token");
	}

	[Fact]
	public async Task
	ItShouldReturnGenericInvalidTranslationKeyWhenPasswordResetTokenNotFound() {
		using var response = await _CheckAsync(
			$"unknown-{Guid.NewGuid():N}@example.com",
			$"missing-{Guid.NewGuid():N}"
		);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("invalid-password-reset-token");
	}

	[Fact]
	public async Task
	ItShouldReturnGenericInvalidTranslationKeyWhenPasswordResetEmailMismatched() {
		var user = await _CreateUserAsync(DateTime.UtcNow.AddMinutes(5));

		using var response = await _CheckAsync(
			$"mismatch-{Guid.NewGuid():N}@example.com",
			user.Token
		);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("invalid-password-reset-token");
	}

	[Fact]
	public async Task
	ItShouldReturnOkWithExpectedResultWhenPasswordResetTokenValid() {
		var user = await _CreateUserAsync(DateTime.UtcNow.AddMinutes(5));

		using var response = await _CheckAsync(user.Email, user.Token);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<CheckResetPasswordTokenResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Status.Should().Be("success");
		result.Email.Should().Be(user.Email);
	}

	private async Task<HttpResponseMessage> _CheckAsync(string email, string token) {
		var id = Uri.EscapeDataString(CryptoUtils.EncryptString(email));
		return await _Http.GetAsync(
			$"{Routes.Auth.CheckResetPasswordToken}?id={id}&token={token}"
		);
	}

	private async Task<(string Email, string Token)> _CreateUserAsync(DateTime expiresAt) {
		var email = $"check-reset-{Guid.NewGuid():N}@example.com";
		var token = $"reset-{Guid.NewGuid():N}";

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		_ = dbContext.User.Add(new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "Reset",
			LastName = "Check",
			IsVerified = true,
			Status = UserStatus.Active,
			PasswordResetToken = token,
			PasswordResetTokenExpiresAt = expiresAt
		});
		_ = await dbContext.SaveChangesAsync();

		return (email, token);
	}

	private static async Task<AppProblemDetails> _ExecuteProblemAsync(IResult result) {
		var context = new DefaultHttpContext();
		context.Response.Body = new MemoryStream();

		await result.ExecuteAsync(context);

		context.Response.StatusCode.Should().Be(StatusCodes.Status400BadRequest);
		context.Response.Body.Position = 0;
		var problem = await JsonSerializer.DeserializeAsync<AppProblemDetails>(
			context.Response.Body,
			JsonSerializerOptions.Web
		);
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		return problem;
	}
}
