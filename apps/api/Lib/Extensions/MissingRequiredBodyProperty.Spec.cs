using System.Net;
using System.Net.Http.Json;
using System.Text;

using FluentAssertions;

using Microsoft.AspNetCore.Http;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Lib.Extensions;

/// <summary>
/// #2261, at the pipeline level: a JSON body that omits a member its DTO declares
/// <c>required</c> never reaches FluentValidation — the request delegate rejects it
/// while binding. Before the fix that produced a bare 400 with NO body (and, once
/// the delegate throws, an unmapped 500). One case per request-body DTO family,
/// naming the missing member, plus the wrong-value case that must keep its shape.
///
/// No request carries a session token: binding fails before any auth filter runs,
/// so each 422 here also proves this path can never answer 401.
/// </summary>
public sealed class MissingRequiredBodyPropertySpec : IClassFixture<ApiFixture> {
	private readonly HttpClient _Http;

	public MissingRequiredBodyPropertySpec(ApiFixture fixture) {
		this._Http = fixture.HttpClient;
	}

	// ── one per body-DTO family ─────────────────────────────────────────

	[Fact]
	public async Task
	ItShouldReturn422NamingTheMissingMembersOnTheAuthBodyFamily() {
		var problem = await this._PostJsonAsync("/auth/reset-password", "{}");

		problem.Status.Should().Be(StatusCodes.Status422UnprocessableEntity);
		problem.Detail.Should().Be("Request body validation failed");
		problem.TranslationKey.Should().Be("request-body-validation-failed");
		problem.Errors.Keys.Should().BeEquivalentTo(
			["Id", "Token", "NewPassword", "ConfirmPassword"]
		);
		problem.Errors.Values.Should().OnlyContain(
			messages => messages.Length == 1
		);
	}

	[Fact]
	public async Task
	ItShouldReturn422NamingTheMissingMemberOnThePostsBodyFamily() {
		var problem = await this._PostJsonAsync("/posts", "{}");

		problem.Status.Should().Be(StatusCodes.Status422UnprocessableEntity);
		problem.Errors.Should().ContainKey("Body")
			.WhoseValue.Should().Equal("Body is required");
	}

	[Fact]
	public async Task
	ItShouldReturn422NamingTheMissingMemberOnThePublishingBodyFamily() {
		var problem = await this._PostJsonAsync(
			$"/posts/{Guid.NewGuid()}/schedule",
			"{}"
		);

		problem.Status.Should().Be(StatusCodes.Status422UnprocessableEntity);
		problem.Errors.Should().ContainKey("TimeZone")
			.WhoseValue.Should().Equal("TimeZone is required");
	}

	[Fact]
	public async Task
	ItShouldReturn422NamingTheMissingMembersOnTheInvitationsBodyFamily() {
		var problem = await this._PostJsonAsync("/staff/invitations/", "{}");

		problem.Status.Should().Be(StatusCodes.Status422UnprocessableEntity);
		problem.Errors.Keys.Should().BeEquivalentTo(["Email", "ProfileId"]);
	}

	[Fact]
	public async Task
	ItShouldReturn422NamingTheMissingMembersOnTheSystemNoticesBodyFamily() {
		var problem = await this._PostJsonAsync("/staff/notices/", "{}");

		problem.Status.Should().Be(StatusCodes.Status422UnprocessableEntity);
		problem.Errors.Keys.Should().BeEquivalentTo(
			["Severity", "Title", "Message", "StartsAt"]
		);
	}

	[Fact]
	public async Task
	ItShouldReturn422NamingTheMissingMemberOnTheSocialAccountsBodyFamily() {
		var problem = await this._PostJsonAsync(
			"/social-accounts/mastodon/start",
			"{}"
		);

		problem.Status.Should().Be(StatusCodes.Status422UnprocessableEntity);
		problem.Errors.Should().ContainKey("Instance")
			.WhoseValue.Should().Equal("Instance is required");
	}

	// ── the unchanged wrong-value shape ─────────────────────────────────

	[Fact]
	public async Task
	ItShouldKeepTheValidatorShapeWhenARequiredMemberIsPresentButWrong() {
		var problem = await this._PostJsonAsync(
			"/auth/request-password-reset",
			"{\"email\":123}"
		);

		problem.Status.Should().Be(StatusCodes.Status422UnprocessableEntity);
		problem.Detail.Should().Be("Request body validation failed");
		problem.TranslationKey.Should().Be("request-body-validation-failed");
		problem.Errors.Should().ContainKey("Email")
			.WhoseValue.Should().BeEquivalentTo(
				["Email must be a string", "Invalid email address"]
			);
		// The binder did NOT reject this one; FluentValidation did.
		problem.Errors["Email"].Should().NotContain("Email is required");
	}

	private async Task<ValidationProblemDetails> _PostJsonAsync(
		string url,
		string json
	) {
		using var request = new HttpRequestMessage(HttpMethod.Post, url);
		request.Content = new StringContent(json, Encoding.UTF8, "application/json");

		using var response = await this._Http.SendAsync(request);

		var contentType = response.Content.Headers.ContentType;
		contentType.Should().NotBeNull();
		contentType.Required().MediaType.Should().Be("application/problem+json");
		response.StatusCode.Should().NotBe(HttpStatusCode.Unauthorized);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		return problem.Required();
	}
}
