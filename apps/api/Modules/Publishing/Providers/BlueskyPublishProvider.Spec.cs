using System.Text;
using System.Text.Json;
using System.Web;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.SocialAccounts.Lib;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Providers;

// Unit spec over faked HTTP (Bluesky is NEVER contacted for real). A recording
// HttpMessageHandler captures every request so the spec pins the exact wire shape
// of com.atproto.repo.createRecord and the four-way failure classification.
public sealed class BlueskyPublishProviderSpec {
	private const string _PdsHost = "https://pds.example";
	private static readonly Guid _PublicationId = Guid.NewGuid();
	private static readonly string _IdempotencyKey =
		PublyApp.Api.Modules.Publishing.Lib.PublicationIdempotencyKey.For(BlueskyPublishProviderSpec._PublicationId);

	private static DateTime _ScheduledInstant() {
		return new DateTime(2030, 5, 1, 12, 30, 0, DateTimeKind.Utc);
	}

	private static PublishRequest _NewRequest(SocialSession session) {
		return new PublishRequest {
			PublicationId = BlueskyPublishProviderSpec._PublicationId,
			IdempotencyKey = BlueskyPublishProviderSpec._IdempotencyKey,
			PostBody = "hello from the publishing slice",
			ScheduledAtUtc = BlueskyPublishProviderSpec._ScheduledInstant(),
			Session = session,
		};
	}

	private static IHttpClientFactory _FactoryFromHandler(HttpMessageHandler handler) {
		var services = new ServiceCollection();
		services.AddHttpClient(BlueskyPublishProvider.HttpClientName)
			.ConfigurePrimaryHttpMessageHandler(() => handler);
		return services.BuildServiceProvider()
			.GetRequiredService<IHttpClientFactory>();
	}

	private static async Task<(PublishResult Result, RecordingHandler Handler)> _PublishOnceAsync(
		SocialSession session,
		Func<HttpRequestMessage, HttpResponseMessage> responder
	) {
		var handler = new RecordingHandler(responder);
		var provider = new BlueskyPublishProvider(BlueskyPublishProviderSpec._FactoryFromHandler(handler));
		var result = await provider.PublishAsync(BlueskyPublishProviderSpec._NewRequest(session), CancellationToken.None);
		return (result, handler);
	}

	private static SocialSession _NewSession(
		string did = "did:plc:x",
		string handle = "@h.test",
		string accessJwt = "jwt-token",
		string pdsHost = BlueskyPublishProviderSpec._PdsHost
	) {
		return new SocialSession(did, handle, accessJwt, pdsHost);
	}

	private static HttpResponseMessage _SuccessResponse(string uri) {
		return BlueskyPublishProviderSpec._JsonResponse(
			200,
			$$"""{"uri":"{{uri}}","cid":"bafy-ci"}"""
		);
	}

	private static HttpResponseMessage _JsonResponse(int status, string json) {
		return new HttpResponseMessage((System.Net.HttpStatusCode)status) {
			Content = new StringContent(json, Encoding.UTF8, "application/json"),
		};
	}

	[Fact]
	public async Task ItShouldPostCreateRecordWithRepoCollectionDeterministicRkeyAndText() {
		var (result, handler) = await BlueskyPublishProviderSpec._PublishOnceAsync(
			BlueskyPublishProviderSpec._NewSession(),
			(_) => BlueskyPublishProviderSpec._SuccessResponse($"at://did:plc:x/app.bsky.feed.post/pub-{BlueskyPublishProviderSpec._IdempotencyKey}")
		);

		handler.Requests.Should().HaveCount(1);
		var request = handler.Requests[0];
		request.Method.Should().Be(HttpMethod.Post);
		request.RequestUri.Required().ToString().Should().Be(
			$"{BlueskyPublishProviderSpec._PdsHost}/xrpc/com.atproto.repo.createRecord"
		);

		var body = JsonDocument.Parse(handler.Bodies[0]).RootElement;
		body.GetProperty("repo").GetString().Should().Be("did:plc:x");
		body.GetProperty("collection").GetString().Should().Be("app.bsky.feed.post");
		body.GetProperty("rkey").GetString().Should().Be($"pub-{BlueskyPublishProviderSpec._IdempotencyKey}");

		var record = body.GetProperty("record");
		record.GetProperty("$type").GetString().Should().Be("app.bsky.feed.post");
		record.GetProperty("text").GetString().Should().Be("hello from the publishing slice");
		record.GetProperty("createdAt").GetString().Should().Be(
			BlueskyPublishProviderSpec._ScheduledInstant().ToString("o", System.Globalization.CultureInfo.InvariantCulture)
		);

		result.Should().BeOfType<PublishResult.Published>();
	}

	[Fact]
	public async Task ItShouldDeriveTheSameRkeyFromTheSamePublicationEveryTime() {
		async Task<string> CreateBodyAsync() {
			var (_, handler) = await BlueskyPublishProviderSpec._PublishOnceAsync(
				BlueskyPublishProviderSpec._NewSession(),
				(_) => BlueskyPublishProviderSpec._SuccessResponse("at://did/x")
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
		var (result, _) = await BlueskyPublishProviderSpec._PublishOnceAsync(
			BlueskyPublishProviderSpec._NewSession(),
			(_) => BlueskyPublishProviderSpec._SuccessResponse($"at://did:plc:x/app.bsky.feed.post/pub-{BlueskyPublishProviderSpec._IdempotencyKey}")
		);

		var published = result.Should().BeOfType<PublishResult.Published>().Subject;
		published.RecordId.Should().Be($"at://did:plc:x/app.bsky.feed.post/pub-{BlueskyPublishProviderSpec._IdempotencyKey}");
		published.RecordUrl.Should().Be($"https://bsky.app/profile/did:plc:x/post/pub-{BlueskyPublishProviderSpec._IdempotencyKey}");
	}

	[Fact]
	public async Task ItShouldClassifyInvalidCredentialsAsAccountFailureWithoutLeakingTheToken() {
		var session = BlueskyPublishProviderSpec._NewSession(accessJwt: "jwt-super-secret-value");
		var (result, handler) = await BlueskyPublishProviderSpec._PublishOnceAsync(
			session,
			(_) => BlueskyPublishProviderSpec._JsonResponse(
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
		var (result, _) = await BlueskyPublishProviderSpec._PublishOnceAsync(
			BlueskyPublishProviderSpec._NewSession(),
			(_) => BlueskyPublishProviderSpec._JsonResponse(
				400,
				"""{"error":"InvalidRequest","message":"text is too long (grapheme limit 300)"}"""
			)
		);

		result.Should().BeOfType<PublishResult.ContentFailure>();
	}

	[Fact]
	public async Task ItShouldClassifyServerAndTransportErrorsOnTheWriteAsAmbiguous() {
		var (serverResult, _) = await BlueskyPublishProviderSpec._PublishOnceAsync(
			BlueskyPublishProviderSpec._NewSession(),
			(_) => BlueskyPublishProviderSpec._JsonResponse(503, """{"error":"TemporarilyUnavailable"}""")
		);
		serverResult.Should().BeOfType<PublishResult.Ambiguous>("a 5xx write may have been applied");

		var transportHandler = new RecordingHandler(
			(_) => throw new HttpRequestException("boom")
		);
		var transportProvider = new BlueskyPublishProvider(BlueskyPublishProviderSpec._FactoryFromHandler(transportHandler));
		var transportResult = await transportProvider.PublishAsync(
			BlueskyPublishProviderSpec._NewRequest(BlueskyPublishProviderSpec._NewSession()),
			CancellationToken.None
		);
		transportResult.Should().BeOfType<PublishResult.Ambiguous>();
	}

	[Fact]
	public async Task ItShouldCallOnBeforeWriteImmediatelyBeforeTheCreateRecordRequest() {
		var order = new List<string>();
		var handler = new RecordingHandler(request => {
			order.Add("http " + request.Method);
			return BlueskyPublishProviderSpec._SuccessResponse("at://did:plc:x/app.bsky.feed.post/r");
		});
		var provider = new BlueskyPublishProvider(BlueskyPublishProviderSpec._FactoryFromHandler(handler));
		var request = BlueskyPublishProviderSpec._NewRequest(BlueskyPublishProviderSpec._NewSession()) with {
			OnBeforeWrite = (position, _) => {
				order.Add($"journal {position}");
				return Task.CompletedTask;
			},
		};

		await provider.PublishAsync(request, CancellationToken.None);

		order.Should().Equal("journal 0", "http POST");
	}

	[Fact]
	public async Task ItShouldReportATimeoutOnTheWriteAsAmbiguous() {
		var handler = new RecordingHandler(_ => throw new TaskCanceledException("timed out"));
		var provider = new BlueskyPublishProvider(BlueskyPublishProviderSpec._FactoryFromHandler(handler));

		var result = await provider.PublishAsync(
			BlueskyPublishProviderSpec._NewRequest(BlueskyPublishProviderSpec._NewSession()),
			CancellationToken.None
		);

		result.Should().BeOfType<PublishResult.Ambiguous>();
	}

	private static ReconcileRequest _ReconcileRequest(int position = 0) {
		return new ReconcileRequest {
			PublicationId = BlueskyPublishProviderSpec._PublicationId,
			IdempotencyKey = BlueskyPublishProviderSpec._IdempotencyKey,
			SegmentPosition = position,
			Session = BlueskyPublishProviderSpec._NewSession(),
			FirstAttemptAtUtc = DateTime.UtcNow,
		};
	}

	[Fact]
	public async Task ItShouldReconcileAsFoundWhenGetRecordFindsTheDeterministicRecordAndNeverWrite() {
		var handler = new RecordingHandler(_ => BlueskyPublishProviderSpec._JsonResponse(
			200, """{"uri":"at://did:plc:x/app.bsky.feed.post/pub-k","cid":"cid-9"}"""
		));
		var provider = new BlueskyPublishProvider(BlueskyPublishProviderSpec._FactoryFromHandler(handler));

		var result = await provider.ReconcileAsync(BlueskyPublishProviderSpec._ReconcileRequest(), CancellationToken.None);

		var found = result.Should().BeOfType<ReconcileResult.Found>().Subject;
		found.Segment.Cid.Should().Be("cid-9");
		handler.Requests.Should().ContainSingle().Which.Method.Should().Be(HttpMethod.Get);
		HttpUtility.ParseQueryString(handler.Requests[0].RequestUri.Required().Query)["rkey"]
			.Should().Be($"pub-{BlueskyPublishProviderSpec._IdempotencyKey}");
	}

	[Fact]
	public async Task ItShouldUseTheSegmentRkeyAndReportAbsentWhenReconcilingAThreadReply() {
		var handler = new RecordingHandler(_ => BlueskyPublishProviderSpec._JsonResponse(
			400, """{"error":"RecordNotFound","message":"Could not locate record"}"""
		));
		var provider = new BlueskyPublishProvider(BlueskyPublishProviderSpec._FactoryFromHandler(handler));

		var result = await provider.ReconcileAsync(BlueskyPublishProviderSpec._ReconcileRequest(2), CancellationToken.None);

		result.Should().BeOfType<ReconcileResult.SafeToResend>("the record is confirmed absent");
		HttpUtility.ParseQueryString(handler.Requests[0].RequestUri.Required().Query)["rkey"]
			.Should().Be($"pub-{BlueskyPublishProviderSpec._IdempotencyKey}-s2");
	}

	[Theory]
	[InlineData(503)]
	[InlineData(500)]
	public async Task ItShouldReconcileAsUnavailableWhenTheLookupItselfFails(int status) {
		var handler = new RecordingHandler(_ => BlueskyPublishProviderSpec._JsonResponse(
			status, """{"error":"InternalServerError"}"""
		));
		var provider = new BlueskyPublishProvider(BlueskyPublishProviderSpec._FactoryFromHandler(handler));

		var result = await provider.ReconcileAsync(BlueskyPublishProviderSpec._ReconcileRequest(), CancellationToken.None);

		result.Should().BeOfType<ReconcileResult.Unavailable>();
	}

	[Fact]
	public async Task ItShouldReconcileAsUnavailableOnATransportError() {
		var handler = new RecordingHandler(_ => throw new HttpRequestException("reset"));
		var provider = new BlueskyPublishProvider(BlueskyPublishProviderSpec._FactoryFromHandler(handler));

		var result = await provider.ReconcileAsync(BlueskyPublishProviderSpec._ReconcileRequest(), CancellationToken.None);

		result.Should().BeOfType<ReconcileResult.Unavailable>();
	}

	[Fact]
	public async Task ItShouldClassifyCreateRecord429AsTransient() {
		var (result, _) = await BlueskyPublishProviderSpec._PublishOnceAsync(
			BlueskyPublishProviderSpec._NewSession(),
			(_) => BlueskyPublishProviderSpec._JsonResponse(429, """{"error":"RateLimitExceeded"}""")
		);

		result.Should().BeOfType<PublishResult.TransientFailure>();
	}

	// Crash-after-create proof, adversarial-mutation target (spec §6 D1): the fake
	// PDS below STORES records by rkey like a real atproto repo, so a duplicate is
	// OBSERVABLE. Each simulated run derives its idempotency key FRESH from the
	// publication id — exactly what an engine retry does — instead of sharing one
	// precomputed constant, so a non-deterministic key makes the second create
	// store a SECOND record and turns this spec red.
	[Fact]
	public async Task ItShouldNotCreateADuplicateWhenTheRecordAlreadyExistsAfterATimeout() {
		PublishRequest FreshRequest() {
			return new PublishRequest {
				PublicationId = BlueskyPublishProviderSpec._PublicationId,
				IdempotencyKey =
					PublyApp.Api.Modules.Publishing.Lib.PublicationIdempotencyKey.For(
						BlueskyPublishProviderSpec._PublicationId
					),
				PostBody = "hello from the publishing slice",
				ScheduledAtUtc = BlueskyPublishProviderSpec._ScheduledInstant(),
				Session = BlueskyPublishProviderSpec._NewSession(),
			};
		}

		var fakePds = new RkeyStoringFakePds();
		var provider = new BlueskyPublishProvider(BlueskyPublishProviderSpec._FactoryFromHandler(fakePds));

		var first = await provider.PublishAsync(FreshRequest(), CancellationToken.None);
		var second = await provider.PublishAsync(FreshRequest(), CancellationToken.None);

		first.Should().BeOfType<PublishResult.Published>("the first delivery creates the record");
		fakePds.StoredRkeys.Should().ContainSingle(
			"the deterministic key means the replay collides with the SAME record"
		);
		fakePds.CreateAttempts.Should().Be(2, "two runs, but only ONE stored record");

		second.Should().BeOfType<PublishResult.AlreadyExistsTreatedAsPublished>();
		var adopted = second.Should()
			.BeOfType<PublishResult.AlreadyExistsTreatedAsPublished>().Subject;
		adopted.RecordId.Should().Be($"at://did:plc:x/app.bsky.feed.post/pub-{BlueskyPublishProviderSpec._IdempotencyKey}");
		adopted.RecordUrl.Should().Be($"https://bsky.app/profile/did:plc:x/post/pub-{BlueskyPublishProviderSpec._IdempotencyKey}");

		// The adoption went through the documented read-back: GET getRecord carrying
		// the freshly derived rkey.
		var readBack = fakePds.Requests.Should().ContainSingle(request =>
			request.Method == HttpMethod.Get).Subject;
		var readBackUri = readBack.RequestUri.Required();
		readBackUri.AbsolutePath.Should().EndWith("com.atproto.repo.getRecord");
		var query = HttpUtility.ParseQueryString(readBackUri.Query);
		query["repo"].Should().Be("did:plc:x");
		query["collection"].Should().Be("app.bsky.feed.post");
		query["rkey"].Should().Be($"pub-{BlueskyPublishProviderSpec._IdempotencyKey}");
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
				(_) => BlueskyPublishProviderSpec._SuccessResponse($"at://did:plc:same/app.bsky.feed.post/pub-{BlueskyPublishProviderSpec._IdempotencyKey}")
			);
			var provider = new BlueskyPublishProvider(BlueskyPublishProviderSpec._FactoryFromHandler(handler));
			return await provider.PublishAsync(BlueskyPublishProviderSpec._NewRequest(session), CancellationToken.None);
		}

		var viaAppPassword = await PublishThroughAsync(new AppPasswordShapedSessionProvider());
		var viaOAuth = await PublishThroughAsync(new OAuthShapedSessionProvider());

		viaAppPassword.Should().Be(viaOAuth);
		viaAppPassword.Should().BeOfType<PublishResult.Published>();
	}

	// --- images (#2170) -------------------------------------------------------------

	private static bool _IsUpload(HttpRequestMessage request) {
		return request.RequestUri.Required().AbsolutePath.EndsWith(
			"com.atproto.repo.uploadBlob", StringComparison.Ordinal
		);
	}

	private static HttpResponseMessage _BlobResponse(int number, string mime = "image/png") {
		return BlueskyPublishProviderSpec._JsonResponse(
			200,
			$$$"""{"blob":{"$type":"blob","ref":{"$link":"bafkrei-{{{number}}}"},"mimeType":"{{{mime}}}","size":{{{number}}}00}}"""
		);
	}

	private static PublishMedia _Media(byte[] content, string contentType, string? alt, int width, int height) {
		return new PublishMedia {
			Content = content,
			ContentType = contentType,
			AltText = alt,
			WidthPx = width,
			HeightPx = height,
		};
	}

	private static async Task<(PublishResult Result, RecordingHandler Handler)> _PublishImagesAsync(
		IReadOnlyList<PublishMedia> media,
		Func<HttpRequestMessage, int, HttpResponseMessage> responder
	) {
		var uploads = 0;
		var handler = new RecordingHandler(request => {
			if (BlueskyPublishProviderSpec._IsUpload(request)) {
				uploads += 1;
				return responder(request, uploads);
			}

			return BlueskyPublishProviderSpec._SuccessResponse(
				$"at://did:plc:x/app.bsky.feed.post/pub-{BlueskyPublishProviderSpec._IdempotencyKey}"
			);
		});
		var provider = new BlueskyPublishProvider(BlueskyPublishProviderSpec._FactoryFromHandler(handler));
		var request = BlueskyPublishProviderSpec._NewRequest(BlueskyPublishProviderSpec._NewSession()) with {
			Media = media,
		};
		return (await provider.PublishAsync(request, CancellationToken.None), handler);
	}

	[Fact]
	public async Task ItShouldUploadEachImageInOrderThenCreateOneRecordWithTheImagesEmbed() {
		var first = TestImages.Png(40, 30);
		var second = TestImages.Jpeg(64, 48);
		var (result, handler) = await BlueskyPublishProviderSpec._PublishImagesAsync(
			[
				BlueskyPublishProviderSpec._Media(first, "image/png", "a red door", 40, 30),
				BlueskyPublishProviderSpec._Media(second, "image/jpeg", null, 64, 48),
			],
			(request, number) => BlueskyPublishProviderSpec._BlobResponse(
				number, number == 1 ? "image/png" : "image/jpeg"
			)
		);

		result.Should().BeOfType<PublishResult.Published>();
		handler.Requests.Should().HaveCount(3, "two blob uploads then ONE createRecord");
		BlueskyPublishProviderSpec._IsUpload(handler.Requests[0]).Should().BeTrue();
		BlueskyPublishProviderSpec._IsUpload(handler.Requests[1]).Should().BeTrue();
		handler.Requests[2].RequestUri.Required().AbsolutePath
			.Should().EndWith("com.atproto.repo.createRecord");

		handler.Requests[0].Content.Required().Headers.ContentType.Required().MediaType
			.Should().Be("image/png");
		handler.Requests[1].Content.Required().Headers.ContentType.Required().MediaType
			.Should().Be("image/jpeg");
		handler.Requests[0].Headers.Authorization.Required().Parameter.Should().Be("jwt-token");
		handler.RawBodies[0].Should().Equal(first, "an image under the limit is uploaded untouched");

		var embed = JsonDocument.Parse(handler.Bodies[2]).RootElement
			.GetProperty("record").GetProperty("embed");
		embed.GetProperty("$type").GetString().Should().Be("app.bsky.embed.images");
		var images = embed.GetProperty("images").EnumerateArray().ToList();
		images.Should().HaveCount(2);
		images[0].GetProperty("alt").GetString().Should().Be("a red door");
		images[0].GetProperty("image").GetProperty("ref").GetProperty("$link").GetString()
			.Should().Be("bafkrei-1");
		images[0].GetProperty("aspectRatio").GetProperty("width").GetInt32().Should().Be(40);
		images[0].GetProperty("aspectRatio").GetProperty("height").GetInt32().Should().Be(30);
		images[1].GetProperty("alt").GetString().Should().BeEmpty("empty alt is allowed");
		images[1].GetProperty("image").GetProperty("ref").GetProperty("$link").GetString()
			.Should().Be("bafkrei-2");
	}

	[Fact]
	public async Task ItShouldNotSendAnEmbedForATextOnlyPost() {
		var (_, handler) = await BlueskyPublishProviderSpec._PublishOnceAsync(
			BlueskyPublishProviderSpec._NewSession(),
			(_) => BlueskyPublishProviderSpec._SuccessResponse("at://did/x")
		);

		JsonDocument.Parse(handler.Bodies[0]).RootElement.GetProperty("record")
			.TryGetProperty("embed", out _).Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldReEncodeAnImageOverOneMillionBytesToFit() {
		var big = TestImages.NoisyJpeg(1600, 1200);
		big.Length.Should().BeGreaterThan(1_000_000, "the fixture must exceed the blob limit");

		var (result, handler) = await BlueskyPublishProviderSpec._PublishImagesAsync(
			[BlueskyPublishProviderSpec._Media(big, "image/jpeg", "noise", 1600, 1200)],
			(request, number) => BlueskyPublishProviderSpec._BlobResponse(number, "image/jpeg")
		);

		result.Should().BeOfType<PublishResult.Published>();
		handler.RawBodies[0].Length.Should().BeLessThanOrEqualTo(1_000_000);
		var aspect = JsonDocument.Parse(handler.Bodies[1]).RootElement
			.GetProperty("record").GetProperty("embed").GetProperty("images")[0]
			.GetProperty("aspectRatio");
		var width = aspect.GetProperty("width").GetInt32();
		var height = aspect.GetProperty("height").GetInt32();
		((double)width / height).Should().BeApproximately(1600d / 1200d, 0.02);
	}

	[Fact]
	public async Task ItShouldFailWithAContentCauseNamingTheImageWhenOneCannotBeFitted() {
		var undecodable = new byte[1_500_000];
		new Random(7).NextBytes(undecodable);

		var (result, handler) = await BlueskyPublishProviderSpec._PublishImagesAsync(
			[
				BlueskyPublishProviderSpec._Media(TestImages.Png(20, 20), "image/png", null, 20, 20),
				BlueskyPublishProviderSpec._Media(undecodable, "image/png", null, 900, 900),
			],
			(request, number) => BlueskyPublishProviderSpec._BlobResponse(number)
		);

		var failure = result.Should().BeOfType<PublishResult.ContentFailure>().Subject;
		failure.Cause.Should().Contain("image 2");
		handler.Requests.Should().NotContain(
			request => request.RequestUri.Required().AbsolutePath.EndsWith("createRecord", StringComparison.Ordinal),
			"no record is created when an image cannot be published"
		);
	}

	[Fact]
	public async Task ItShouldRefuseAnImageTypeBlueskyDoesNotAccept() {
		var (result, handler) = await BlueskyPublishProviderSpec._PublishImagesAsync(
			[BlueskyPublishProviderSpec._Media([1, 2, 3], "image/gif", null, 1, 1)],
			(request, number) => BlueskyPublishProviderSpec._BlobResponse(number)
		);

		result.Should().BeOfType<PublishResult.ContentFailure>().Subject.Cause
			.Should().Contain("image 1");
		handler.Requests.Should().BeEmpty();
	}

	[Theory]
	[InlineData(401)]
	[InlineData(403)]
	public async Task ItShouldClassifyABlobUpload401Or403AsAccountFailure(int status) {
		var (result, handler) = await BlueskyPublishProviderSpec._PublishImagesAsync(
			[BlueskyPublishProviderSpec._Media(TestImages.Png(10, 10), "image/png", null, 10, 10)],
			(request, number) => BlueskyPublishProviderSpec._JsonResponse(
				status, """{"error":"AuthenticationRequired","message":"bad token"}"""
			)
		);

		result.Should().BeOfType<PublishResult.AccountFailure>();
		handler.Requests.Should().ContainSingle("the record is never created after a refused upload");
	}

	[Theory]
	[InlineData(400)]
	[InlineData(413)]
	public async Task ItShouldClassifyABlobUpload400Or413AsContentFailureNamingTheImage(int status) {
		var (result, _) = await BlueskyPublishProviderSpec._PublishImagesAsync(
			[
				BlueskyPublishProviderSpec._Media(TestImages.Png(10, 10), "image/png", null, 10, 10),
				BlueskyPublishProviderSpec._Media(TestImages.Png(11, 11), "image/png", null, 11, 11),
			],
			(request, number) => number == 1
				? BlueskyPublishProviderSpec._BlobResponse(number)
				: BlueskyPublishProviderSpec._JsonResponse(
					status, """{"error":"BlobTooLarge","message":"blob too large"}"""
				)
		);

		result.Should().BeOfType<PublishResult.ContentFailure>().Subject.Cause
			.Should().Contain("image 2");
	}

	[Fact]
	public async Task ItShouldClassifyABlobUpload503AsTransient() {
		var (result, _) = await BlueskyPublishProviderSpec._PublishImagesAsync(
			[BlueskyPublishProviderSpec._Media(TestImages.Png(10, 10), "image/png", null, 10, 10)],
			(request, number) => BlueskyPublishProviderSpec._JsonResponse(
				503, """{"error":"TemporarilyUnavailable"}"""
			)
		);

		result.Should().BeOfType<PublishResult.TransientFailure>();
	}

	[Fact]
	public async Task ItShouldCreateExactlyOneRecordWhenARetryFollowsAFailedUpload() {
		var creates = 0;
		var attempt = 0;
		var handler = new RecordingHandler(request => {
			if (BlueskyPublishProviderSpec._IsUpload(request)) {
				return attempt == 1
					? BlueskyPublishProviderSpec._JsonResponse(503, """{"error":"TemporarilyUnavailable"}""")
					: BlueskyPublishProviderSpec._BlobResponse(attempt);
			}

			creates += 1;
			return BlueskyPublishProviderSpec._SuccessResponse("at://did:plc:x/app.bsky.feed.post/pub-k");
		});
		var provider = new BlueskyPublishProvider(BlueskyPublishProviderSpec._FactoryFromHandler(handler));
		var request = BlueskyPublishProviderSpec._NewRequest(BlueskyPublishProviderSpec._NewSession()) with {
			Media = [BlueskyPublishProviderSpec._Media(TestImages.Png(10, 10), "image/png", "x", 10, 10)],
		};

		attempt = 1;
		var first = await provider.PublishAsync(request, CancellationToken.None);
		attempt = 2;
		var second = await provider.PublishAsync(request, CancellationToken.None);

		first.Should().BeOfType<PublishResult.TransientFailure>();
		second.Should().BeOfType<PublishResult.Published>();
		creates.Should().Be(1, "the failed upload never reached createRecord, so the retry creates the only record");
	}

	private static PublishRequest _ThreadRequest(
		IReadOnlyList<string> followUps,
		IReadOnlyList<CompletedSegment>? completed = null,
		Func<CompletedSegment, CancellationToken, Task>? onCompleted = null
	) {
		return new PublishRequest {
			PublicationId = BlueskyPublishProviderSpec._PublicationId,
			IdempotencyKey = BlueskyPublishProviderSpec._IdempotencyKey,
			PostBody = "segment one",
			ScheduledAtUtc = BlueskyPublishProviderSpec._ScheduledInstant(),
			Session = BlueskyPublishProviderSpec._NewSession(),
			FollowUpSegments = followUps,
			CompletedSegments = completed ?? [],
			OnSegmentCompleted = onCompleted,
		};
	}

	private static JsonElement _Record(string body) {
		return JsonDocument.Parse(body).RootElement.GetProperty("record");
	}

	[Fact]
	public async Task ItShouldPublishAThreadAsAReplyChainWithRootAndParentStrongRefs() {
		var created = 0;
		var handler = new RecordingHandler(request => {
			created += 1;
			var rkey = $"pub-{BlueskyPublishProviderSpec._IdempotencyKey}"
				+ (created == 1 ? string.Empty : $"-s{created - 1}");
			return BlueskyPublishProviderSpec._JsonResponse(
				200,
				$$"""{"uri":"at://did:plc:x/app.bsky.feed.post/{{rkey}}","cid":"cid-{{created}}"}"""
			);
		});
		var progress = new List<CompletedSegment>();
		var provider = new BlueskyPublishProvider(BlueskyPublishProviderSpec._FactoryFromHandler(handler));

		var result = await provider.PublishAsync(
			BlueskyPublishProviderSpec._ThreadRequest(
				["segment two", "segment three"],
				onCompleted: (segment, _) => {
					progress.Add(segment);
					return Task.CompletedTask;
				}
			),
			CancellationToken.None
		);

		var key = BlueskyPublishProviderSpec._IdempotencyKey;
		handler.Bodies.Should().HaveCount(3);
		var first = BlueskyPublishProviderSpec._Record(handler.Bodies[0]);
		first.TryGetProperty("reply", out _).Should().BeFalse("the first segment is the root");

		var second = BlueskyPublishProviderSpec._Record(handler.Bodies[1]);
		second.GetProperty("text").GetString().Should().Be("segment two");
		var secondReply = second.GetProperty("reply");
		secondReply.GetProperty("root").GetProperty("uri").GetString()
			.Should().Be($"at://did:plc:x/app.bsky.feed.post/pub-{key}");
		secondReply.GetProperty("root").GetProperty("cid").GetString().Should().Be("cid-1");
		secondReply.GetProperty("parent").GetProperty("uri").GetString()
			.Should().Be($"at://did:plc:x/app.bsky.feed.post/pub-{key}");
		secondReply.GetProperty("parent").GetProperty("cid").GetString().Should().Be("cid-1");

		var third = BlueskyPublishProviderSpec._Record(handler.Bodies[2]);
		var thirdReply = third.GetProperty("reply");
		thirdReply.GetProperty("root").GetProperty("cid").GetString().Should().Be("cid-1");
		thirdReply.GetProperty("parent").GetProperty("uri").GetString()
			.Should().Be($"at://did:plc:x/app.bsky.feed.post/pub-{key}-s1");
		thirdReply.GetProperty("parent").GetProperty("cid").GetString().Should().Be("cid-2");

		JsonDocument.Parse(handler.Bodies[1]).RootElement.GetProperty("rkey").GetString()
			.Should().Be($"pub-{key}-s1");
		JsonDocument.Parse(handler.Bodies[2]).RootElement.GetProperty("rkey").GetString()
			.Should().Be($"pub-{key}-s2");
		second.GetProperty("createdAt").GetString().Should().Be(
			BlueskyPublishProviderSpec._ScheduledInstant().AddMilliseconds(1)
				.ToString("o", System.Globalization.CultureInfo.InvariantCulture)
		);

		progress.Select(segment => segment.Position).Should().Equal(0, 1, 2);
		result.Should().BeOfType<PublishResult.Published>().Which.RecordId
			.Should().Be($"at://did:plc:x/app.bsky.feed.post/pub-{key}");
	}

	[Fact]
	public async Task ItShouldStopTheChainAtAFailingSegmentAndResumeOnlyTheRest() {
		var key = BlueskyPublishProviderSpec._IdempotencyKey;
		var created = 0;
		var failThird = true;
		var handler = new RecordingHandler(request => {
			if (created == 2 && failThird) {
				return BlueskyPublishProviderSpec._JsonResponse(
					400, """{"error":"InvalidRequest","message":"bad record"}"""
				);
			}

			created += 1;
			return BlueskyPublishProviderSpec._JsonResponse(
				200,
				$$"""{"uri":"at://did:plc:x/app.bsky.feed.post/r{{created}}","cid":"cid-{{created}}"}"""
			);
		});
		var progress = new List<CompletedSegment>();
		var provider = new BlueskyPublishProvider(BlueskyPublishProviderSpec._FactoryFromHandler(handler));

		var failed = await provider.PublishAsync(
			BlueskyPublishProviderSpec._ThreadRequest(
				["two", "three"],
				onCompleted: (segment, _) => {
					progress.Add(segment);
					return Task.CompletedTask;
				}
			),
			CancellationToken.None
		);

		failed.Should().BeOfType<PublishResult.ContentFailure>();
		progress.Select(segment => segment.Position).Should().Equal(0, 1);

		failThird = false;
		handler.Bodies.Clear();
		var resumed = await provider.PublishAsync(
			BlueskyPublishProviderSpec._ThreadRequest(["two", "three"], completed: progress),
			CancellationToken.None
		);

		resumed.Should().BeOfType<PublishResult.Published>().Which.RecordId
			.Should().Be("at://did:plc:x/app.bsky.feed.post/r1", "the thread root stays segment one");
		handler.Bodies.Should().ContainSingle("only the unpublished segment is created");
		var record = BlueskyPublishProviderSpec._Record(handler.Bodies[0]);
		record.GetProperty("text").GetString().Should().Be("three");
		record.GetProperty("reply").GetProperty("parent").GetProperty("cid").GetString()
			.Should().Be("cid-2", "the chain continues from the stored uri and cid");
		record.GetProperty("reply").GetProperty("root").GetProperty("cid").GetString()
			.Should().Be("cid-1");
		JsonDocument.Parse(handler.Bodies[0]).RootElement.GetProperty("rkey").GetString()
			.Should().Be($"pub-{key}-s2");
	}

	[Fact]
	public async Task ItShouldReadBackASegmentCreatedBeforeItWasRecordedAndContinueWithoutDuplicates() {
		var fakePds = new RkeyStoringFakePds();
		var provider = new BlueskyPublishProvider(BlueskyPublishProviderSpec._FactoryFromHandler(fakePds));

		// A previous attempt created segments one and two, but only recorded one.
		var firstAttempt = new List<CompletedSegment>();
		await provider.PublishAsync(
			BlueskyPublishProviderSpec._ThreadRequest(
				["two"],
				onCompleted: (segment, _) => {
					firstAttempt.Add(segment);
					return Task.CompletedTask;
				}
			),
			CancellationToken.None
		);
		fakePds.StoredRkeys.Should().HaveCount(2);

		var recorded = new List<CompletedSegment>();
		var resumed = await provider.PublishAsync(
			BlueskyPublishProviderSpec._ThreadRequest(
				["two", "three"],
				completed: [firstAttempt[0]],
				onCompleted: (segment, _) => {
					recorded.Add(segment);
					return Task.CompletedTask;
				}
			),
			CancellationToken.None
		);

		resumed.Should().BeOfType<PublishResult.Published>();
		fakePds.StoredRkeys.Should().HaveCount(3, "segment two collided and was read back, not duplicated");
		recorded.Select(segment => segment.Position).Should().Equal(1, 2);
		recorded[0].Cid.Should().Be("bafy-existing");
	}

	[Fact]
	public async Task ItShouldNotContinueAThreadFromAReadBackRecordWithoutACid() {
		var handler = new RecordingHandler(request => request.Method == HttpMethod.Post
			? BlueskyPublishProviderSpec._JsonResponse(
				400, """{"error":"InvalidRequest","message":"record_already_exists"}"""
			)
			: BlueskyPublishProviderSpec._JsonResponse(
				200, """{"uri":"at://did:plc:x/app.bsky.feed.post/r0"}"""
			));
		var provider = new BlueskyPublishProvider(BlueskyPublishProviderSpec._FactoryFromHandler(handler));

		var result = await provider.PublishAsync(
			BlueskyPublishProviderSpec._ThreadRequest(["two"]),
			CancellationToken.None
		);

		result.Should().BeOfType<PublishResult.TransientFailure>();
		handler.Requests.Count(request => request.Method == HttpMethod.Post)
			.Should().Be(1, "no reply is sent with an empty parent cid");
	}

	private sealed class RecordingHandler
		: HttpMessageHandler {
		private readonly Func<HttpRequestMessage, HttpResponseMessage> _Responder;

		public RecordingHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) {
			this._Responder = responder;
		}

		public List<HttpRequestMessage> Requests { get; } = [];

		public List<string> Bodies { get; } = [];

		public List<byte[]> RawBodies { get; } = [];

		protected override async Task<HttpResponseMessage> SendAsync(
			HttpRequestMessage request,
			CancellationToken cancellationToken
		) {
			var raw = request.Content is null
				? []
				: await request.Content.ReadAsByteArrayAsync(cancellationToken);
			this.Requests.Add(request);
			this.RawBodies.Add(raw);
			this.Bodies.Add(Encoding.UTF8.GetString(raw));
			return this._Responder(request);
		}
	}

	/// <summary>
	/// A fake PDS that behaves like a real atproto repo: createRecord STORES the
	/// record under its rkey, and a second create under the SAME rkey answers the
	/// duplicate error while a DIFFERENT rkey stores a SECOND record — making a
	/// non-deterministic key observably produce duplicates.
	/// </summary>
	private sealed class RkeyStoringFakePds : HttpMessageHandler {
		private static readonly string _DuplicateBody =
			"""{"error":"InvalidRequest","message":"record_already_exists: duplicate rkey"}""";

		public List<HttpRequestMessage> Requests { get; } = [];

		public List<string> StoredRkeys { get; } = [];

		public int CreateAttempts { get; private set; }

		protected override async Task<HttpResponseMessage> SendAsync(
			HttpRequestMessage request,
			CancellationToken cancellationToken
		) {
			this.Requests.Add(request);

			if (request.RequestUri.Required().AbsolutePath.EndsWith(
					"com.atproto.repo.createRecord",
					StringComparison.Ordinal
				)) {
				this.CreateAttempts += 1;
				var body = await request.Content.Required().ReadAsStringAsync(cancellationToken);
				var rkey = BlueskyPublishProviderSpec.RkeyStoringFakePds._ExtractRkey(body);
				if (this.StoredRkeys.Contains(rkey)) {
					return _JsonResponse(400, BlueskyPublishProviderSpec.RkeyStoringFakePds._DuplicateBody);
				}

				this.StoredRkeys.Add(rkey);
				return _JsonResponse(
					200,
					$$"""{"uri":"at://did:plc:x/app.bsky.feed.post/{{rkey}}","cid":"bafy-{{this.CreateAttempts}}"}"""
				);
			}

			var requestUri = request.RequestUri.Required();
			var query = HttpUtility.ParseQueryString(requestUri.Query);
			return _JsonResponse(
				200,
				$$"""{"uri":"at://did:plc:x/app.bsky.feed.post/{{query["rkey"]}}","cid":"bafy-existing"}"""
			);
		}

		private static string _ExtractRkey(string createRecordBody) {
			using var document = JsonDocument.Parse(createRecordBody);
			var rkey = document.RootElement.GetProperty("rkey").GetString();
			if (rkey is null) {
				throw new InvalidOperationException("createRecord body carried no rkey.");
			}

			return rkey;
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
				_PdsHost
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
				_PdsHost
			);
			return Task.FromResult<SocialSessionResult>(new SocialSessionResult.Opened(session));
		}
	}
}
