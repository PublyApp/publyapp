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
	private const string _TestIdentifier = "alice.test";
	private const string _TestAppPassword = "correct-horse-battery-staple";

	private sealed class StubHandler : HttpMessageHandler {
		public HttpResponseMessage? Response { get; set; }
		public Exception? Throw { get; set; }
		public string? CapturedRequestBody { get; private set; }
		public string? CapturedRequestPath { get; private set; }

		protected override async Task<HttpResponseMessage> SendAsync(
			HttpRequestMessage request,
			CancellationToken cancellationToken
		) {
			this.CapturedRequestPath = request.RequestUri?.PathAndQuery;
			if (request.Content is not null) {
				this.CapturedRequestBody = await request.Content
					.ReadAsStringAsync(cancellationToken);
			}

			if (this.Throw is not null) {
				throw this.Throw;
			}

			return this.Response
				?? new HttpResponseMessage(HttpStatusCode.InternalServerError);
		}
	}

	private static (BlueskyClient Client, StubHandler Handler) _BuildClient() {
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

	private static BlueskyCredentials _Credentials() {
		return new BlueskyCredentials(BlueskyClientSpec._TestIdentifier, BlueskyClientSpec._TestAppPassword);
	}

	[Fact]
	public async Task ItShouldReturnAccountFailureWithPlainWordsReasonOn401() {
		var (client, handler) = BlueskyClientSpec._BuildClient();
		handler.Response = new HttpResponseMessage(HttpStatusCode.Unauthorized) {
			Content = new StringContent("{\"error\":\"InvalidRequest\"}"),
		};

		var result = await client.CreateSessionAsync(BlueskyClientSpec._Credentials());

		var refused = result.Should().BeOfType<BlueskySessionResult.AccountFailure>()
			.Subject;
		refused.Reason.Should().Be("credentials refused");
		refused.Reason.Should().NotContain(BlueskyClientSpec._TestAppPassword);
	}

	[Fact]
	public async Task ItShouldReturnAccountFailureForOther400ClassRefusals() {
		var (client, handler) = BlueskyClientSpec._BuildClient();
		handler.Response = new HttpResponseMessage(HttpStatusCode.BadRequest) {
			Content = new StringContent(
				"{\"error\":\"InvalidRequest\",\"error_description\":\"Unknown actor\"}"
			),
		};

		var result = await client.CreateSessionAsync(BlueskyClientSpec._Credentials());

		var refused = result.Should().BeOfType<BlueskySessionResult.AccountFailure>()
			.Subject;
		refused.Reason.Should().Be("account not found");
		refused.Reason.Should().NotContain(BlueskyClientSpec._TestAppPassword);
	}

	[Fact]
	public async Task ItShouldReturnTransientOn5xx() {
		var (client, handler) = BlueskyClientSpec._BuildClient();
		handler.Response = new HttpResponseMessage(
			BlueskyClientSpec._HttpStatusCodesBadGateway()
		);

		var result = await client.CreateSessionAsync(BlueskyClientSpec._Credentials());

		result.Should().BeOfType<BlueskySessionResult.Transient>();
	}

	[Fact]
	public async Task ItShouldReturnTransientOnNetworkFailureInsteadOfThrowing() {
		var (client, handler) = BlueskyClientSpec._BuildClient();
		handler.Throw = new HttpRequestException("connection refused");

		var result = await client.CreateSessionAsync(BlueskyClientSpec._Credentials());

		result.Should().BeOfType<BlueskySessionResult.Transient>();
	}

	[Fact]
	public async Task ItShouldResolveDidHandleAndSessionValuesOnSuccess() {
		var (client, handler) = BlueskyClientSpec._BuildClient();
		handler.Response = new HttpResponseMessage(HttpStatusCode.OK) {
			Content = new StringContent(
				"{\"did\":\"did:plc:abc123\",\"handle\":\"alice.test\","
				+ "\"accessJwt\":\"jwt-value\",\"refreshJwt\":\"r\"}"
			),
		};

		var result = await client.CreateSessionAsync(BlueskyClientSpec._Credentials());

		var success = result.Should().BeOfType<BlueskySessionResult.Success>()
			.Subject;
		success.Identity.Did.Should().Be("did:plc:abc123");
		success.Identity.Handle.Should().Be("alice.test");
		success.AccessJwt.Should().Be("jwt-value");
		success.PdsHost.Should().NotBeNullOrEmpty();
		success.PdsHost.Should().NotContain(BlueskyClientSpec._TestAppPassword);
	}

	[Fact]
	public async Task ItShouldSendIdentifierAndPasswordOnlyInTheRequestBody() {
		var (client, handler) = BlueskyClientSpec._BuildClient();
		handler.Response = new HttpResponseMessage(HttpStatusCode.OK) {
			Content = new StringContent(
				"{\"did\":\"did:plc:abc123\",\"handle\":\"alice.test\","
				+ "\"accessJwt\":\"j\"}"
			),
		};

		_ = await client.CreateSessionAsync(BlueskyClientSpec._Credentials());

		handler.CapturedRequestPath.Should().Contain(
			"com.atproto.server.createSession"
		);
		handler.CapturedRequestBody.Should().NotBeNull();
		Assert.NotNull(handler.CapturedRequestBody);
		handler.CapturedRequestBody.Should().Contain(BlueskyClientSpec._TestIdentifier);
		handler.CapturedRequestBody.Should().Contain(BlueskyClientSpec._TestAppPassword);
		// The atproto createSession contract requires the lowercase wire field
		// names; pin them so a property rename cannot silently break login.
		handler.CapturedRequestBody.Should().Contain("\"identifier\"");
		handler.CapturedRequestBody.Should().Contain("\"password\"");
	}

	[Theory]
	[InlineData(HttpStatusCode.Unauthorized, "credentials refused")]
	[InlineData(HttpStatusCode.BadRequest, "account not found")]
	public async Task ItShouldNeverEchoTheAppPasswordInAFailureReason(
		HttpStatusCode status,
		string expectedReason
	) {
		var (client, handler) = BlueskyClientSpec._BuildClient();
		handler.Response = new HttpResponseMessage(status);

		var result = await client.CreateSessionAsync(BlueskyClientSpec._Credentials());

		var refused = result.Should().BeOfType<BlueskySessionResult.AccountFailure>()
			.Subject;
		refused.Reason.Should().Be(expectedReason);
		refused.Reason.Should().NotContain(BlueskyClientSpec._TestAppPassword);
	}

	private static HttpStatusCode _HttpStatusCodesBadGateway() {
		return HttpStatusCode.BadGateway;
	}
}
