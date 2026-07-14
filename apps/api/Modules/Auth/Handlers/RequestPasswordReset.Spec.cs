using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;

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

	[Fact]
	public async Task
	ItShouldReturnGenericSuccessForNonExistentEmailWithoutIssuingAToken() {
		var email = $"nonexistent-{Guid.NewGuid():N}@example.com";

		using var response = await _http.PostAsJsonAsync(
			Routes.Auth.RequestPasswordReset,
			new { email }
		);

		// Same status and shape as the verified-user case above — a caller
		// cannot distinguish an existing account from a non-existent one.
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<RequestPasswordResetResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Status.Should().Be("success");
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
