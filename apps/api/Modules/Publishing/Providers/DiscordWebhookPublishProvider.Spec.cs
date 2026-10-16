using System.Net;
using System.Text;
using System.Text.Json;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Publishing.Providers.Capabilities;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Providers.Discord;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Providers;

// Contract spec over a recording fake HTTP handler: Discord is never contacted. Pins the
// wire shape (wait=true, mention suppression, multipart attachments) and the failure
// classification, and that the webhook URL never reaches a cause.
public sealed class DiscordWebhookPublishProviderSpec {
	private const string _Token = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdEfGhIjKlMnOpQrStUvWxYz01";
	private static readonly string _Url = $"https://discord.com/api/webhooks/1234567890123456789/{DiscordWebhookPublishProviderSpec._Token}";

	private static PublishRequest _Request(string body = "hello discord") {
		return new PublishRequest {
			PublicationId = Guid.NewGuid(),
			IdempotencyKey = "key",
			PostBody = body,
			ScheduledAtUtc = DateTime.UtcNow,
			Provider = SocialProvider.DiscordWebhook,
			Session = new SocialSession("1234567890123456789", "Releases", DiscordWebhookPublishProviderSpec._Url, "https://discord.com/channels/777"),
		};
	}

	private static DiscordWebhookPublishProvider _Provider(HttpMessageHandler handler) {
		var services = new ServiceCollection();
		services.AddHttpClient(DiscordWebhookClient.HttpClientName)
			.ConfigurePrimaryHttpMessageHandler(() => handler);
		return new DiscordWebhookPublishProvider(
			services.BuildServiceProvider().GetRequiredService<IHttpClientFactory>()
		);
	}

	private static HttpResponseMessage _Json(int status, string json) {
		return new HttpResponseMessage((HttpStatusCode)status) {
			Content = new StringContent(json, Encoding.UTF8, "application/json"),
		};
	}

	private static HttpResponseMessage _Message() {
		return DiscordWebhookPublishProviderSpec._Json(200, """{"id":"555","channel_id":"666","content":"x"}""");
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
	public async Task ItShouldPostJsonWithWaitTrueAndSuppressEveryMention() {
		var handler = new RecordingHandler(_ => DiscordWebhookPublishProviderSpec._Message());

		var result = await DiscordWebhookPublishProviderSpec._Provider(handler)
			.PublishAsync(DiscordWebhookPublishProviderSpec._Request("ping @everyone @here <@123>"), CancellationToken.None);

		var published = result.Should().BeOfType<PublishResult.Published>().Subject;
		published.RecordId.Should().Be("555");
		published.RecordUrl.Should().Be("https://discord.com/channels/777/666/555");
		handler.Requests.Should().HaveCount(1);
		handler.Requests[0].Method.Should().Be(HttpMethod.Post);
		handler.Requests[0].RequestUri?.ToString().Should().Be($"{DiscordWebhookPublishProviderSpec._Url}?wait=true");
		handler.Requests[0].Headers.Authorization.Should().BeNull();
		var body = JsonDocument.Parse(handler.Bodies[0]).RootElement;
		body.GetProperty("content").GetString().Should().Be("ping @everyone @here <@123>");
		var mentions = body.GetProperty("allowed_mentions");
		mentions.GetProperty("parse").GetArrayLength().Should().Be(0);
		mentions.EnumerateObject().Select(property => property.Name).Should().Equal("parse");
	}

	[Fact]
	public async Task ItShouldSendImagesAsMultipartAttachmentsWithAltTextAndTheSameMentionRule() {
		var handler = new RecordingHandler(_ => DiscordWebhookPublishProviderSpec._Message());
		var request = DiscordWebhookPublishProviderSpec._Request() with {
			Media = [DiscordWebhookPublishProviderSpec._Media("alt one"), DiscordWebhookPublishProviderSpec._Media(null)],
		};

		var result = await DiscordWebhookPublishProviderSpec._Provider(handler).PublishAsync(request, CancellationToken.None);

		result.Should().BeOfType<PublishResult.Published>();
		handler.Requests[0].Content?.Headers.ContentType?.MediaType.Should().Be("multipart/form-data");
		var raw = handler.Bodies[0];
		raw.Should().Contain("name=\"files[0]\"").And.Contain("name=\"files[1]\"").And.Contain("name=payload_json");
		var json = raw[(raw.IndexOf("{\"allowed_mentions\"", StringComparison.Ordinal))..];
		json = json[..(json.IndexOf("}]}", StringComparison.Ordinal) + 3)];
		var payload = JsonDocument.Parse(json).RootElement;
		payload.GetProperty("allowed_mentions").GetProperty("parse").GetArrayLength().Should().Be(0);
		var attachments = payload.GetProperty("attachments").EnumerateArray().ToList();
		attachments.Should().HaveCount(2);
		attachments[0].GetProperty("description").GetString().Should().Be("alt one");
		attachments[1].TryGetProperty("description", out _).Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldAcceptTenAttachmentsAndRefuseElevenWithoutAnyCall() {
		var handler = new RecordingHandler(_ => DiscordWebhookPublishProviderSpec._Message());
		var provider = DiscordWebhookPublishProviderSpec._Provider(handler);
		var ten = Enumerable.Range(0, 10).Select(_ => DiscordWebhookPublishProviderSpec._Media(null)).ToList();

		var ok = await provider.PublishAsync(
			DiscordWebhookPublishProviderSpec._Request() with { Media = ten }, CancellationToken.None
		);
		var tooMany = await provider.PublishAsync(
			DiscordWebhookPublishProviderSpec._Request() with { Media = [.. ten, DiscordWebhookPublishProviderSpec._Media(null)] },
			CancellationToken.None
		);

		ok.Should().BeOfType<PublishResult.Published>();
		tooMany.Should().BeOfType<PublishResult.ContentFailure>();
		handler.Requests.Should().HaveCount(1);
	}

	[Fact]
	public async Task ItShouldRefuseAMessageOverTwoThousandCharactersWithoutAnyCall() {
		var handler = new RecordingHandler(_ => DiscordWebhookPublishProviderSpec._Message());
		var provider = DiscordWebhookPublishProviderSpec._Provider(handler);

		var ok = await provider.PublishAsync(DiscordWebhookPublishProviderSpec._Request(new string('a', 2000)), CancellationToken.None);
		var over = await provider.PublishAsync(DiscordWebhookPublishProviderSpec._Request(new string('a', 2001)), CancellationToken.None);

		ok.Should().BeOfType<PublishResult.Published>();
		over.Should().BeOfType<PublishResult.ContentFailure>();
		handler.Requests.Should().HaveCount(1);
	}

	[Fact]
	public async Task ItShouldBuildNoLinkWhenDiscordReportedNoServer() {
		var handler = new RecordingHandler(_ => DiscordWebhookPublishProviderSpec._Message());
		var request = DiscordWebhookPublishProviderSpec._Request();
		request = request with { Session = request.Session with { PdsHost = string.Empty } };

		var result = await DiscordWebhookPublishProviderSpec._Provider(handler).PublishAsync(request, CancellationToken.None);

		result.Should().BeOfType<PublishResult.Published>().Which.RecordUrl.Should().BeEmpty();
	}

	[Theory]
	[InlineData(401)]
	[InlineData(403)]
	[InlineData(404)]
	public async Task ItShouldMapAGoneWebhookToAnAccountFailureWithoutTheUrl(int status) {
		var handler = new RecordingHandler(_ => DiscordWebhookPublishProviderSpec._Json(status, """{"message":"Unknown Webhook","code":10015}"""));

		var result = await DiscordWebhookPublishProviderSpec._Provider(handler)
			.PublishAsync(DiscordWebhookPublishProviderSpec._Request(), CancellationToken.None);

		var cause = result.Should().BeOfType<PublishResult.AccountFailure>().Subject.Cause;
		cause.Should().NotContain(DiscordWebhookPublishProviderSpec._Token).And.NotContain("webhooks/");
	}

	[Fact]
	public async Task ItShouldMapABadRequestToAContentFailure() {
		var handler = new RecordingHandler(_ => DiscordWebhookPublishProviderSpec._Json(400, """{"message":"Cannot send an empty message","code":50006}"""));

		var result = await DiscordWebhookPublishProviderSpec._Provider(handler)
			.PublishAsync(DiscordWebhookPublishProviderSpec._Request(), CancellationToken.None);

		result.Should().BeOfType<PublishResult.ContentFailure>().Which.Cause.Should().Contain("empty message");
	}

	[Fact]
	public async Task ItShouldRetryLaterHonoringTheRetryAfterHeaderThenTheBody() {
		var withHeader = new RecordingHandler(_ => {
			var response = DiscordWebhookPublishProviderSpec._Json(429, """{"message":"You are being rate limited.","retry_after":9.0}""");
			response.Headers.RetryAfter = new System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.FromSeconds(45));
			return response;
		});
		var bodyOnly = new RecordingHandler(_ => DiscordWebhookPublishProviderSpec._Json(429, """{"message":"You are being rate limited.","retry_after":2.5,"global":false}"""));

		var first = await DiscordWebhookPublishProviderSpec._Provider(withHeader)
			.PublishAsync(DiscordWebhookPublishProviderSpec._Request(), CancellationToken.None);
		var second = await DiscordWebhookPublishProviderSpec._Provider(bodyOnly)
			.PublishAsync(DiscordWebhookPublishProviderSpec._Request(), CancellationToken.None);

		first.Should().BeOfType<PublishResult.TransientFailure>().Which.RetryAfter.Should().Be(TimeSpan.FromSeconds(45));
		second.Should().BeOfType<PublishResult.TransientFailure>().Which.RetryAfter.Should().Be(TimeSpan.FromSeconds(2.5));
	}

	[Fact]
	public async Task ItShouldTreatServerAndTransportErrorsOnTheWriteAsAmbiguous() {
		var server = new RecordingHandler(_ => DiscordWebhookPublishProviderSpec._Json(502, "{}"));
		var transport = new RecordingHandler(_ => throw new HttpRequestException($"reset {DiscordWebhookPublishProviderSpec._Url}"));

		var first = await DiscordWebhookPublishProviderSpec._Provider(server)
			.PublishAsync(DiscordWebhookPublishProviderSpec._Request(), CancellationToken.None);
		var second = await DiscordWebhookPublishProviderSpec._Provider(transport)
			.PublishAsync(DiscordWebhookPublishProviderSpec._Request(), CancellationToken.None);

		first.Should().BeOfType<PublishResult.Ambiguous>();
		second.Should().BeOfType<PublishResult.Ambiguous>().Which.Cause.Should().NotContain(DiscordWebhookPublishProviderSpec._Token);
	}

	[Fact]
	public async Task ItShouldJournalBeforeTheWriteAndNeverWriteToAForeignHost() {
		var order = new List<string>();
		var handler = new RecordingHandler(_ => {
			order.Add("post");
			return DiscordWebhookPublishProviderSpec._Message();
		});
		var request = DiscordWebhookPublishProviderSpec._Request() with {
			OnBeforeWrite = (position, _) => {
				order.Add($"journal {position}");
				return Task.CompletedTask;
			},
		};
		var forged = DiscordWebhookPublishProviderSpec._Request();
		forged = forged with { Session = forged.Session with { AccessJwt = "https://evil.example/api/webhooks/1/x" } };

		await DiscordWebhookPublishProviderSpec._Provider(handler).PublishAsync(request, CancellationToken.None);
		var refused = await DiscordWebhookPublishProviderSpec._Provider(handler).PublishAsync(forged, CancellationToken.None);

		order.Should().Equal("journal 0", "post");
		refused.Should().BeOfType<PublishResult.AccountFailure>();
	}

	[Fact]
	public async Task ItShouldParkAnAmbiguousWriteForReviewBecauseDiscordHasNoLookup() {
		var handler = new RecordingHandler(_ => throw new InvalidOperationException("no call expected"));

		var result = await DiscordWebhookPublishProviderSpec._Provider(handler).ReconcileAsync(
			new ReconcileRequest {
				PublicationId = Guid.NewGuid(),
				IdempotencyKey = "key",
				SegmentPosition = 0,
				Provider = SocialProvider.DiscordWebhook,
				Session = DiscordWebhookPublishProviderSpec._Request().Session,
				FirstAttemptAtUtc = DateTime.UtcNow,
			},
			CancellationToken.None
		);

		result.Should().BeOfType<ReconcileResult.NeedsReview>();
		handler.Requests.Should().BeEmpty();
	}

	[Fact]
	public void ItShouldDeclareDiscordAsTwoThousandCharactersTenFilesAndNoThreads() {
		var capability = ProviderCapabilityRegistry.For(SocialProvider.DiscordWebhook);

		capability.TextLimits.Select(limit => (limit.Rule.Unit, limit.Max)).Should().Equal(("utf16", 2000));
		capability.MaxImages.Should().Be(10);
		capability.MaxImageBytes.Should().Be(8L * 1024 * 1024);
		capability.SupportsThreads.Should().BeFalse();
		capability.RequiresMedia.Should().BeFalse();
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
			this.Bodies.Add(Encoding.Latin1.GetString(raw));
			return this._Responder(request);
		}
	}
}
