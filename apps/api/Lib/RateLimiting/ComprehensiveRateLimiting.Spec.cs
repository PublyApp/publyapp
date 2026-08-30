using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Auth.Entities;
using PublyApp.Api.Modules.Auth.Services;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

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
		var sessionService =
			new RejectingSessionService();
		await using var factory = CreateFactory(
			globalPermitLimit: 100,
			authenticatedPermitLimit: 1,
			sessionService: sessionService
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
		sessionService.LookupCount.Should().Be(
			2,
			"the generous IP floor must admit both "
				+ "requests so the authenticated policy "
				+ "proves forged tokens share one bucket"
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
	ItShouldCountEveryStaffBulkInvitationRecipient() {
		await using var factory = CreateFactory(
			emailPermitLimit: 2
		);
		using var client = CreateClient(factory);
		var token = await new TestAuthClient(client)
			.LoginAsStaffAdminAsync();
		var profileId = await GetStaffProfileIdAsync(
			factory
		);

		using var weightedResponse =
			await SendStaffBulkInvitationsAsync(
				client,
				token,
				profileId,
				[
					$"weighted-staff-a-{Guid.NewGuid():N}"
						+ "@example.com",
					$"weighted-staff-b-{Guid.NewGuid():N}"
						+ "@example.com",
				]
			);
		using var rejectedResponse =
			await SendStaffBulkInvitationsAsync(
				client,
				token,
				profileId,
				[
					$"weighted-staff-c-{Guid.NewGuid():N}"
						+ "@example.com",
				]
			);

		weightedResponse.StatusCode.Should()
			.Be(HttpStatusCode.Created);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
	}

	[Fact]
	public async Task
	ItShouldCountEveryTenantCreationRecipient() {
		await using var factory = CreateFactory(
			emailPermitLimit: 2
		);
		using var client = CreateClient(factory);
		var token = await new TestAuthClient(client)
			.LoginAsStaffAdminAsync();

		using var weightedResponse =
			await SendTenantCreateAsync(
				client,
				token,
				2
			);
		using var rejectedResponse =
			await SendTenantCreateAsync(
				client,
				token,
				1
			);

		weightedResponse.StatusCode.Should()
			.Be(HttpStatusCode.Created);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
	}

	[Fact]
	public async Task
	ItShouldNotCreateOrEnqueueAboveTheRecipientCeiling() {
		await using var factory = CreateFactory(
			emailPermitLimit: 1
		);
		using var client = CreateClient(factory);
		var token = await new TestAuthClient(client)
			.LoginAsStaffAdminAsync();
		var profileId = await GetStaffProfileIdAsync(
			factory
		);
		var emails = new[] {
			$"over-cap-a-{Guid.NewGuid():N}@example.com",
			$"over-cap-b-{Guid.NewGuid():N}@example.com",
		};

		using var response =
			await SendStaffBulkInvitationsAsync(
				client,
				token,
				profileId,
				emails
			);

		await AssertRateLimitedResponseAsync(response);
		await using var scope =
			factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		(await dbContext.Invitation.AnyAsync(
			invitation =>
				emails.Contains(invitation.Email)
		)).Should().BeFalse();
		(await dbContext.InvitationEmailOutbox.AnyAsync(
			outbox => emails.Contains(outbox.Email)
		)).Should().BeFalse();
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

	[Fact]
	public async Task
	ItShouldApplyTheGlobalFloorToCorsPreflightRequests() {
		await using var factory = CreateFactory(
			globalPermitLimit: 1
		);
		using var client = CreateClient(factory);

		using var firstRequest = CreateCorsPreflightRequest();
		using var firstResponse = await client.SendAsync(
			firstRequest
		);
		using var rejectedRequest = CreateCorsPreflightRequest();
		using var rejectedResponse = await client.SendAsync(
			rejectedRequest
		);

		firstResponse.StatusCode.Should()
			.Be(HttpStatusCode.NoContent);
		AssertCorsPreflightHeaders(firstResponse);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
		AssertCorsPreflightHeaders(rejectedResponse);
	}

	[Fact]
	public async Task
	ItShouldExposeCorsHeadersOnRateLimitedResponses() {
		await using var factory = CreateFactory(
			globalPermitLimit: 1
		);
		using var client = CreateClient(factory);
		const string path = "/health/not-real";

		using var firstRequest = CreateCorsRequest(
			HttpMethod.Get,
			path
		);
		using var firstResponse = await client.SendAsync(
			firstRequest
		);
		using var rejectedRequest = CreateCorsRequest(
			HttpMethod.Get,
			path
		);
		using var rejectedResponse = await client.SendAsync(
			rejectedRequest
		);

		firstResponse.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
		AssertCorsOrigin(rejectedResponse);
		AssertRetryAfterIsCorsExposed(rejectedResponse);
	}

	[Fact]
	public async Task
	ItShouldNotExposeCorsOriginOnRateLimitedResponsesForDisallowedOrigins() {
		await using var factory = CreateFactory(
			globalPermitLimit: 1
		);
		using var client = CreateClient(factory);
		const string path = "/health/not-real";
		const string disallowedOrigin =
			"https://disallowed.example.com";

		using var firstRequest = CreateCorsRequest(
			HttpMethod.Get,
			path,
			disallowedOrigin
		);
		using var firstResponse = await client.SendAsync(
			firstRequest
		);
		using var rejectedRequest = CreateCorsRequest(
			HttpMethod.Get,
			path,
			disallowedOrigin
		);
		using var rejectedResponse = await client.SendAsync(
			rejectedRequest
		);

		firstResponse.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
		rejectedResponse.Headers.Contains(
			"Access-Control-Allow-Origin"
		).Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldExposeCorsHeadersOnOversizedEmailBodies() {
		await using var factory = CreateFactory();
		using var client = CreateClient(factory);
		var padding = new string('x', 20_000);
		using var request = CreateCorsRequest(
			HttpMethod.Post,
			AppRoutes.Auth.Login
		);
		request.Content = JsonContent.Create(new {
			email = "oversized-cors@example.com",
			padding,
		});

		using var response = await client.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.RequestEntityTooLarge);
		AssertCorsOrigin(response);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(
			ResponseKeys.RequestBodyValidationFailed
		);
	}

	[Fact]
	public async Task
	ItShouldExhaustAnonymousOtherThroughConfiguredOnRejected() {
		await using var factory = CreateFactory(
			anonymousOtherPermitLimit: 1
		);
		using var client = CreateClient(factory);

		using var firstResponse = await client.GetAsync(
			AppRoutes.SystemNotices.Anonymous.GetActive
		);
		using var rejectedResponse = await client.GetAsync(
			AppRoutes.SystemNotices.Anonymous.GetActive
		);

		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
	}

	[Fact]
	public async Task
	ItShouldExhaustTheHeavySearchPolicyThroughHttpRequests() {
		await using var factory = CreateFactory(
			heavySearchPermitLimit: 1
		);
		using var client = CreateClient(factory);
		var token = await new TestAuthClient(client)
			.LoginAsStaffAdminAsync();
		var path = PathUtils.Join(
			AppRoutes.Staff.Root,
			AppRoutes.Permissions.ForStaff.Root,
			AppRoutes.Permissions.ForStaff.Scopes.Root,
			AppRoutes.Permissions.ForStaff.Scopes.Staff
		);

		using var firstResponse = await SendAuthenticatedAsync(
			client,
			path,
			token
		);
		using var rejectedResponse =
			await SendAuthenticatedAsync(
				client,
				path,
				token
			);

		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
	}

	[Fact]
	public async Task
	ItShouldExhaustTheBulkPolicyThroughHttpRequests() {
		await using var factory = CreateFactory(
			bulkPermitLimit: 1
		);
		using var client = CreateClient(factory);
		var token = await new TestAuthClient(client)
			.LoginAsStaffAdminAsync();

		using var firstResponse = await SendBulkSuspendAsync(
			client,
			token
		);
		using var rejectedResponse =
			await SendBulkSuspendAsync(
				client,
				token
			);

		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
	}

	[Fact]
	public async Task
	ItShouldExhaustTheTenantBulkPolicyThroughHttpRequests() {
		await using var factory = CreateFactory(
			tenantBulkPermitLimit: 1
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

		using var firstResponse =
			await SendTenantBulkRemoveAsync(
				client,
				token,
				tenantId
			);
		using var rejectedResponse =
			await SendTenantBulkRemoveAsync(
				client,
				token,
				tenantId
			);

		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
	}

	[Fact]
	public async Task
	ItShouldExhaustTheTenantExportPolicyThroughHttpRequests() {
		await using var factory = CreateFactory(
			tenantExportPermitLimit: 1
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
		var path = PathUtils.Join(
			AppRoutes.Staff.Root,
			AppRoutes.Users.ForTenantAsStaff.ExportFn(
				tenantId.ToString("D")
			)
		);

		using var firstResponse = await SendAuthenticatedAsync(
			client,
			path,
			token
		);
		using var rejectedResponse =
			await SendAuthenticatedAsync(
				client,
				path,
				token
			);

		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
	}

	[Fact]
	public async Task
	ItShouldExhaustTheUploadPolicyThroughHttpRequests() {
		await using var factory = CreateFactory(
			uploadPermitLimit: 1
		);
		using var client = CreateClient(factory);
		var token = await new TestAuthClient(client)
			.LoginAsStaffAdminAsync();

		using var firstResponse = await SendUploadAsync(
			client,
			token
		);
		using var rejectedResponse = await SendUploadAsync(
			client,
			token
		);

		firstResponse.StatusCode.Should()
			.Be(HttpStatusCode.Created);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
	}

	[Fact]
	public async Task
	ItShouldKeepTheGlobalFloorAdditiveOnNamedPolicies() {
		var token = await new TestAuthClient(
			_fixture.HttpClient
		).LoginAsStaffAdminAsync();
		await using var factory = CreateFactory(
			globalPermitLimit: 1,
			heavySearchPermitLimit: 100
		);
		using var client = CreateClient(factory);
		var path = PathUtils.Join(
			AppRoutes.Staff.Root,
			AppRoutes.Permissions.ForStaff.Root,
			AppRoutes.Permissions.ForStaff.Scopes.Root,
			AppRoutes.Permissions.ForStaff.Scopes.Staff
		);

		using var firstResponse = await SendAuthenticatedAsync(
			client,
			path,
			token
		);
		using var rejectedResponse =
			await SendAuthenticatedAsync(
				client,
				path,
				token
			);

		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		await AssertRateLimitedResponseAsync(
			rejectedResponse
		);
	}

	[Fact]
	public async Task
	ItShouldExcludeFilesFromTheGlobalFloorThroughHttpRequests() {
		await using var factory = CreateFactory(
			globalPermitLimit: 1
		);
		using var client = CreateClient(factory);
		var path = $"/files/not-found-{Guid.NewGuid():N}.png";

		for (var requestNumber = 0; requestNumber < 10; requestNumber++) {
			using var response = await client.GetAsync(path);
			response.StatusCode.Should().Be(
				HttpStatusCode.NotFound,
				$"file request {requestNumber + 1} should be exempt"
			);
		}
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
		int anonymousOtherPermitLimit = 100,
		int authenticatedPermitLimit = 100,
		int exportPermitLimit = 100,
		int tenantExportPermitLimit = 100,
		int emailPermitLimit = 100,
		int tenantEmailPermitLimit = 100,
		int heavySearchPermitLimit = 100,
		int bulkPermitLimit = 100,
		int tenantBulkPermitLimit = 100,
		int uploadPermitLimit = 100,
		int socialConnectPermitLimit = 100,
		// A5 (#636): generous by default so only specs that target SystemJobTrigger
		// explicitly exercise its limits.
		int systemJobTriggerPermitLimit = 1000,
		ISessionService? sessionService = null
	) {
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
			AnonymousOther: new RateLimitWindowSettings(
				anonymousOtherPermitLimit,
				LongWindowSeconds
			),
			Authenticated: new RateLimitWindowSettings(
				authenticatedPermitLimit,
				LongWindowSeconds
			),
			HeavySearch: new RateLimitWindowSettings(
				heavySearchPermitLimit,
				LongWindowSeconds
			),
			Bulk: new RateLimitWindowSettings(
				bulkPermitLimit,
				LongWindowSeconds
			),
			TenantBulk: new RateLimitWindowSettings(
				tenantBulkPermitLimit,
				LongWindowSeconds
			),
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
			TenantExport: new RateLimitWindowSettings(
				tenantExportPermitLimit,
				LongWindowSeconds
			),
			Upload: new RateLimitWindowSettings(
				uploadPermitLimit,
				LongWindowSeconds
			),
			SocialConnect: new RateLimitWindowSettings(
				socialConnectPermitLimit,
				LongWindowSeconds
			),
			// A5 (#636): the trigger policy's own window; generous here so only
			// tests that target SystemJobTrigger explicitly exercise its limits.
			SystemJobTrigger: new RateLimitWindowSettings(
				systemJobTriggerPermitLimit,
				LongWindowSeconds
			)
		);

		return _fixture.Factory.WithWebHostBuilder(
			builder => {
				builder.ConfigureServices(services => {
					services.RemoveAll<
						AnonymousAuthRateLimitSettings>();
					services.RemoveAll<ApiRateLimitSettings>();
					services.RemoveAll<IRateLimitCounterStore>();
					services.AddSingleton(anonymousSettings);
					services.AddSingleton(apiSettings);
					// Fresh per-process counters so the long-window budgets in
					// these tests are never shared with other hosts
					// (pre-#953 semantics).
					services.AddSingleton<IRateLimitCounterStore>(
						new MemoryRateLimitCounterStore()
					);
					if (sessionService is not null) {
						services.RemoveAll<ISessionService>();
						services.AddSingleton(sessionService);
					}
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

	private static HttpRequestMessage
		CreateCorsPreflightRequest() {
		var request = CreateCorsRequest(
			HttpMethod.Options,
			AppRoutes.Auth.Login
		);
		request.Headers.TryAddWithoutValidation(
			"Access-Control-Request-Method",
			"POST"
		);
		return request;
	}

	[Fact]
	public async Task
		ItShouldExhaustTheSocialConnectPolicyThroughHttpRequests() {
		await using var factory = CreateFactory(
			socialConnectPermitLimit: 1
		);
		using var client = CreateClient(factory);
		// Connect is a TENANT route: staff sessions are refused there outright
		// (staff/tenant mutual exclusivity), so authenticate as the seeded Acme
		// admin like the social-account specs do.
		var token = await new TestAuthClient(client)
			.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);
		var staffToken = await new TestAuthClient(client)
			.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				client,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				AppRoutes.SocialAccounts.ForTenant.Root,
				AppRoutes.SocialAccounts.ForTenant.Connect
			)
		).WithSessionToken(token).WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			identifier = "rate-limit-spec.example.com",
			appPassword = "rate-limit-spec-app-password",
		});
		using var firstResponse = await client.SendAsync(request);

		using var rejectedRequest = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				AppRoutes.SocialAccounts.ForTenant.Root,
				AppRoutes.SocialAccounts.ForTenant.Connect
			)
		).WithSessionToken(token).WithTenantId(tenantId);
		rejectedRequest.Content = JsonContent.Create(new {
			identifier = "rate-limit-spec-2.example.com",
			appPassword = "rate-limit-spec-app-password",
		});
		using var rejectedResponse =
			await client.SendAsync(rejectedRequest);

		firstResponse.StatusCode.Should().Be(HttpStatusCode.Created);
		await AssertRateLimitedResponseAsync(rejectedResponse);
	}

	private static HttpRequestMessage CreateCorsRequest(
		HttpMethod method,
		string path,
		string? origin = null
	) {
		var request = new HttpRequestMessage(method, path);
		request.Headers.TryAddWithoutValidation(
			"Origin",
			origin ?? AppEnvironment.Instance.FRONT_URL
		);
		return request;
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

	private static async Task<Guid>
		GetStaffProfileIdAsync(
			WebApplicationFactory<Program> factory
		) {
		await using var scope =
			factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		var profile = await dbContext.Profile
			.FirstAsync(candidate =>
				candidate.Scope == ProfileScope.Staff
			);
		return profile.GetRequiredId();
	}

	private static async Task<HttpResponseMessage>
		SendStaffBulkInvitationsAsync(
			HttpClient client,
			string token,
			Guid profileId,
			IReadOnlyList<string> emails
		) {
		var invitations = emails
			.Select(email => new {
				email,
				profileIds = new[] {
					profileId,
				},
			})
			.ToArray();
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				AppRoutes.Staff.Root,
				AppRoutes.Invitations.ForStaff.Root,
				AppRoutes.Invitations.ForStaff.BulkCreate
			)
		) {
			Content = JsonContent.Create(new {
				invitations,
			}),
		}.WithSessionToken(token);
		return await client.SendAsync(request);
	}

	private static async Task<HttpResponseMessage>
		SendTenantCreateAsync(
			HttpClient client,
			string token,
			int recipientCount
		) {
		var initialUsers = Enumerable
			.Range(0, recipientCount)
			.Select(_ => new {
				email =
					$"weighted-tenant-create-"
					+ $"{Guid.NewGuid():N}@example.com",
				accountLevel = "Admin",
			})
			.ToArray();
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				AppRoutes.Staff.Root,
				AppRoutes.Tenants.ForStaff.Root,
				AppRoutes.Tenants.ForStaff.Create
			)
		) {
			Content = JsonContent.Create(new {
				name =
					$"Weighted Tenant {Guid.NewGuid():N}",
				maxUsers = recipientCount,
				initialUsers,
			}),
		}.WithSessionToken(token);
		return await client.SendAsync(request);
	}

	private static async Task<HttpResponseMessage>
		SendBulkSuspendAsync(
			HttpClient client,
			string token
		) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				AppRoutes.Staff.Root,
				AppRoutes.Users.ForStaff.Root,
				AppRoutes.Users.ForStaff.BulkSuspend
			)
		) {
			Content = JsonContent.Create(new {
				userIds = new[] {
					Guid.NewGuid(),
				},
			}),
		}.WithSessionToken(token);
		return await client.SendAsync(request);
	}

	private static async Task<HttpResponseMessage>
		SendTenantBulkRemoveAsync(
			HttpClient client,
			string token,
			Guid tenantId
		) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				AppRoutes.Staff.Root,
				AppRoutes.Users.ForTenantAsStaff
					.BulkRemoveFn(
						tenantId.ToString("D")
					)
			)
		) {
			Content = JsonContent.Create(new {
				userIds = new[] {
					Guid.NewGuid(),
				},
			}),
		}.WithSessionToken(token);
		return await client.SendAsync(request);
	}

	private static async Task<HttpResponseMessage>
		SendUploadAsync(
			HttpClient client,
			string token
		) {
		using var content = new MultipartFormDataContent();
		var fileContent = new ByteArrayContent([
			0x89, 0x50, 0x4E, 0x47,
			0x0D, 0x0A, 0x1A, 0x0A,
			0x00, 0x00, 0x00, 0x0D,
			0x00, 0x00,
		]);
		fileContent.Headers.ContentType =
			new System.Net.Http.Headers
				.MediaTypeHeaderValue("image/png");
		content.Add(fileContent, "file", "limit.png");
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				AppRoutes.Staff.Root,
				AppRoutes.Uploads.ForStaff.Root,
				AppRoutes.Uploads.ForStaff.Create
			)
		) {
			Content = content,
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

	private static void AssertCorsOrigin(
		HttpResponseMessage response
	) {
		response.Headers.TryGetValues(
			"Access-Control-Allow-Origin",
			out var values
		).Should().BeTrue();
		values.Should().ContainSingle()
			.Which.Should().Be(
				AppEnvironment.Instance.FRONT_URL
			);
	}

	private static void AssertRetryAfterIsCorsExposed(
		HttpResponseMessage response
	) {
		response.Headers.TryGetValues(
			"Access-Control-Expose-Headers",
			out var values
		).Should().BeTrue();
		values.Should().ContainSingle()
			.Which.Split(
				',',
				StringSplitOptions.TrimEntries
			).Should().Contain("Retry-After");
	}

	private static void AssertCorsPreflightHeaders(
		HttpResponseMessage response
	) {
		AssertCorsOrigin(response);
		response.Headers.TryGetValues(
			"Access-Control-Allow-Methods",
			out var values
		).Should().BeTrue();
		values.Should().ContainSingle()
			.Which.Split(
				',',
				StringSplitOptions.TrimEntries
			).Should().Contain("POST");
	}

	private sealed class RejectingSessionService
		: ISessionService {
		public int LookupCount { get; private set; }

		public Task<Session> CreateSessionForUser(
			User user,
			CancellationToken cancellationToken = default
		) {
			throw new NotSupportedException();
		}

		public Task<SessionData?> GetSessionByToken(
			string token,
			CancellationToken cancellationToken = default
		) {
			LookupCount++;
			return Task.FromResult<SessionData?>(null);
		}
	}
}
