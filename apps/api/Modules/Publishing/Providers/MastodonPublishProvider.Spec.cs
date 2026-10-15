using System.Net;
using System.Text;
using System.Text.Json;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.Publishing.Providers.Capabilities;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Providers;

// Contract spec over a recording fake HTTP handler: no Mastodon instance is ever
// contacted. Pins the wire shape (statuses, async media, Idempotency-Key, reply
// chain) and the failure classification.
public sealed class MastodonPublishProviderSpec {
	private const string _Host = "https://social.example";
	private const string _Token = "tok-secret-123";
	private static readonly string _Key = PublicationIdempotencyKey.For(Guid.NewGuid());

	private static PublishRequest _Request() {
		return new PublishRequest {
			PublicationId = Guid.NewGuid(),
			IdempotencyKey = MastodonPublishProviderSpec._Key,
			PostBody = "hello fediverse",
			ScheduledAtUtc = DateTime.UtcNow,
			Provider = SocialProvider.Mastodon,
			Session = new SocialSession("1@social.example", "me@social.example", MastodonPublishProviderSpec._Token, MastodonPublishProviderSpec._Host),
		};
	}

	private static MastodonPublishProvider _Provider(HttpMessageHandler handler) {
		var services = new ServiceCollection();
		services.AddHttpClient(MastodonHostGuard.HttpClientName)
			.ConfigurePrimaryHttpMessageHandler(() => handler);
		var factory = services.BuildServiceProvider().GetRequiredService<IHttpClientFactory>();
		return new MastodonPublishProvider(factory, TimeSpan.Zero, 3);
	}

	private static HttpResponseMessage _Json(int status, string json) {
		return new HttpResponseMessage((HttpStatusCode)status) {
			Content = new StringContent(json, Encoding.UTF8, "application/json"),
		};
	}

	private static HttpResponseMessage _Status(string id) {
		return MastodonPublishProviderSpec._Json(
			200, $$"""{"id":"{{id}}","url":"https://social.example/@me/{{id}}"}"""
		);
	}

	private static bool _IsStatus(HttpRequestMessage request) {
		return request.RequestUri?.AbsolutePath == "/api/v1/statuses";
	}

	private static JsonElement _Body(RecordingHandler handler, int index) {
		return JsonDocument.Parse(handler.Bodies[index]).RootElement;
	}

	private static PublishMedia _Media(string? alt) {
		return new PublishMedia {
			Content = TestImages.Png(40, 30),
			ContentType = "image/png",
			AltText = alt,
			WidthPx = 40,
			HeightPx = 30,
		};
	}

	[Fact]
	public async Task ItShouldPostTheStatusWithBearerTokenAndIdempotencyKey() {
		var handler = new RecordingHandler(_ => MastodonPublishProviderSpec._Status("111"));
		var result = await MastodonPublishProviderSpec._Provider(handler)
			.PublishAsync(MastodonPublishProviderSpec._Request(), CancellationToken.None);

		var published = result.Should().BeOfType<PublishResult.Published>().Subject;
		published.RecordId.Should().Be("111");
		published.RecordUrl.Should().Be("https://social.example/@me/111");
		handler.Requests.Should().HaveCount(1);
		var request = handler.Requests[0];
		request.RequestUri?.ToString().Should().Be("https://social.example/api/v1/statuses");
		request.Headers.Authorization?.ToString().Should().Be($"Bearer {MastodonPublishProviderSpec._Token}");
		request.Headers.GetValues("Idempotency-Key").Should().Equal(MastodonPublishProviderSpec._Key);
		var body = MastodonPublishProviderSpec._Body(handler, 0);
		body.GetProperty("status").GetString().Should().Be("hello fediverse");
		body.GetProperty("visibility").GetString().Should().Be("public");
		body.TryGetProperty("in_reply_to_id", out _).Should().BeFalse();
		body.TryGetProperty("media_ids", out _).Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldUploadFourImagesWithAltTextThenAttachTheirIdsInOrder() {
		var uploads = 0;
		var handler = new RecordingHandler(request => {
			if (request.RequestUri?.AbsolutePath == "/api/v2/media") {
				uploads += 1;
				return MastodonPublishProviderSpec._Json(200, $$"""{"id":"m{{uploads}}","url":"https://cdn/m{{uploads}}.png"}""");
			}

			return MastodonPublishProviderSpec._Status("111");
		});
		var request = MastodonPublishProviderSpec._Request() with {
			Media = [
				MastodonPublishProviderSpec._Media("alt one"),
				MastodonPublishProviderSpec._Media("alt two"),
				MastodonPublishProviderSpec._Media(null),
				MastodonPublishProviderSpec._Media("alt four"),
			],
		};

		var result = await MastodonPublishProviderSpec._Provider(handler).PublishAsync(request, CancellationToken.None);

		result.Should().BeOfType<PublishResult.Published>();
		handler.Requests.Select(r => r.RequestUri?.AbsolutePath).Should().Equal(
			"/api/v2/media", "/api/v2/media", "/api/v2/media", "/api/v2/media", "/api/v1/statuses"
		);
		handler.Bodies[0].Should().Contain("alt one");
		handler.Bodies[1].Should().Contain("alt two");
		handler.Bodies[2].Should().NotContain("name=description");
		handler.Bodies[3].Should().Contain("alt four");
		MastodonPublishProviderSpec._Body(handler, 4).GetProperty("media_ids")
			.EnumerateArray().Select(id => id.GetString()).Should().Equal("m1", "m2", "m3", "m4");
	}

	[Fact]
	public async Task ItShouldPollAnAcceptedMediaUploadUntilItHasAUrl() {
		var polls = 0;
		var handler = new RecordingHandler(request => {
			if (request.RequestUri?.AbsolutePath == "/api/v2/media") {
				return MastodonPublishProviderSpec._Json(202, """{"id":"m1","url":null}""");
			}

			if (request.RequestUri?.AbsolutePath == "/api/v1/media/m1") {
				polls += 1;
				return polls < 3
					? MastodonPublishProviderSpec._Json(206, """{"id":"m1","url":null}""")
					: MastodonPublishProviderSpec._Json(200, """{"id":"m1","url":"https://cdn/m1.png"}""");
			}

			return MastodonPublishProviderSpec._Status("111");
		});
		var request = MastodonPublishProviderSpec._Request() with { Media = [MastodonPublishProviderSpec._Media("a")] };

		var result = await MastodonPublishProviderSpec._Provider(handler).PublishAsync(request, CancellationToken.None);

		result.Should().BeOfType<PublishResult.Published>();
		polls.Should().Be(3);
	}

	[Fact]
	public async Task ItShouldTreatAMediaUploadThatNeverFinishesAsTransient() {
		var handler = new RecordingHandler(request => request.RequestUri?.AbsolutePath == "/api/v2/media"
			? MastodonPublishProviderSpec._Json(202, """{"id":"m1","url":null}""")
			: MastodonPublishProviderSpec._Json(206, """{"id":"m1","url":null}"""));
		var request = MastodonPublishProviderSpec._Request() with { Media = [MastodonPublishProviderSpec._Media("a")] };

		var result = await MastodonPublishProviderSpec._Provider(handler).PublishAsync(request, CancellationToken.None);

		result.Should().BeOfType<PublishResult.TransientFailure>().Which.Cause.Should().Contain("still processing image 1");
		handler.Requests.Should().NotContain(r => MastodonPublishProviderSpec._IsStatus(r));
	}

	[Fact]
	public async Task ItShouldRefuseMoreImagesThanTheInstanceAdvertises() {
		var handler = new RecordingHandler(_ => MastodonPublishProviderSpec._Status("1"));
		var capability = ProviderCapabilityRegistry.Mastodon with { MaxImages = 1 };
		var request = MastodonPublishProviderSpec._Request() with {
			Capability = capability,
			Media = [MastodonPublishProviderSpec._Media("a"), MastodonPublishProviderSpec._Media("b")],
		};

		var result = await MastodonPublishProviderSpec._Provider(handler).PublishAsync(request, CancellationToken.None);

		result.Should().BeOfType<PublishResult.ContentFailure>();
		handler.Requests.Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldChainAThreadWithInReplyToAndPerSegmentKeys() {
		var created = 0;
		var handler = new RecordingHandler(_ => {
			created += 1;
			return MastodonPublishProviderSpec._Status($"s{created}");
		});
		var progress = new List<CompletedSegment>();
		var request = MastodonPublishProviderSpec._Request() with {
			FollowUpSegments = ["second", "third"],
			OnSegmentCompleted = (segment, _) => {
				progress.Add(segment);
				return Task.CompletedTask;
			},
		};

		var result = await MastodonPublishProviderSpec._Provider(handler).PublishAsync(request, CancellationToken.None);

		result.Should().BeOfType<PublishResult.Published>().Which.RecordId.Should().Be("s1");
		MastodonPublishProviderSpec._Body(handler, 1).GetProperty("in_reply_to_id").GetString().Should().Be("s1");
		MastodonPublishProviderSpec._Body(handler, 2).GetProperty("in_reply_to_id").GetString().Should().Be("s2");
		handler.Requests.Select(r => r.Headers.GetValues("Idempotency-Key").Single()).Should().Equal(
			MastodonPublishProviderSpec._Key, $"{MastodonPublishProviderSpec._Key}-s1", $"{MastodonPublishProviderSpec._Key}-s2"
		);
		progress.Select(p => p.Position).Should().Equal(0, 1, 2);
		progress.Select(p => p.RecordId).Should().Equal("s1", "s2", "s3");
	}

	[Fact]
	public async Task ItShouldResumeAThreadAfterTheLastStoredSegmentWithoutRepublishing() {
		var handler = new RecordingHandler(_ => MastodonPublishProviderSpec._Status("s3"));
		var request = MastodonPublishProviderSpec._Request() with {
			Media = [MastodonPublishProviderSpec._Media("a")],
			FollowUpSegments = ["second", "third"],
			CompletedSegments = [
				new CompletedSegment(0, "s1", string.Empty, "https://social.example/@me/s1"),
				new CompletedSegment(1, "s2", string.Empty, "https://social.example/@me/s2"),
			],
		};

		var result = await MastodonPublishProviderSpec._Provider(handler).PublishAsync(request, CancellationToken.None);

		handler.Requests.Should().HaveCount(1, "stored segments and their images are never sent again");
		MastodonPublishProviderSpec._Body(handler, 0).GetProperty("in_reply_to_id").GetString().Should().Be("s2");
		MastodonPublishProviderSpec._Body(handler, 0).GetProperty("status").GetString().Should().Be("third");
		// A resumed chain reports the identity of its root, like a fresh one.
		result.Should().BeOfType<PublishResult.Published>().Which.RecordId.Should().Be("s1");
	}

	[Fact]
	public async Task ItShouldReuseTheSameIdempotencyKeyWhenRetryingAfterAnAmbiguousFailure() {
		var attempt = 0;
		var handler = new RecordingHandler(_ => {
			attempt += 1;
			return attempt == 1
				? MastodonPublishProviderSpec._Json(502, """{"error":"bad gateway"}""")
				: MastodonPublishProviderSpec._Status("111");
		});
		var provider = MastodonPublishProviderSpec._Provider(handler);

		var first = await provider.PublishAsync(MastodonPublishProviderSpec._Request(), CancellationToken.None);
		var second = await provider.PublishAsync(MastodonPublishProviderSpec._Request(), CancellationToken.None);

		first.Should().BeOfType<PublishResult.Ambiguous>();
		second.Should().BeOfType<PublishResult.Published>();
		handler.Requests.Select(r => r.Headers.GetValues("Idempotency-Key").Single()).Distinct()
			.Should().Equal(MastodonPublishProviderSpec._Key);
	}

	[Theory]
	[InlineData(401)]
	[InlineData(403)]
	public async Task ItShouldMapAuthRefusalsToAnAccountFailureWithoutTheToken(int status) {
		var handler = new RecordingHandler(_ => MastodonPublishProviderSpec._Json(status, """{"error":"The access token is invalid"}"""));

		var result = await MastodonPublishProviderSpec._Provider(handler)
			.PublishAsync(MastodonPublishProviderSpec._Request(), CancellationToken.None);

		var failure = result.Should().BeOfType<PublishResult.AccountFailure>().Subject;
		failure.Cause.Should().NotContain(MastodonPublishProviderSpec._Token);
	}

	[Fact]
	public async Task ItShouldMapAnUnprocessableStatusToAContentFailureWithTheInstancesReason() {
		var handler = new RecordingHandler(_ => MastodonPublishProviderSpec._Json(422, """{"error":"Validation failed: Text character limit of 500 exceeded"}"""));

		var result = await MastodonPublishProviderSpec._Provider(handler)
			.PublishAsync(MastodonPublishProviderSpec._Request(), CancellationToken.None);

		result.Should().BeOfType<PublishResult.ContentFailure>().Which.Cause.Should().Contain("character limit of 500");
	}

	[Fact]
	public async Task ItShouldMapRateLimitingToTransientHonoringRetryAfter() {
		var handler = new RecordingHandler(_ => {
			var response = MastodonPublishProviderSpec._Json(429, """{"error":"Too many requests"}""");
			response.Headers.RetryAfter = new System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.FromSeconds(45));
			return response;
		});

		var result = await MastodonPublishProviderSpec._Provider(handler)
			.PublishAsync(MastodonPublishProviderSpec._Request(), CancellationToken.None);

		result.Should().BeOfType<PublishResult.TransientFailure>().Which.RetryAfter.Should().Be(TimeSpan.FromSeconds(45));
	}

	[Fact]
	public async Task ItShouldReadTheMastodonRateLimitResetWhenThereIsNoRetryAfter() {
		var reset = DateTimeOffset.UtcNow.AddMinutes(10).ToString("o", System.Globalization.CultureInfo.InvariantCulture);
		var handler = new RecordingHandler(_ => {
			var response = MastodonPublishProviderSpec._Json(429, """{"error":"Throttled"}""");
			response.Headers.Add("X-RateLimit-Reset", reset);
			return response;
		});

		var result = await MastodonPublishProviderSpec._Provider(handler)
			.PublishAsync(MastodonPublishProviderSpec._Request(), CancellationToken.None);

		var delay = result.Should().BeOfType<PublishResult.TransientFailure>().Subject.RetryAfter;
		delay.Should().BeGreaterThan(TimeSpan.FromMinutes(9)).And.BeLessThanOrEqualTo(TimeSpan.FromMinutes(10));
	}

	[Fact]
	public async Task ItShouldCapAFarAwayRateLimitReset() {
		var handler = new RecordingHandler(_ => {
			var response = MastodonPublishProviderSpec._Json(429, "{}");
			response.Headers.Add("X-RateLimit-Reset", DateTimeOffset.UtcNow.AddDays(2).ToString("o", System.Globalization.CultureInfo.InvariantCulture));
			return response;
		});

		var result = await MastodonPublishProviderSpec._Provider(handler)
			.PublishAsync(MastodonPublishProviderSpec._Request(), CancellationToken.None);

		result.Should().BeOfType<PublishResult.TransientFailure>().Which.RetryAfter.Should().Be(TimeSpan.FromHours(1));
	}

	[Fact]
	public async Task ItShouldTreatAnUnreadableSuccessBodyAsAmbiguousNotAnException() {
		var handler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.OK) {
			Content = new StringContent("<html>proxy error</html>", Encoding.UTF8, "text/html"),
		});

		var result = await MastodonPublishProviderSpec._Provider(handler)
			.PublishAsync(MastodonPublishProviderSpec._Request(), CancellationToken.None);

		result.Should().BeOfType<PublishResult.Ambiguous>();
	}

	[Fact]
	public async Task ItShouldMapTransportErrorsOnTheWriteToAmbiguous() {
		var handler = new RecordingHandler(_ => throw new HttpRequestException("connection reset"));

		var result = await MastodonPublishProviderSpec._Provider(handler)
			.PublishAsync(MastodonPublishProviderSpec._Request(), CancellationToken.None);

		result.Should().BeOfType<PublishResult.Ambiguous>();
	}

	[Fact]
	public async Task ItShouldIgnoreTheRateLimitResetOnA5xx() {
		var handler = new RecordingHandler(_ => {
			var response = MastodonPublishProviderSpec._Json(503, "{}");
			response.Headers.Add("X-RateLimit-Reset", DateTimeOffset.UtcNow.AddMinutes(10).ToString("o", System.Globalization.CultureInfo.InvariantCulture));
			return response;
		});

		var result = await MastodonPublishProviderSpec._Provider(handler)
			.PublishAsync(MastodonPublishProviderSpec._Request(), CancellationToken.None);

		result.Should().BeOfType<PublishResult.Ambiguous>().Which.RetryAfter
			.Should().BeNull("X-RateLimit-Reset only describes a 429 window");
	}

	[Fact]
	public async Task ItShouldStillHonourRetryAfterOnA5xx() {
		var handler = new RecordingHandler(_ => {
			var response = MastodonPublishProviderSpec._Json(503, "{}");
			response.Headers.RetryAfter = new System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.FromSeconds(30));
			return response;
		});

		var result = await MastodonPublishProviderSpec._Provider(handler)
			.PublishAsync(MastodonPublishProviderSpec._Request(), CancellationToken.None);

		result.Should().BeOfType<PublishResult.Ambiguous>().Which.RetryAfter.Should().Be(TimeSpan.FromSeconds(30));
	}

	[Fact]
	public async Task ItShouldCallOnBeforeWriteBeforeTheStatusPostAndAfterTheUpload() {
		var order = new List<string>();
		var handler = new RecordingHandler(request => {
			order.Add(request.RequestUri?.AbsolutePath ?? string.Empty);
			return MastodonPublishProviderSpec._IsStatus(request)
				? MastodonPublishProviderSpec._Status("1")
				: MastodonPublishProviderSpec._Json(200, """{"id":"m1","url":"https://x/m1"}""");
		});
		var request = MastodonPublishProviderSpec._Request() with {
			Media = [MastodonPublishProviderSpec._Media(null)],
			OnBeforeWrite = (position, _) => {
				order.Add($"journal {position}");
				return Task.CompletedTask;
			},
		};

		await MastodonPublishProviderSpec._Provider(handler).PublishAsync(request, CancellationToken.None);

		order.Should().Equal("/api/v2/media", "journal 0", "/api/v1/statuses");
	}

	[Fact]
	public async Task ItShouldReconcileAsSafeToResendWithinTheIdempotencyWindowWithoutAnyHttpCall() {
		var handler = new RecordingHandler(_ => throw new InvalidOperationException("no call expected"));

		var result = await MastodonPublishProviderSpec._Provider(handler).ReconcileAsync(
			MastodonPublishProviderSpec._Reconcile(TimeSpan.FromMinutes(10)), CancellationToken.None
		);

		result.Should().BeOfType<ReconcileResult.SafeToResend>();
		handler.Requests.Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldReconcileAsNeedsReviewBeyondTheIdempotencyWindowWithoutAnyHttpCall() {
		var handler = new RecordingHandler(_ => throw new InvalidOperationException("no call expected"));

		var result = await MastodonPublishProviderSpec._Provider(handler).ReconcileAsync(
			MastodonPublishProviderSpec._Reconcile(TimeSpan.FromMinutes(61)), CancellationToken.None
		);

		result.Should().BeOfType<ReconcileResult.NeedsReview>();
		handler.Requests.Should().BeEmpty();
	}

	private static ReconcileRequest _Reconcile(TimeSpan age) {
		return new ReconcileRequest {
			PublicationId = Guid.NewGuid(),
			IdempotencyKey = MastodonPublishProviderSpec._Key,
			SegmentPosition = 0,
			Provider = SocialProvider.Mastodon,
			Session = MastodonPublishProviderSpec._Request().Session,
			FirstAttemptAtUtc = DateTime.UtcNow - age,
		};
	}

	private sealed class RecordingHandler : HttpMessageHandler {
		private readonly Func<HttpRequestMessage, HttpResponseMessage> _Responder;

		public RecordingHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) {
			this._Responder = responder;
		}

		public List<HttpRequestMessage> Requests { get; } = [];

		public List<string> Bodies { get; } = [];

		protected override async Task<HttpResponseMessage> SendAsync(
			HttpRequestMessage request,
			CancellationToken cancellationToken
		) {
			var raw = request.Content is null
				? []
				: await request.Content.ReadAsByteArrayAsync(cancellationToken);
			this.Requests.Add(request);
			this.Bodies.Add(Encoding.UTF8.GetString(raw));
			return this._Responder(request);
		}
	}
}
