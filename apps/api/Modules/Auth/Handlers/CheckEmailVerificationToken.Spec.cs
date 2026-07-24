using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Handlers;

public sealed class CheckEmailVerificationTokenSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;

	public CheckEmailVerificationTokenSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
	}

	[Fact]
	public async Task
	ItShouldReturnExpiredTranslationKeyWhenEmailVerificationTokenExpired() {
		var user = await CreateUserAsync(DateTime.UtcNow.AddMinutes(-1));

		using var response = await CheckAsync(user.Email, user.Token);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("email-verification-token-expired");
	}

	[Fact]
	public async Task
	ItShouldReturnGenericInvalidTranslationKeyWhenEmailVerificationIdCannotBeDecrypted() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var services = scope.ServiceProvider;
		var result = await CheckEmailVerificationToken.Handle(
			new CheckEmailVerificationTokenQuery {
				Id = "not-valid-encrypted-data",
				Token = $"unused-{Guid.NewGuid():N}"
			},
			services.GetRequiredService<IUserService>(),
			services.GetRequiredService<IEmailService>(),
			services.GetRequiredService<ILogger<CheckEmailVerificationToken>>(),
			CancellationToken.None
		);

		var problem = await ExecuteProblemAsync(result);

		problem.TranslationKey.Should().Be("invalid-email-verification-token");
	}

	[Fact]
	public async Task
	ItShouldReturnGenericInvalidTranslationKeyWhenEmailVerificationTokenNotFound() {
		using var response = await CheckAsync(
			$"unknown-{Guid.NewGuid():N}@example.com",
			$"missing-{Guid.NewGuid():N}"
		);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("invalid-email-verification-token");
	}

	[Fact]
	public async Task
	ItShouldReturnGenericInvalidTranslationKeyWhenEmailVerificationEmailMismatched() {
		var user = await CreateUserAsync(DateTime.UtcNow.AddMinutes(5));

		using var response = await CheckAsync(
			$"mismatch-{Guid.NewGuid():N}@example.com",
			user.Token
		);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("invalid-email-verification-token");
	}

	[Fact]
	public async Task
	ItShouldReturnOkWithExpectedResultWhenEmailVerificationTokenValid() {
		var user = await CreateUserAsync(DateTime.UtcNow.AddMinutes(5));

		using var response = await CheckAsync(user.Email, user.Token);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<CheckEmailVerificationTokenResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Status.Should().Be("success");
		result.ResetPasswordUrl.Should().NotBeNullOrWhiteSpace();
	}

	private async Task<HttpResponseMessage> CheckAsync(string email, string token) {
		var id = Uri.EscapeDataString(CryptoUtils.EncryptString(email));
		return await _http.GetAsync(
			$"{Routes.Auth.CheckEmailVerificationToken}?id={id}&token={token}"
		);
	}

	private async Task<(string Email, string Token)> CreateUserAsync(DateTime expiresAt) {
		var email = $"check-verification-{Guid.NewGuid():N}@example.com";
		var token = $"verify-{Guid.NewGuid():N}";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		_ = dbContext.User.Add(new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "Verification",
			LastName = "Check",
			IsVerified = false,
			Status = UserStatus.Active,
			EmailVerifyToken = token,
			EmailVerifyTokenExpiresAt = expiresAt
		});
		_ = await dbContext.SaveChangesAsync();

		return (email, token);
	}

	private static async Task<AppProblemDetails> ExecuteProblemAsync(IResult result) {
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
