
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

public sealed class PasswordRegisterSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;

	public PasswordRegisterSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
		_http = fixture.HttpClient;
	}

	[Fact]
	public async Task
	ItShouldPersistTrimmedFirstNameAndLastNameWithValidCredentials() {
		var email = $"register-{Guid.NewGuid():N}@example.com";
		var registerRequest = new {
			email,
			password = "aurora-441789",
			firstName = "  Mara  ",
			lastName = "  Okonkwo  ",
		};

		using var response = await _http.PostAsJsonAsync(
			Routes.Auth.Register,
			registerRequest
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<RegisterResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Email.Should().Be(email);

		using var scope = _fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		var persistedUser = await dbContext.User
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(u => u.Id == result.Id);

		persistedUser.Should().NotBeNull();
		Assert.NotNull(persistedUser);
		persistedUser.FirstName.Should().Be("Mara");
		persistedUser.LastName.Should().Be("Okonkwo");
	}

	[Theory]
	[InlineData("firstName", "")]
	[InlineData("firstName", "   ")]
	[InlineData("lastName", "")]
	[InlineData("lastName", "   ")]
	public async Task
	ItShouldReturnUnprocessableEntityForBlankOrWhitespaceOnlyName(
		string field,
		string value
	) {
		var body = BuildRegisterBody(
			$"register-{Guid.NewGuid():N}@example.com",
			field,
			value
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			Routes.Auth.Register
		) {
			Content = JsonContent.Create(body)
		};

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Theory]
	[InlineData("firstName")]
	[InlineData("lastName")]
	public async Task
	ItShouldReturnUnprocessableEntityWhenNameFieldExceedsMaxLength(
		string field
	) {
		var tooLong = new string('a', 101);
		var body = BuildRegisterBody(
			$"register-{Guid.NewGuid():N}@example.com",
			field,
			tooLong
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			Routes.Auth.Register
		) {
			Content = JsonContent.Create(body)
		};

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenNameFieldIsMissing() {
		var body = new Dictionary<string, object?> {
			["email"] = $"register-{Guid.NewGuid():N}@example.com",
			["password"] = "aurora-441789",
			["lastName"] = "Okonkwo",
		};

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			Routes.Auth.Register
		) {
			Content = JsonContent.Create(body)
		};

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	private static Dictionary<string, object?> BuildRegisterBody(
		string email,
		string overrideField,
		string overrideValue
	) {
		var body = new Dictionary<string, object?> {
			["email"] = email,
			["password"] = "aurora-441789",
			["firstName"] = "Mara",
			["lastName"] = "Okonkwo",
		};
		body[overrideField] = overrideValue;
		return body;
	}

	// Matches PasswordRegisterResult in PasswordRegister.cs
	private record RegisterResponse(
		Guid Id,
		string Email,
		DateTime CreatedAt,
		DateTime UpdatedAt
	);
}
