using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;

using Xunit;

using AppRoutes = PublyApp.Api.Lib.Routes.Routes;

namespace PublyApp.Api.Lib.RateLimiting;

public sealed class ComprehensiveRateLimitingSpec
	: IClassFixture<ApiFixture> {
	private const int LongWindowSeconds = 3_600;
	private readonly ApiFixture _fixture;

	public ComprehensiveRateLimitingSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
	}

	[Theory]
	[InlineData("login")]
	[InlineData("register")]
	[InlineData("verify-email-request")]
	[InlineData("request-password-reset")]
	[InlineData("reset-password")]
	[InlineData("verification-link")]
	[InlineData("check-email-verification-token")]
	[InlineData("check-reset-password-token")]
	[InlineData("accept-invitation")]
	public async Task
	ItShouldLimitEveryAnonymousAuthFlowAtItsConfiguredCap(
		string flow
	) {
		await using var factory = CreateFactory(
			anonymousPermitLimit: 1
		);
		using var client = CreateClient(factory);

		using var firstRequest = CreateAnonymousRequest(flow);
		using var firstResponse = await client.SendAsync(
			firstRequest
		);
		using var rejectedRequest = CreateAnonymousRequest(flow);
		using var rejectedResponse = await client.SendAsync(
			rejectedRequest
		);

		firstResponse.StatusCode.Should()
			.NotBe(HttpStatusCode.TooManyRequests);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
	}

	[Fact]
	public async Task
	ItShouldLimitAuthenticatedSessionsIndependently() {
		await using var factory = CreateFactory(
			authenticatedPermitLimit: 1
		);
		using var client = CreateClient(factory);
		var authClient = new TestAuthClient(client);
		var firstToken =
			await authClient.LoginAsStaffAdminAsync();
		var secondToken =
			await authClient.LoginAsStaffAdminAsync();

		using var firstResponse = await SendAuthenticatedAsync(
			client,
			AppRoutes.Auth.GetUserAuthData,
			firstToken
		);
		using var rejectedResponse =
			await SendAuthenticatedAsync(
				client,
				AppRoutes.Auth.GetUserAuthData,
				firstToken
			);
		using var independentResponse =
			await SendAuthenticatedAsync(
				client,
				AppRoutes.Auth.GetUserAuthData,
				secondToken
			);

		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
		independentResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task
	ItShouldNotMultiplyAllowanceByRotatingForgedSessionTokens() {
		await using var factory = CreateFactory(
			authenticatedPermitLimit: 1
		);
		using var client = CreateClient(factory);

		using var firstResponse = await SendAuthenticatedAsync(
			client,
			AppRoutes.Auth.GetUserAuthData,
			"first-forged-session-token"
		);
		using var rotatedResponse =
			await SendAuthenticatedAsync(
				client,
				AppRoutes.Auth.GetUserAuthData,
				"second-forged-session-token"
			);

		firstResponse.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
		await AssertRateLimitedResponseAsync(
			rotatedResponse
		);
	}

	[Fact]
	public async Task
	ItShouldEnforceTheTighterExportPolicyBeforeTheAuthenticatedDefault() {
		await using var factory = CreateFactory(
			authenticatedPermitLimit: 100,
			exportPermitLimit: 1
		);
		using var client = CreateClient(factory);
		var token = await new TestAuthClient(client)
			.LoginAsStaffAdminAsync();
		var exportUrl = AuditLogTestHelper.GetExportUrl(
			"csv"
		);

		using var firstResponse = await SendAuthenticatedAsync(
			client,
			exportUrl,
			token
		);
		using var rejectedResponse =
			await SendAuthenticatedAsync(
				client,
				exportUrl,
				token
			);
		using var defaultPolicyResponse =
			await SendAuthenticatedAsync(
				client,
				AppRoutes.Auth.GetUserAuthData,
				token
			);

		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
		defaultPolicyResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task
	ItShouldCountEveryStaffProfileInvitationRecipient() {
		await using var factory = CreateFactory(
			emailPermitLimit: 2
		);
		using var client = CreateClient(factory);
		var token = await new TestAuthClient(client)
			.LoginAsStaffAdminAsync();

		using var weightedResponse =
			await SendStaffProfileCreateAsync(
				client,
				token,
				[
					$"weighted-a-{Guid.NewGuid():N}@example.com",
					$"weighted-b-{Guid.NewGuid():N}@example.com",
				]
			);
		using var rejectedResponse =
			await SendStaffProfileCreateAsync(
				client,
				token,
				[]
			);

		weightedResponse.StatusCode.Should()
			.Be(HttpStatusCode.Created);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
	}

	[Fact]
	public async Task
	ItShouldCountEveryTenantBulkInvitationRecipient() {
		await using var factory = CreateFactory(
			emailPermitLimit: 100,
			tenantEmailPermitLimit: 2
		);
		using var client = CreateClient(factory);
		var token = await new TestAuthClient(client)
			.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				client,
				token,
				SeedConstants.Tenants.AcmeName
			);

		using var weightedResponse =
			await SendTenantBulkInvitationsAsync(
				client,
				token,
				tenantId,
				2
			);
		using var rejectedResponse =
			await SendTenantBulkInvitationsAsync(
				client,
				token,
				tenantId,
				1
			);

		weightedResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
	}

	[Fact]
	public async Task
	ItShouldApplyTheGlobalFloorToAnUnmappedHealthPrefix() {
		await using var factory = CreateFactory(
			globalPermitLimit: 1
		);
		using var client = CreateClient(factory);
		const string path = "/health/not-real";

		using var firstResponse = await client.GetAsync(path);
		using var rejectedResponse = await client.GetAsync(path);

		firstResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
	}

	[Theory]
	[InlineData("/health")]
	[InlineData("/health/live")]
	[InlineData("/health/ready")]
	public async Task
	ItShouldNeverLimitHealthEndpointBursts(
		string path
	) {
		await using var factory = CreateFactory(
			globalPermitLimit: 1
		);
		using var client = CreateClient(factory);

		for (var requestNumber = 0; requestNumber < 10; requestNumber++) {
			using var response = await client.GetAsync(path);
			response.StatusCode.Should().Be(
				HttpStatusCode.OK,
				$"health request {requestNumber + 1} should be exempt"
			);
		}
	}

	private WebApplicationFactory<Program> CreateFactory(
		int globalPermitLimit = 100,
		int anonymousPermitLimit = 100,
		int authenticatedPermitLimit = 100,
		int exportPermitLimit = 100,
		int emailPermitLimit = 100,
		int tenantEmailPermitLimit = 100
	) {
		var generous = new RateLimitWindowSettings(
			100,
			LongWindowSeconds
		);
		var anonymousSettings =
			new AnonymousAuthRateLimitSettings(
				PerIp: new RateLimitWindowSettings(
					anonymousPermitLimit,
					LongWindowSeconds
				),
				PerEmail: new RateLimitWindowSettings(
					anonymousPermitLimit,
					LongWindowSeconds
				),
				PasswordResetPerEmail:
					new RateLimitWindowSettings(
						anonymousPermitLimit,
						LongWindowSeconds
					)
			);
		var apiSettings = new ApiRateLimitSettings(
			Global: new RateLimitWindowSettings(
				globalPermitLimit,
				LongWindowSeconds
			),
			AnonymousOther: generous,
			Authenticated: new RateLimitWindowSettings(
				authenticatedPermitLimit,
				LongWindowSeconds
			),
			HeavySearch: generous,
			Bulk: generous,
			TenantBulk: generous,
			Email: new RateLimitWindowSettings(
				emailPermitLimit,
				LongWindowSeconds
			),
			TenantEmail: new RateLimitWindowSettings(
				tenantEmailPermitLimit,
				LongWindowSeconds
			),
			Export: new RateLimitWindowSettings(
				exportPermitLimit,
				LongWindowSeconds
			),
			TenantExport: generous,
			Upload: generous
		);

		return _fixture.Factory.WithWebHostBuilder(
			builder => {
				builder.ConfigureServices(services => {
					services.RemoveAll<
						AnonymousAuthRateLimitSettings>();
					services.RemoveAll<ApiRateLimitSettings>();
					services.AddSingleton(anonymousSettings);
					services.AddSingleton(apiSettings);
				});
			}
		);
	}

	private static HttpClient CreateClient(
		WebApplicationFactory<Program> factory
	) {
		return factory.CreateClient(
			new WebApplicationFactoryClientOptions {
				HandleCookies = false,
			}
		);
	}

	private static HttpRequestMessage CreateAnonymousRequest(
		string flow
	) {
		const string email = "comprehensive-limit@example.com";

		return flow switch {
			"login" => CreateJsonRequest(
				AppRoutes.Auth.Login,
				new {
					email,
					password = "InvalidPassword1!",
				}
			),
			"register" => CreateJsonRequest(
				AppRoutes.Auth.Register,
				new { email }
			),
			"verify-email-request" => CreateJsonRequest(
				AppRoutes.Auth.VerifyEmailRequest,
				new { email }
			),
			"request-password-reset" => CreateJsonRequest(
				AppRoutes.Auth.RequestPasswordReset,
				new { email }
			),
			"reset-password" => CreateJsonRequest(
				AppRoutes.Auth.ResetPassword,
				new { }
			),
			"verification-link" => new HttpRequestMessage(
				HttpMethod.Get,
				AppRoutes.Auth.GetVerificationLink
			),
			"check-email-verification-token" =>
				new HttpRequestMessage(
					HttpMethod.Get,
					AppRoutes.Auth
						.CheckEmailVerificationToken
				),
			"check-reset-password-token" =>
				new HttpRequestMessage(
					HttpMethod.Get,
					AppRoutes.Auth.CheckResetPasswordToken
				),
			"accept-invitation" => CreateJsonRequest(
				AppRoutes.Invitations.Anonymous
					.AcceptByTokenFn("invalid-token"),
				new { }
			),
			_ => throw new ArgumentOutOfRangeException(
				nameof(flow),
				flow,
				"Unknown anonymous auth flow"
			),
		};
	}

	private static HttpRequestMessage CreateJsonRequest(
		string path,
		object body
	) {
		return new HttpRequestMessage(
			HttpMethod.Post,
			path
		) {
			Content = JsonContent.Create(body),
		};
	}

	private static async Task<HttpResponseMessage>
		SendAuthenticatedAsync(
			HttpClient client,
			string path,
			string token
		) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			path
		).WithSessionToken(token);
		return await client.SendAsync(request);
	}

	private static async Task<HttpResponseMessage>
		SendStaffProfileCreateAsync(
			HttpClient client,
			string token,
			IReadOnlyList<string> emails
		) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				AppRoutes.Staff.Root,
				AppRoutes.Profiles.ForStaff.Root,
				AppRoutes.Profiles.ForStaff.Create
			)
		) {
			Content = JsonContent.Create(new {
				name = $"Weighted Profile {Guid.NewGuid():N}",
				description = (string?)null,
				permissions = new[] {
					AppPermissions.Staff.Profiles
						.GET_FOR_STAFF.Key,
				},
				emails,
			}),
		}.WithSessionToken(token);
		return await client.SendAsync(request);
	}

	private static async Task<HttpResponseMessage>
		SendTenantBulkInvitationsAsync(
			HttpClient client,
			string token,
			Guid tenantId,
			int recipientCount
		) {
		var invitations = Enumerable
			.Range(0, recipientCount)
			.Select(_ => new {
				email =
					$"weighted-tenant-{Guid.NewGuid():N}"
					+ "@example.com",
				accountLevel = "User",
				profileIds = Array.Empty<string>(),
			})
			.ToArray();
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				AppRoutes.Staff.Root,
				AppRoutes.Users.ForTenantAsStaff
					.BulkInviteFn(
						tenantId.ToString("D")
					)
			)
		) {
			Content = JsonContent.Create(new {
				invitations,
			}),
		}.WithSessionToken(token);
		return await client.SendAsync(request);
	}

	private static async Task
		AssertRateLimitedResponseAsync(
			HttpResponseMessage response
		) {
		response.StatusCode.Should()
			.Be(HttpStatusCode.TooManyRequests);
		response.Content.Headers.ContentType?.MediaType
			.Should().Be("application/problem+json");

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Status.Should().Be(
			StatusCodes.Status429TooManyRequests
		);
		problem.Title.Should().Be("Too Many Requests");
		problem.TranslationKey.Should().Be(
			ResponseKeys.TooManyRequests
		);
		problem.Extensions.Should().ContainKey("traceId");

		response.Headers.TryGetValues(
			"Retry-After",
			out var retryAfterValues
		).Should().BeTrue();
		var retryAfter = retryAfterValues?.Single();
		int.TryParse(
			retryAfter,
			out var retryAfterSeconds
		).Should().BeTrue();
		retryAfterSeconds.Should().BeGreaterThan(0);
	}
}
