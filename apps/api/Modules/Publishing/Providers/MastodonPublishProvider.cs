using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

using PublyApp.Api.Modules.Publishing.Providers.Capabilities;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Lib;
using PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

namespace PublyApp.Api.Modules.Publishing.Providers;

/// <summary>
/// Mastodon delivery (#2174): images through <c>POST /api/v2/media</c> (async:
/// a 202 is polled on <c>GET /api/v1/media/{id}</c> until it carries a url) with
/// the alt text as <c>description</c>, then <c>POST /api/v1/statuses</c>. Every
/// status carries an <c>Idempotency-Key</c> derived from the publication key and
/// the segment position, so a retry after an ambiguous failure is deduplicated by
/// the instance. A thread is an <c>in_reply_to_id</c> chain: each segment replies
/// to the previous status, and finished segments are reported through
/// <see cref="PublishRequest.OnSegmentCompleted"/> and skipped on resume.
/// Pixelfed (#2175) shares this delivery: media goes through the universally
/// supported <c>/api/v1/media</c>, an image is required, and because Pixelfed does
/// not honour the Idempotency-Key an ambiguous write is never silently resent.
/// Failures: 401/403 → account, 422 → content, 429/5xx/transport → transient
/// (honoring <c>Retry-After</c>). Tokens live only in the Authorization header.
/// </summary>
public sealed class MastodonPublishProvider : IPublishProvider {
	private static readonly JsonSerializerOptions _Json = new(JsonSerializerDefaults.Web);

	private readonly IHttpClientFactory _HttpClientFactory;
	private readonly TimeSpan _PollInterval;
	private readonly int _MaxPolls;

	public MastodonPublishProvider(IHttpClientFactory httpClientFactory)
		: this(httpClientFactory, TimeSpan.FromSeconds(1), 30) {
	}

	internal MastodonPublishProvider(IHttpClientFactory httpClientFactory, TimeSpan pollInterval, int maxPolls) {
		this._HttpClientFactory = httpClientFactory;
		this._PollInterval = pollInterval;
		this._MaxPolls = maxPolls;
	}

	/// <summary>The instance dedupe key of one segment: position 0 keeps the bare key.</summary>
	internal static string SegmentKey(string idempotencyKey, int position) {
		return position == 0 ? idempotencyKey : $"{idempotencyKey}-s{position}";
	}

	public async Task<PublishResult> PublishAsync(PublishRequest request, CancellationToken cancellationToken) {
		if (request.Provider == SocialProvider.Pixelfed
			&& request.Media.Count == 0
			&& request.CompletedSegments.All(segment => segment.Position != 0)) {
			return new PublishResult.ContentFailure("Pixelfed posts need at least one image");
		}

		var client = this._HttpClientFactory.CreateClient(MastodonHostGuard.HttpClientName);
		var texts = new List<string>(request.FollowUpSegments.Count + 1) { request.PostBody };
		texts.AddRange(request.FollowUpSegments);
		var isThread = texts.Count > 1;
		var done = request.CompletedSegments.ToDictionary(segment => segment.Position);

		try {
			CompletedSegment? parent = null;
			PublishResult? rootResult = null;
			CompletedSegment? root = null;
			for (var position = 0; position < texts.Count; position++) {
				if (done.TryGetValue(position, out var existing)) {
					root ??= existing;
					parent = existing;
					continue;
				}

				var outcome = await this._CreateSegmentAsync(
					client, request, position, texts[position], parent, cancellationToken
				);
				if (outcome.Segment is null) {
					return outcome.Result;
				}

				if (isThread && request.OnSegmentCompleted is not null) {
					await request.OnSegmentCompleted(outcome.Segment, cancellationToken);
				}

				if (position == 0) {
					rootResult = outcome.Result;
				}

				root ??= outcome.Segment;
				parent = outcome.Segment;
			}

			return rootResult ?? new PublishResult.Published(
				root?.RecordId ?? string.Empty, root?.RecordUrl ?? string.Empty
			);
		} catch (JsonException) {
			// A 2xx whose body is not JSON (a proxy's HTML page): ambiguous, so retry;
			// the Idempotency-Key keeps a repeat from double-posting.
			return new PublishResult.TransientFailure("the instance answered with an unreadable body");
		} catch (HttpRequestException exception) {
			return new PublishResult.TransientFailure(MastodonPublishProvider._Clean(
				$"network error reaching the instance: {exception.Message}"
			));
		} catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested) {
			return new PublishResult.TransientFailure(MastodonPublishProvider._Clean(
				$"the instance did not answer in time: {exception.Message}"
			));
		}
	}

	/// <summary>
	/// Mastodon has no lookup by idempotency key (#2176). Inside the instance's dedupe
	/// window a resend with the SAME key is answered with the original status, so it
	/// cannot duplicate; beyond it nothing protects a resend, so the user is asked.
	/// </summary>
	public Task<ReconcileResult> ReconcileAsync(
		ReconcileRequest request,
		CancellationToken cancellationToken
	) {
		if (request.Provider == SocialProvider.Pixelfed) {
			return Task.FromResult<ReconcileResult>(new ReconcileResult.NeedsReview(
				"Pixelfed cannot confirm whether the post went out; check your profile"
			));
		}

		var age = DateTime.UtcNow - request.FirstAttemptAtUtc;
		ReconcileResult result = age <= MastodonPublishProvider.IdempotencyWindow
			? new ReconcileResult.SafeToResend()
			: new ReconcileResult.NeedsReview(
				"Mastodon can no longer confirm whether the post went out; check your profile"
			);
		return Task.FromResult(result);
	}

	// Mastodon keeps an Idempotency-Key for about an hour; stay well inside it.
	internal static readonly TimeSpan IdempotencyWindow = TimeSpan.FromMinutes(50);

	private sealed record Outcome(PublishResult Result, CompletedSegment? Segment);

	private async Task<Outcome> _CreateSegmentAsync(
		HttpClient client,
		PublishRequest request,
		int position,
		string text,
		CompletedSegment? parent,
		CancellationToken cancellationToken
	) {
		var mediaIds = new List<string>();
		if (position == 0) {
			var uploaded = await this._UploadImagesAsync(client, request, cancellationToken);
			if (uploaded.Failure is not null) {
				return new Outcome(uploaded.Failure, null);
			}

			mediaIds = uploaded.Ids;
		}

		var payload = new Dictionary<string, object?> { ["visibility"] = "public" };
		// An image-only post (Pixelfed) sends no status rather than an empty one.
		if (text.Length > 0 || mediaIds.Count == 0) {
			payload["status"] = text;
		}

		if (mediaIds.Count > 0) {
			payload["media_ids"] = mediaIds;
		}

		if (parent is not null) {
			payload["in_reply_to_id"] = parent.RecordId;
		}

		using var httpRequest = MastodonPublishProvider._Request(
			HttpMethod.Post, request, "/api/v1/statuses"
		);
		httpRequest.Headers.Add(
			"Idempotency-Key", MastodonPublishProvider.SegmentKey(request.IdempotencyKey, position)
		);
		httpRequest.Content = new StringContent(
			JsonSerializer.Serialize(payload, MastodonPublishProvider._Json), Encoding.UTF8, "application/json"
		);

		if (request.OnBeforeWrite is not null) {
			await request.OnBeforeWrite(position, cancellationToken);
		}

		// From here on a transport failure is AMBIGUOUS: the instance may have applied it.
		try {
			return await MastodonPublishProvider._SendStatusAsync(
				client, httpRequest, position, MastodonPublishProvider._Network(request), cancellationToken
			);
		} catch (JsonException) {
			return new Outcome(
				new PublishResult.Ambiguous("the instance answered with an unreadable body"), null
			);
		} catch (HttpRequestException exception) {
			return new Outcome(new PublishResult.Ambiguous(MastodonPublishProvider._Clean(
				$"network error while writing to the instance: {exception.Message}"
			)), null);
		} catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested) {
			return new Outcome(new PublishResult.Ambiguous(MastodonPublishProvider._Clean(
				$"the instance did not answer in time: {exception.Message}"
			)), null);
		}
	}

	private static async Task<Outcome> _SendStatusAsync(
		HttpClient client,
		HttpRequestMessage httpRequest,
		int position,
		string network,
		CancellationToken cancellationToken
	) {
		using var response = await client.SendAsync(httpRequest, cancellationToken);
		if (!response.IsSuccessStatusCode) {
			var failure = await MastodonPublishProvider._ClassifyAsync(
				response, "publishing", network, cancellationToken
			);
			// A 5xx on the write may have been applied; 429 and 4xx provably were not.
			return new Outcome(
				failure is PublishResult.TransientFailure transient && (int)response.StatusCode >= 500
					? new PublishResult.Ambiguous(transient.Cause, transient.RetryAfter)
					: failure,
				null
			);
		}

		var body = await MastodonPublishProvider._ReadJsonAsync(response, cancellationToken);
		var id = MastodonPublishProvider._String(body, "id");
		if (id is null) {
			return new Outcome(
				new PublishResult.Ambiguous($"{network} accepted the status but returned no id"),
				null
			);
		}

		var url = MastodonPublishProvider._String(body, "url")
			?? MastodonPublishProvider._String(body, "uri")
			?? string.Empty;
		return new Outcome(new PublishResult.Published(id, url), new CompletedSegment(position, id, string.Empty, url));
	}

	private sealed record Uploaded(List<string> Ids, PublishResult? Failure);

	private async Task<Uploaded> _UploadImagesAsync(
		HttpClient client,
		PublishRequest request,
		CancellationToken cancellationToken
	) {
		var limits = request.Capability ?? ProviderCapabilityRegistry.For(request.Provider);
		var ids = new List<string>();
		if (request.Media.Count > limits.MaxImages) {
			return new Uploaded(ids, new PublishResult.ContentFailure(
				$"the post has {request.Media.Count} images, this instance accepts {limits.MaxImages}"
			));
		}

		for (var index = 0; index < request.Media.Count; index++) {
			var number = index + 1;
			var media = request.Media[index];
			if (!limits.AcceptedImageContentTypes.Contains(media.ContentType)) {
				return new Uploaded(ids, new PublishResult.ContentFailure(
					$"image {number} is {media.ContentType}, which this instance does not accept"
				));
			}

			var fitted = ImageDerivative.Fit(
				media.Content, media.ContentType, media.WidthPx, media.HeightPx, limits.MaxImageBytes
			);
			if (fitted is ImageDerivative.CannotFit cannotFit) {
				return new Uploaded(ids, new PublishResult.ContentFailure(
					$"image {number} cannot be published: {cannotFit.Reason}"
				));
			}

			var derivative = (ImageDerivative.Fitted)fitted;
			using var form = new MultipartFormDataContent();
			var file = new ByteArrayContent(derivative.Content);
			file.Headers.ContentType = new MediaTypeHeaderValue(derivative.ContentType);
			form.Add(file, "file", $"image-{number}");
			if (!string.IsNullOrWhiteSpace(media.AltText)) {
				form.Add(new StringContent(media.AltText), "description");
			}

			using var upload = MastodonPublishProvider._Request(
				HttpMethod.Post, request, request.Provider == SocialProvider.Pixelfed ? "/api/v1/media" : "/api/v2/media"
			);
			upload.Content = form;
			using var response = await client.SendAsync(upload, cancellationToken);
			if (!response.IsSuccessStatusCode) {
				return new Uploaded(ids, await MastodonPublishProvider._ClassifyAsync(
					response, $"uploading image {number}", MastodonPublishProvider._Network(request), cancellationToken
				));
			}

			var body = await MastodonPublishProvider._ReadJsonAsync(response, cancellationToken);
			var id = MastodonPublishProvider._String(body, "id");
			if (id is null) {
				return new Uploaded(ids, new PublishResult.TransientFailure(
					$"{MastodonPublishProvider._Network(request)} accepted image {number} but returned no media id"
				));
			}

			// 200 = ready; 202 = still processing: poll until the media carries a url.
			if (response.StatusCode == HttpStatusCode.Accepted
				|| MastodonPublishProvider._String(body, "url") is null) {
				var pollFailure = await this._WaitForMediaAsync(client, request, id, number, cancellationToken);
				if (pollFailure is not null) {
					return new Uploaded(ids, pollFailure);
				}
			}

			ids.Add(id);
		}

		return new Uploaded(ids, null);
	}

	private async Task<PublishResult?> _WaitForMediaAsync(
		HttpClient client,
		PublishRequest request,
		string mediaId,
		int number,
		CancellationToken cancellationToken
	) {
		for (var attempt = 0; attempt < this._MaxPolls; attempt++) {
			await Task.Delay(this._PollInterval, cancellationToken);
			using var poll = MastodonPublishProvider._Request(
				HttpMethod.Get, request, $"/api/v1/media/{Uri.EscapeDataString(mediaId)}"
			);
			using var response = await client.SendAsync(poll, cancellationToken);
			if (response.StatusCode == HttpStatusCode.PartialContent) {
				continue;
			}

			if (!response.IsSuccessStatusCode) {
				return await MastodonPublishProvider._ClassifyAsync(
					response, $"processing image {number}", MastodonPublishProvider._Network(request), cancellationToken
				);
			}

			var body = await MastodonPublishProvider._ReadJsonAsync(response, cancellationToken);
			if (MastodonPublishProvider._String(body, "url") is not null) {
				return null;
			}
		}

		return new PublishResult.TransientFailure(
			$"{MastodonPublishProvider._Network(request)} was still processing image {number} after {this._MaxPolls} checks"
		);
	}

	private static string _Network(PublishRequest request) {
		return request.Provider == SocialProvider.Pixelfed ? "Pixelfed" : "Mastodon";
	}

	private static HttpRequestMessage _Request(HttpMethod method, PublishRequest request, string path) {
		var message = new HttpRequestMessage(method, request.Session.PdsHost.TrimEnd('/') + path);
		message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", request.Session.AccessJwt);
		return message;
	}

	private static async Task<PublishResult> _ClassifyAsync(
		HttpResponseMessage response,
		string action,
		string network,
		CancellationToken cancellationToken
	) {
		var error = "the instance returned an error without a parsable body";
		try {
			var payload = await MastodonPublishProvider._ReadJsonAsync(response, cancellationToken);
			error = MastodonPublishProvider._String(payload, "error") ?? error;
		} catch (JsonException) {
			// Keep the descriptive default above.
		}

		var status = (int)response.StatusCode;
		var cause = MastodonPublishProvider._Clean($"{action} failed: {status} {error}");
		if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden) {
			return new PublishResult.AccountFailure(network + " rejected the stored credential (" + cause + ")");
		}

		if (response.StatusCode == HttpStatusCode.UnprocessableEntity) {
			return new PublishResult.ContentFailure(cause);
		}

		if (status >= 500 || response.StatusCode == HttpStatusCode.TooManyRequests) {
			return new PublishResult.TransientFailure(cause, MastodonPublishProvider._RetryAfter(response));
		}

		// Any other 4xx is about the request itself, which retrying cannot fix.
		return new PublishResult.ContentFailure(cause);
	}

	// Retry-After (seconds or an HTTP date), else Mastodon's X-RateLimit-Reset (an
	// ISO 8601 instant), capped at one hour; null when neither is usable.
	private static TimeSpan? _RetryAfter(HttpResponseMessage response) {
		var header = response.Headers.RetryAfter;
		var delay = header?.Delta
			?? (header?.Date is { } date ? date - DateTimeOffset.UtcNow : null);
		// X-RateLimit-Reset describes the rate-limit window: it only means something
		// on a 429, never on a 5xx (#2186 L9).
		if (delay is null
			&& response.StatusCode == HttpStatusCode.TooManyRequests
			&& response.Headers.TryGetValues("X-RateLimit-Reset", out var values)
			&& DateTimeOffset.TryParse(
				values.FirstOrDefault(),
				System.Globalization.CultureInfo.InvariantCulture,
				System.Globalization.DateTimeStyles.AssumeUniversal,
				out var reset
			)) {
			delay = reset - DateTimeOffset.UtcNow;
		}

		if (delay is null || delay.Value <= TimeSpan.Zero) {
			return null;
		}

		return delay.Value > TimeSpan.FromHours(1) ? TimeSpan.FromHours(1) : delay;
	}

	private static string _Clean(string text) {
		return LastErrorSanitiser.Sanitize(text) ?? text;
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

/// <summary>
/// The registered <see cref="IPublishProvider"/>: one delivery per
/// <see cref="PublishRequest.Provider"/> (#2174, #2175), so the publish job and every
/// existing registration stay provider-blind. Pixelfed rides the Mastodon delivery.
/// </summary>
public sealed class RoutingPublishProvider : IPublishProvider {
	private readonly BlueskyPublishProvider _Bluesky;
	private readonly MastodonPublishProvider _Mastodon;
	private readonly DiscordWebhookPublishProvider _Discord;

	public RoutingPublishProvider(
		BlueskyPublishProvider bluesky,
		MastodonPublishProvider mastodon,
		DiscordWebhookPublishProvider discord
	) {
		this._Bluesky = bluesky;
		this._Mastodon = mastodon;
		this._Discord = discord;
	}

	private IPublishProvider _For(SocialProvider provider) {
		return provider switch {
			SocialProvider.Bluesky => this._Bluesky,
			SocialProvider.Mastodon or SocialProvider.Pixelfed => this._Mastodon,
			SocialProvider.DiscordWebhook => this._Discord,
			_ => throw new ArgumentOutOfRangeException(nameof(provider), provider, "Unhandled SocialProvider"),
		};
	}

	public Task<ReconcileResult> ReconcileAsync(
		ReconcileRequest request,
		CancellationToken cancellationToken
	) {
		return this._For(request.Provider).ReconcileAsync(request, cancellationToken);
	}

	public Task<PublishResult> PublishAsync(PublishRequest request, CancellationToken cancellationToken) {
		return this._For(request.Provider).PublishAsync(request, cancellationToken);
	}
}
