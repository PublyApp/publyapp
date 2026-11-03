
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Handlers;

public sealed class GetVerificationLinkSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;

	public GetVerificationLinkSpec(
		ApiFixture fixture
	) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
	}

	// Success path: the endpoint was previously reached only through its failure
	// branches (docs/records/2026-10-28-analysis-endpoint-coverage.md).
	[Fact]
	public async Task
	ItShouldReturnTheVerificationLinkForAnExistingUser() {
		var (userId, email) = await this._SeedUnverifiedUserAsync();

		var url = Routes.Auth.GetVerificationLink
			+ $"?user_id={userId}";

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetVerificationLinkResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		var frontUrl = AppEnvironment.Instance.FRONT_URL.TrimEnd('/');
		result.Link.Should().StartWith($"{frontUrl}/verify-email?");
		result.Link.Should().Contain($"token={userId}");
		result.Link.Should().Contain(
			"id=",
			"the encrypted email rides along so the screen can address the account"
		);
		result.Link.Should().NotContain(
			email,
			"the address is encrypted, never placed in the link in clear"
		);
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonExistentUserId() {
		var url = Routes.Auth.GetVerificationLink
			+ $"?user_id={Guid.NewGuid()}";

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task
	ItShouldReturnValidationErrorForMalformedUserId() {
		var url = Routes.Auth.GetVerificationLink
			+ "?user_id=not-a-guid";

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		if (problem is null) {
			return;
		}
		problem.Errors.Should().ContainKey("user_id");
		problem.Errors.Should().NotContainKey(string.Empty);
	}

	[Fact]
	public async Task
	ItShouldReturnValidationErrorForMissingUserId() {
		var url = Routes.Auth.GetVerificationLink;

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	private async Task<(Guid UserId, string Email)> _SeedUnverifiedUserAsync() {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var email = $"verification-link-{Guid.NewGuid():N}@example.com";
		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(
				TestConstants.SeedPassword
			),
			FirstName = "VerificationLink",
			LastName = "Spec",
			Status = UserStatus.Active,
			IsVerified = false,
		};
		await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();

		return (user.GetRequiredId(), email);
	}
}
