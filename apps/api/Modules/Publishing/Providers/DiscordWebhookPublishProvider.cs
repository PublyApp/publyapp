using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

using PublyApp.Api.Modules.Publishing.Providers.Capabilities;
using PublyApp.Api.Modules.SocialAccounts.Providers.Discord;

namespace PublyApp.Api.Modules.Publishing.Providers;

/// <summary>
/// Discord incoming-webhook delivery (#2175): one <c>POST {webhook}?wait=true</c> per
/// post, so the answer carries the message id. Text goes in <c>content</c> with
/// <c>allowed_mentions: {parse: []}</c> so a post can never ping @everyone, @here,
/// a role or a user. Images are multipart <c>files[n]</c> parts described by a
/// <c>payload_json</c> part (alt text becomes the attachment <c>description</c>).
/// Threads are unsupported (validation refuses them), so only the root is sent.
/// Discord has no idempotency key and no lookup of a posted message, so an
/// ambiguous write is parked for review, never resent. Failures: 401/403/404
/// (webhook deleted) → account, 400 and other 4xx → content, 429 → retry later
/// honoring <c>Retry-After</c>/<c>retry_after</c>, 5xx/transport → ambiguous.
/// The webhook URL is a secret: it is never put in a cause or a log.
/// </summary>
public sealed class DiscordWebhookPublishProvider : IPublishProvider {
	public const int MaxContentLength = 2000;

	private static readonly JsonSerializerOptions _Json = new(JsonSerializerDefaults.Web);

	private readonly IHttpClientFactory _HttpClientFactory;

	public DiscordWebhookPublishProvider(IHttpClientFactory httpClientFactory) {
		this._HttpClientFactory = httpClientFactory;
	}

	public Task<ReconcileResult> ReconcileAsync(
		ReconcileRequest request,
		CancellationToken cancellationToken
	) {
		return Task.FromResult<ReconcileResult>(new ReconcileResult.NeedsReview(
			"Discord cannot confirm whether the message was posted; check the channel"
		));
	}

	public async Task<PublishResult> PublishAsync(PublishRequest request, CancellationToken cancellationToken) {
		var webhook = DiscordWebhookUrl.Parse(request.Session.AccessJwt);
		if (webhook is null) {
			return new PublishResult.AccountFailure("the stored Discord webhook is not a valid webhook URL");
		}

		var limits = request.Capability ?? ProviderCapabilityRegistry.DiscordWebhook;
		var prepared = DiscordWebhookPublishProvider._Prepare(request, limits);
		if (prepared.Failure is not null) {
			return prepared.Failure;
		}

		using var message = new HttpRequestMessage(HttpMethod.Post, $"{webhook.Full}?wait=true") {
			Content = prepared.Content,
		};
		if (request.OnBeforeWrite is not null) {
			await request.OnBeforeWrite(0, cancellationToken);
		}

		// From here on a transport failure is AMBIGUOUS: Discord may have posted it.
		try {
			var client = this._HttpClientFactory.CreateClient(DiscordWebhookClient.HttpClientName);
			using var response = await client.SendAsync(message, cancellationToken);
			return response.IsSuccessStatusCode
				? await DiscordWebhookPublishProvider._ReadPublishedAsync(response, request, cancellationToken)
				: await DiscordWebhookPublishProvider._ClassifyAsync(response, cancellationToken);
		} catch (JsonException) {
			return new PublishResult.Ambiguous("Discord answered with an unreadable body");
		} catch (HttpRequestException) {
			return new PublishResult.Ambiguous("network error while writing to Discord");
		} catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) {
			return new PublishResult.Ambiguous("Discord did not answer in time");
		}
	}

	private sealed record Prepared(HttpContent? Content, PublishResult? Failure);

	// Validates the post against the destination's limits and builds the request body
	// (JSON for text, multipart when images ride along).
	private static Prepared _Prepare(PublishRequest request, ProviderCapability limits) {
		var text = request.PostBody;
		if (text.Length > DiscordWebhookPublishProvider.MaxContentLength) {
			return new Prepared(null, new PublishResult.ContentFailure(
				$"the message has {text.Length} characters, Discord accepts {DiscordWebhookPublishProvider.MaxContentLength}"
			));
		}

		if (text.Length == 0 && request.Media.Count == 0) {
			return new Prepared(null, new PublishResult.ContentFailure("the message is empty"));
		}

		if (request.Media.Count > limits.MaxImages) {
			return new Prepared(null, new PublishResult.ContentFailure(
				$"the post has {request.Media.Count} images, Discord accepts {limits.MaxImages}"
			));
		}

		var payload = new Dictionary<string, object?> {
			["allowed_mentions"] = new Dictionary<string, object?> { ["parse"] = Array.Empty<string>() },
		};
		if (text.Length > 0) {
			payload["content"] = text;
		}

		if (request.Media.Count == 0) {
			return new Prepared(DiscordWebhookPublishProvider._JsonContent(payload), null);
		}

		var form = new MultipartFormDataContent();
		var attachments = new List<Dictionary<string, object?>>();
		for (var index = 0; index < request.Media.Count; index++) {
			var number = index + 1;
			var media = request.Media[index];
			if (!limits.AcceptedImageContentTypes.Contains(media.ContentType)) {
				form.Dispose();
				return new Prepared(null, new PublishResult.ContentFailure(
					$"image {number} is {media.ContentType}, which Discord posts here do not accept"
				));
			}

			var fitted = ImageDerivative.Fit(
				media.Content, media.ContentType, media.WidthPx, media.HeightPx, limits.MaxImageBytes
			);
			if (fitted is ImageDerivative.CannotFit cannotFit) {
				form.Dispose();
				return new Prepared(null, new PublishResult.ContentFailure(
					$"image {number} cannot be published: {cannotFit.Reason}"
				));
			}

			var derivative = (ImageDerivative.Fitted)fitted;
			var filename = $"image-{number}{DiscordWebhookPublishProvider._Extension(derivative.ContentType)}";
			var file = new ByteArrayContent(derivative.Content);
			file.Headers.ContentType = new MediaTypeHeaderValue(derivative.ContentType);
			form.Add(file, $"files[{index}]", filename);
			var attachment = new Dictionary<string, object?> { ["id"] = index, ["filename"] = filename };
			if (!string.IsNullOrWhiteSpace(media.AltText)) {
				attachment["description"] = media.AltText;
			}

			attachments.Add(attachment);
		}

		payload["attachments"] = attachments;
		form.Add(DiscordWebhookPublishProvider._JsonContent(payload), "payload_json");
		return new Prepared(form, null);
	}

	private static StringContent _JsonContent(object payload) {
		return new StringContent(
			JsonSerializer.Serialize(payload, DiscordWebhookPublishProvider._Json), Encoding.UTF8, "application/json"
		);
	}

	private static string _Extension(string contentType) {
		return contentType switch {
			"image/png" => ".png",
			"image/webp" => ".webp",
			_ => ".jpg",
		};
	}

	private static async Task<PublishResult> _ReadPublishedAsync(
		HttpResponseMessage response,
		PublishRequest request,
		CancellationToken cancellationToken
	) {
		var body = await DiscordWebhookPublishProvider._ReadJsonAsync(response, cancellationToken);
		var id = DiscordWebhookPublishProvider._String(body, "id");
		if (id is null) {
			return new PublishResult.Ambiguous("Discord accepted the message but returned no id");
		}

		// PdsHost is the https://discord.com/channels/{guild} prefix, empty when no link can be built.
		var channel = DiscordWebhookPublishProvider._String(body, "channel_id");
		var url = request.Session.PdsHost.Length > 0 && channel is not null
			? $"{request.Session.PdsHost}/{channel}/{id}"
			: string.Empty;
		return new PublishResult.Published(id, url);
	}

	private static async Task<PublishResult> _ClassifyAsync(
		HttpResponseMessage response,
		CancellationToken cancellationToken
	) {
		var status = (int)response.StatusCode;
		JsonElement? payload = null;
		try {
			payload = await DiscordWebhookPublishProvider._ReadJsonAsync(response, cancellationToken);
		} catch (JsonException) {
			// Status only.
		}

		var detail = payload is { } body ? DiscordWebhookPublishProvider._String(body, "message") : null;
		// Belt and braces: an answer that echoes a webhook path is never copied.
		detail = detail is not null && detail.Contains("webhooks/", StringComparison.OrdinalIgnoreCase) ? null : detail;
		var cause = DiscordWebhookPublishProvider._Clean($"Discord answered {status}" + (detail is null ? string.Empty : $": {detail}"));
		if (status is 401 or 403 or 404) {
			return new PublishResult.AccountFailure(
				$"the Discord webhook was refused, it may have been deleted ({cause})"
			);
		}

		if (status == (int)HttpStatusCode.TooManyRequests) {
			return new PublishResult.TransientFailure(cause, DiscordWebhookPublishProvider._RetryAfter(response, payload));
		}

		// A 5xx on the write may have been applied; 4xx provably was not.
		return status >= 500
			? new PublishResult.Ambiguous(cause, DiscordWebhookPublishProvider._RetryAfter(response, payload))
			: new PublishResult.ContentFailure(cause);
	}

	private static string _Clean(string text) {
		return SocialAccounts.Lib.LastErrorSanitiser.Sanitize(text) ?? text;
	}

	// Retry-After (seconds), else the body's retry_after (fractional seconds), capped at an hour.
	private static TimeSpan? _RetryAfter(HttpResponseMessage response, JsonElement? payload) {
		var delay = response.Headers.RetryAfter?.Delta;
		if (delay is null
			&& payload is { ValueKind: JsonValueKind.Object } body
			&& body.TryGetProperty("retry_after", out var seconds)
			&& seconds.ValueKind == JsonValueKind.Number
			&& seconds.TryGetDouble(out var value)
			&& double.IsFinite(value)) {
			delay = TimeSpan.FromSeconds(Math.Min(value, TimeSpan.FromHours(1).TotalSeconds));
		}

		if (delay is null || delay.Value <= TimeSpan.Zero) {
			return null;
		}

		return delay.Value > TimeSpan.FromHours(1) ? TimeSpan.FromHours(1) : delay;
	}

	private static string? _String(JsonElement payload, string name) {
		return payload.ValueKind == JsonValueKind.Object
			&& payload.TryGetProperty(name, out var value)
			&& value.ValueKind == JsonValueKind.String
			&& !string.IsNullOrWhiteSpace(value.GetString())
				? value.GetString()
				: null;
	}

	private static async Task<JsonElement> _ReadJsonAsync(
		HttpResponseMessage response,
		CancellationToken cancellationToken
	) {
		await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
		using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
		return document.RootElement.Clone();
	}
}
