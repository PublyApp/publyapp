using System.Text;
using System.Text.Json;
using System.Web;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Modules.SocialAccounts.Lib;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Providers;

// Unit spec over faked HTTP (Bluesky is NEVER contacted for real). A recording
// HttpMessageHandler captures every request so the spec pins the exact wire shape
// of com.atproto.repo.createRecord and the four-way failure classification.
public sealed class BlueskyPublishProviderSpec {
	private const string PdsHost = "https://pds.example";
	private static readonly Guid PublicationId = Guid.NewGuid();
	private static readonly string IdempotencyKey =
		PublyApp.Api.Modules.Publishing.Lib.PublicationIdempotencyKey.For(PublicationId);

	private static DateTime ScheduledInstant() {
		return new DateTime(2030, 5, 1, 12, 30, 0, DateTimeKind.Utc);
	}

	private static PublishRequest NewRequest(SocialSession session) {
		return new PublishRequest {
			PublicationId = PublicationId,
			IdempotencyKey = IdempotencyKey,
			PostBody = "hello from the publishing slice",
			ScheduledAtUtc = ScheduledInstant(),
			Session = session,
		};
	}

	private static IHttpClientFactory FactoryFromHandler(HttpMessageHandler handler) {
		var services = new ServiceCollection();
		services.AddHttpClient(BlueskyPublishProvider.HttpClientName)
			.ConfigurePrimaryHttpMessageHandler(() => handler);
		return services.BuildServiceProvider()
			.GetRequiredService<IHttpClientFactory>();
	}

	private static async Task<(PublishResult Result, RecordingHandler Handler)> PublishOnceAsync(
		SocialSession session,
		Func<HttpRequestMessage, HttpResponseMessage> responder
	) {
		var handler = new RecordingHandler(responder);
		var provider = new BlueskyPublishProvider(FactoryFromHandler(handler));
		var result = await provider.PublishAsync(NewRequest(session), CancellationToken.None);
		return (result, handler);
	}

	private static SocialSession NewSession(
		string did = "did:plc:x",
		string handle = "@h.test",
		string accessJwt = "jwt-token",
		string pdsHost = PdsHost
	) {
		return new SocialSession(did, handle, accessJwt, pdsHost);
	}

	private static HttpResponseMessage SuccessResponse(string uri) {
		return JsonResponse(
			200,
			$$"""{"uri":"{{uri}}","cid":"bafy-ci"}"""
		);
	}

	private static HttpResponseMessage DuplicateResponse() {
		return JsonResponse(
			400,
			"""{"error":"InvalidRequest","message":"record_already_exists: duplicate rkey"}"""
		);
	}

	private static HttpResponseMessage JsonResponse(int status, string json) {
		return new HttpResponseMessage((System.Net.HttpStatusCode)status) {
			Content = new StringContent(json, Encoding.UTF8, "application/json"),
		};
	}

	[Fact]
	public async Task ItShouldPostCreateRecordWithRepoCollectionDeterministicRkeyAndText() {
		var (result, handler) = await PublishOnceAsync(
			NewSession(),
			(_) => SuccessResponse($"at://did:plc:x/app.bsky.feed.post/pub-{IdempotencyKey}")
		);

		handler.Requests.Should().HaveCount(1);
		var request = handler.Requests[0];
		request.Method.Should().Be(HttpMethod.Post);
		request.RequestUri!.ToString().Should().Be(
			$"{PdsHost}/xrpc/com.atproto.repo.createRecord"
		);

		var body = JsonDocument.Parse(handler.Bodies[0]).RootElement;
		body.GetProperty("repo").GetString().Should().Be("did:plc:x");
		body.GetProperty("collection").GetString().Should().Be("app.bsky.feed.post");
		body.GetProperty("rkey").GetString().Should().Be($"pub-{IdempotencyKey}");

		var record = body.GetProperty("record");
		record.GetProperty("$type").GetString().Should().Be("app.bsky.feed.post");
		record.GetProperty("text").GetString().Should().Be("hello from the publishing slice");
		record.GetProperty("createdAt").GetString().Should().Be(
			ScheduledInstant().ToString("o", System.Globalization.CultureInfo.InvariantCulture)
		);

		result.Should().BeOfType<PublishResult.Published>();
	}

	[Fact]
	public async Task ItShouldDeriveTheSameRkeyFromTheSamePublicationEveryTime() {
		async Task<string> CreateBodyAsync() {
			var (_, handler) = await PublishOnceAsync(
				NewSession(),
				(_) => SuccessResponse("at://did/x")
			);
			return handler.Bodies[0];
		}

		var firstRkey = JsonDocument.Parse(await CreateBodyAsync())
			.RootElement.GetProperty("rkey")
			.GetString() ?? string.Empty;
		var secondRkey = JsonDocument.Parse(await CreateBodyAsync())
			.RootElement.GetProperty("rkey")
			.GetString() ?? string.Empty;

		firstRkey.Should().Be(secondRkey);
		firstRkey.Should().MatchRegex("^pub-[0-9a-f]{32}$");
	}

	[Fact]
	public async Task ItShouldReturnPublishedWithRecordIdentityAndWebUrlOnSuccess() {
		var (result, _) = await PublishOnceAsync(
			NewSession(),
			(_) => SuccessResponse($"at://did:plc:x/app.bsky.feed.post/pub-{IdempotencyKey}")
		);

		var published = result.Should().BeOfType<PublishResult.Published>().Subject;
		published.RecordId.Should().Be($"at://did:plc:x/app.bsky.feed.post/pub-{IdempotencyKey}");
		published.RecordUrl.Should().Be($"https://bsky.app/profile/did:plc:x/post/pub-{IdempotencyKey}");
	}

	[Fact]
	public async Task ItShouldClassifyInvalidCredentialsAsAccountFailureWithoutLeakingTheToken() {
		var session = NewSession(accessJwt: "jwt-super-secret-value");
		var (result, handler) = await PublishOnceAsync(
			session,
			(_) => JsonResponse(
				401,
				"""{"error":"AuthenticationRequired","message":"invalid credentials"}"""
			)
		);

		var failure = result.Should().BeOfType<PublishResult.AccountFailure>().Subject;
		failure.Cause.Should().Contain("credential");
		failure.Cause.Should().NotContain(session.AccessJwt);
		handler.Bodies[0].Should().NotContain(session.AccessJwt);
		LastErrorSanitiser.Sanitize(failure.Cause).Should().Be(failure.Cause);
	}

	[Fact]
	public async Task ItShouldClassifyATooLongBodyAsContentFailure() {
		var (result, _) = await PublishOnceAsync(
			NewSession(),
			(_) => JsonResponse(
				400,
				"""{"error":"InvalidRequest","message":"text is too long (grapheme limit 300)"}"""
			)
		);

		result.Should().BeOfType<PublishResult.ContentFailure>();
	}

	[Fact]
	public async Task ItShouldClassifyServerAndTransportErrorsAsTransient() {
		var (serverResult, _) = await PublishOnceAsync(
			NewSession(),
			(_) => JsonResponse(503, """{"error":"TemporarilyUnavailable"}""")
		);
		serverResult.Should().BeOfType<PublishResult.TransientFailure>();

		var transportHandler = new RecordingHandler(
			(_) => throw new HttpRequestException("boom")
		);
		var transportProvider = new BlueskyPublishProvider(FactoryFromHandler(transportHandler));
		var transportResult = await transportProvider.PublishAsync(
			NewRequest(NewSession()),
			CancellationToken.None
		);
		transportResult.Should().BeOfType<PublishResult.TransientFailure>();
	}

	[Fact]
	public async Task ItShouldNotCreateADuplicateWhenTheRecordAlreadyExistsAfterATimeout() {
		// Crash-after-create simulation: the record ALREADY exists server-side under
		// the deterministic rkey. createRecord answers 400 already-exists; the
		// provider must read the EXISTING record back and report success carrying
		// THAT record's identity — never a second create.
		var createAttempts = 0;
		var (result, handler) = await PublishOnceAsync(
			NewSession(),
			request => {
				if (request.RequestUri!.AbsolutePath.EndsWith(
						"com.atproto.repo.createRecord",
						StringComparison.Ordinal
					)) {
					createAttempts += 1;
					return DuplicateResponse();
				}

				return SuccessResponse($"at://did:plc:x/app.bsky.feed.post/pub-{IdempotencyKey}");
			}
		);

		createAttempts.Should().Be(1, "an already-exists answer must never trigger a second create");
		handler.Requests.Should().HaveCount(2);

		var readBack = handler.Requests[1];
		readBack.Method.Should().Be(HttpMethod.Get);
		readBack.RequestUri!.AbsolutePath.Should().EndWith("com.atproto.repo.getRecord");
		var query = HttpUtility.ParseQueryString(readBack.RequestUri.Query);
		query["repo"].Should().Be("did:plc:x");
		query["collection"].Should().Be("app.bsky.feed.post");
		query["rkey"].Should().Be($"pub-{IdempotencyKey}");

		var success = result
			.Should()
			.BeOfType<PublishResult.AlreadyExistsTreatedAsPublished>()
			.Subject;
		success.RecordId.Should().Be($"at://did:plc:x/app.bsky.feed.post/pub-{IdempotencyKey}");
		success.RecordUrl.Should().Be($"https://bsky.app/profile/did:plc:x/post/pub-{IdempotencyKey}");
	}

	[Fact]
	public async Task ItShouldIgnoreHowTheCredentialWasObtained() {
		// The provider consumes ANY SocialSessionResult.Opened regardless of how the
		// credential was obtained: an app-password-shaped provider and an OAuth-shaped
		// provider must produce identical outcomes for the same publication.
		async Task<PublishResult> PublishThroughAsync(ISocialSessionProvider sessionProvider) {
			var opened = await sessionProvider.OpenSessionAsync(Guid.NewGuid(), CancellationToken.None);
			var session = opened.Should().BeOfType<SocialSessionResult.Opened>().Subject.Session;
			var handler = new RecordingHandler(
				(_) => SuccessResponse($"at://did:plc:same/app.bsky.feed.post/pub-{IdempotencyKey}")
			);
			var provider = new BlueskyPublishProvider(FactoryFromHandler(handler));
			return await provider.PublishAsync(NewRequest(session), CancellationToken.None);
		}

		var viaAppPassword = await PublishThroughAsync(new AppPasswordShapedSessionProvider());
		var viaOAuth = await PublishThroughAsync(new OAuthShapedSessionProvider());

		viaAppPassword.Should().Be(viaOAuth);
		viaAppPassword.Should().BeOfType<PublishResult.Published>();
	}

	private sealed class RecordingHandler
		: HttpMessageHandler {
		private readonly Func<HttpRequestMessage, HttpResponseMessage> _responder;

		public RecordingHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) {
			_responder = responder;
		}

		public List<HttpRequestMessage> Requests { get; } = [];

		public List<string> Bodies { get; } = [];

		protected override async Task<HttpResponseMessage> SendAsync(
			HttpRequestMessage request,
			CancellationToken cancellationToken
		) {
			var body = request.Content is null
				? string.Empty
				: await request.Content.ReadAsStringAsync(cancellationToken);
			Requests.Add(request);
			Bodies.Add(body);
			return _responder(request);
		}
	}

	/// <summary>Credential source #1: shaped like the Epic C app-password path.</summary>
	private sealed class AppPasswordShapedSessionProvider : ISocialSessionProvider {
		public Task<SocialSessionResult> OpenSessionAsync(
			Guid socialAccountId,
			CancellationToken cancellationToken
		) {
			var session = new SocialSession(
				"did:plc:same",
				"@app-password.test",
				$"jwt-app-password-{socialAccountId:N}",
				PdsHost
			);
			return Task.FromResult<SocialSessionResult>(new SocialSessionResult.Opened(session));
		}
	}

	/// <summary>Credential source #2: shaped like a future OAuth exchange.</summary>
	private sealed class OAuthShapedSessionProvider : ISocialSessionProvider {
		public Task<SocialSessionResult> OpenSessionAsync(
			Guid socialAccountId,
			CancellationToken cancellationToken
		) {
			var session = new SocialSession(
				"did:plc:same",
				"@oauth.test",
				$"jwt-oauth-exchange-{socialAccountId:N}",
				PdsHost
			);
			return Task.FromResult<SocialSessionResult>(new SocialSessionResult.Opened(session));
		}
	}
}
