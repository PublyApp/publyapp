using System.Net;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky;

/// <summary>
/// Unit specs for the Bluesky HTTP adapter's failure classification (plan Task 2
/// step 1): account-caused refusals vs transient failures, decided inside the
/// adapter so no exception crosses the seam. The app password travels only in the
/// outgoing request body and must never appear in any returned reason.
/// </summary>
public sealed class BlueskyClientSpec {
	private const string TestIdentifier = "alice.test";
	private const string TestAppPassword = "correct-horse-battery-staple";

	private sealed class StubHandler : HttpMessageHandler {
		public HttpResponseMessage? Response { get; set; }
		public Exception? Throw { get; set; }
		public string? CapturedRequestBody { get; private set; }
		public string? CapturedRequestPath { get; private set; }

		protected override async Task<HttpResponseMessage> SendAsync(
			HttpRequestMessage request,
			CancellationToken cancellationToken
		) {
			CapturedRequestPath = request.RequestUri?.PathAndQuery;
			if (request.Content is not null) {
				CapturedRequestBody = await request.Content
					.ReadAsStringAsync(cancellationToken);
			}

			if (Throw is not null) {
				throw Throw;
			}

			return Response
				?? new HttpResponseMessage(HttpStatusCode.InternalServerError);
		}
	}

	private static (BlueskyClient Client, StubHandler Handler) BuildClient() {
		var handler = new StubHandler();
		var services = new ServiceCollection();
		// Production registration (base address + per-request timeout), with only
		// the primary handler replaced by the stub — no network is contacted.
		BlueskyClient.RegisterHttpClient(services);
		services.ConfigureHttpClientDefaults(defaults => {
			defaults.ConfigurePrimaryHttpMessageHandler(() => handler);
		});
		// Deliberately not disposed: DefaultHttpClientFactory opens its own DI scope
		// lazily on CreateClient, so the provider must outlive the client under test.
		var provider = services.BuildServiceProvider();
		var factory = provider.GetRequiredService<IHttpClientFactory>();
		return (
			new BlueskyClient(
				factory,
				NullLogger<BlueskyClient>.Instance
			),
			handler
		);
	}

	private static BlueskyCredentials Credentials() {
		return new BlueskyCredentials(TestIdentifier, TestAppPassword);
	}

	[Fact]
	public async Task ItShouldReturnAccountFailureWithPlainWordsReasonOn401() {
		var (client, handler) = BuildClient();
		handler.Response = new HttpResponseMessage(HttpStatusCode.Unauthorized) {
			Content = new StringContent("{\"error\":\"InvalidRequest\"}"),
		};

		var result = await client.CreateSessionAsync(Credentials());

		var refused = result.Should().BeOfType<BlueskySessionResult.AccountFailure>()
			.Subject;
		refused.Reason.Should().Be("credentials refused");
		refused.Reason.Should().NotContain(TestAppPassword);
	}

	[Fact]
	public async Task ItShouldReturnAccountFailureForOther400ClassRefusals() {
		var (client, handler) = BuildClient();
		handler.Response = new HttpResponseMessage(HttpStatusCode.BadRequest) {
			Content = new StringContent(
				"{\"error\":\"InvalidRequest\",\"error_description\":\"Unknown actor\"}"
			),
		};

		var result = await client.CreateSessionAsync(Credentials());

		var refused = result.Should().BeOfType<BlueskySessionResult.AccountFailure>()
			.Subject;
		refused.Reason.Should().Be("account not found");
		refused.Reason.Should().NotContain(TestAppPassword);
	}

	[Fact]
	public async Task ItShouldReturnTransientOn5xx() {
		var (client, handler) = BuildClient();
		handler.Response = new HttpResponseMessage(
			HttpStatusCodesBadGateway()
		);

		var result = await client.CreateSessionAsync(Credentials());

		result.Should().BeOfType<BlueskySessionResult.Transient>();
	}

	[Fact]
	public async Task ItShouldReturnTransientOnNetworkFailureInsteadOfThrowing() {
		var (client, handler) = BuildClient();
		handler.Throw = new HttpRequestException("connection refused");

		var result = await client.CreateSessionAsync(Credentials());

		result.Should().BeOfType<BlueskySessionResult.Transient>();
	}

	[Fact]
	public async Task ItShouldResolveDidHandleAndSessionValuesOnSuccess() {
		var (client, handler) = BuildClient();
		handler.Response = new HttpResponseMessage(HttpStatusCode.OK) {
			Content = new StringContent(
				"{\"did\":\"did:plc:abc123\",\"handle\":\"alice.test\","
				+ "\"accessJwt\":\"jwt-value\",\"refreshJwt\":\"r\"}"
			),
		};

		var result = await client.CreateSessionAsync(Credentials());

		var success = result.Should().BeOfType<BlueskySessionResult.Success>()
			.Subject;
		success.Identity.Did.Should().Be("did:plc:abc123");
		success.Identity.Handle.Should().Be("alice.test");
		success.AccessJwt.Should().Be("jwt-value");
		success.PdsHost.Should().NotBeNullOrEmpty();
		success.PdsHost.Should().NotContain(TestAppPassword);
	}

	[Fact]
	public async Task ItShouldSendIdentifierAndPasswordOnlyInTheRequestBody() {
		var (client, handler) = BuildClient();
		handler.Response = new HttpResponseMessage(HttpStatusCode.OK) {
			Content = new StringContent(
				"{\"did\":\"did:plc:abc123\",\"handle\":\"alice.test\","
				+ "\"accessJwt\":\"j\"}"
			),
		};

		_ = await client.CreateSessionAsync(Credentials());

		handler.CapturedRequestPath.Should().Contain(
			"com.atproto.server.createSession"
		);
		handler.CapturedRequestBody.Should().NotBeNull();
		Assert.NotNull(handler.CapturedRequestBody);
		handler.CapturedRequestBody.Should().Contain(TestIdentifier);
		handler.CapturedRequestBody.Should().Contain(TestAppPassword);
	}

	[Theory]
	[InlineData(HttpStatusCode.Unauthorized, "credentials refused")]
	[InlineData(HttpStatusCode.BadRequest, "account not found")]
	public async Task ItShouldNeverEchoTheAppPasswordInAFailureReason(
		HttpStatusCode status,
		string expectedReason
	) {
		var (client, handler) = BuildClient();
		handler.Response = new HttpResponseMessage(status);

		var result = await client.CreateSessionAsync(Credentials());

		var refused = result.Should().BeOfType<BlueskySessionResult.AccountFailure>()
			.Subject;
		refused.Reason.Should().Be(expectedReason);
		refused.Reason.Should().NotContain(TestAppPassword);
	}

	private static HttpStatusCode HttpStatusCodesBadGateway() {
		return HttpStatusCode.BadGateway;
	}
}
