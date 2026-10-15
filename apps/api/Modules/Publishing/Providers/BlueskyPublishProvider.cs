using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;

using PublyApp.Api.Modules.SocialAccounts.Lib;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.Publishing.Providers;

/// <summary>
/// Bluesky delivery over <c>com.atproto.repo.createRecord</c> (Epic D §3). The
/// record key is DETERMINISTIC — <c>pub-&lt;idempotency key&gt;</c>, derived from the
/// publication id — so a retry after a timeout hits an already-exists answer and the
/// provider reads the EXISTING record back instead of duplicating it. Failures are
/// classified: 401/403 → account, other 4xx → content, 5xx/transport/timeouts →
/// transient, already-exists → success after read-back. Tokens live only in the
/// Authorization header; causes pass the sanitiser and never contain them.
/// </summary>
public sealed class BlueskyPublishProvider : IPublishProvider {
	public const string HttpClientName = "BlueskyPublishProvider";

	private const string _Collection = "app.bsky.feed.post";

	private static readonly JsonSerializerOptions _WireOptions = new(JsonSerializerDefaults.Web);

	private readonly IHttpClientFactory _HttpClientFactory;

	public BlueskyPublishProvider(IHttpClientFactory httpClientFactory) {
		this._HttpClientFactory = httpClientFactory;
	}

	public async Task<PublishResult> PublishAsync(
		PublishRequest request,
		CancellationToken cancellationToken
	) {
		var client = this._HttpClientFactory.CreateClient(BlueskyPublishProvider.HttpClientName);
		var rkey = $"pub-{request.IdempotencyKey}";

		try {
			var uploaded = await BlueskyPublishProvider._UploadImagesAsync(
				client, request, cancellationToken
			);
			if (uploaded.Failure is not null) {
				return uploaded.Failure;
			}

			using var response = await BlueskyPublishProvider._SendCreateRecordAsync(
				client, request, rkey, uploaded.Images, cancellationToken
			);

			if (response.IsSuccessStatusCode) {
				var payload = await BlueskyPublishProvider._ReadJsonAsync(response, cancellationToken);
				return new PublishResult.Published(
					BlueskyPublishProvider._RecordIdentity(payload, request.Session.Did, rkey),
					BlueskyPublishProvider._WebUrl(BlueskyPublishProvider._RecordIdentity(payload, request.Session.Did, rkey), request.Session.Did, rkey)
				);
			}

			var (error, message) = await BlueskyPublishProvider._ReadErrorAsync(response, cancellationToken);
			var cause = $"{(int)response.StatusCode} {error}: {message}";

			if (response.StatusCode is HttpStatusCode.Unauthorized
				or HttpStatusCode.Forbidden) {
				return new PublishResult.AccountFailure(
					"Bluesky rejected the stored credential "
						+ $"({LastErrorSanitiser.Sanitize(cause) ?? cause})"
				);
			}

			if (BlueskyPublishProvider._LooksLikeAlreadyExists(error, message)) {
				return await BlueskyPublishProvider._ReadExistingBackAsync(client, request.Session, rkey, cancellationToken);
			}

			if ((int)response.StatusCode >= 500
				|| response.StatusCode == HttpStatusCode.TooManyRequests) {
				return new PublishResult.TransientFailure(
					LastErrorSanitiser.Sanitize(cause) ?? cause
				);
			}

			// A 4xx that is neither auth nor a duplicate collision is about the CONTENT.
			return new PublishResult.ContentFailure(
				LastErrorSanitiser.Sanitize(cause) ?? cause
			);
		} catch (HttpRequestException exception) {
			return new PublishResult.TransientFailure(
				LastErrorSanitiser.Sanitize($"network error reaching the PDS: {exception.Message}")
					?? "network error reaching the PDS"
			);
		} catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested) {
			return new PublishResult.TransientFailure(
				LastErrorSanitiser.Sanitize($"the PDS did not answer in time: {exception.Message}")
					?? "the PDS did not answer in time"
			);
		}
	}

	private static async Task<HttpResponseMessage> _SendCreateRecordAsync(
		HttpClient client,
		PublishRequest request,
		string rkey,
		IReadOnlyList<Dictionary<string, object?>> images,
		CancellationToken cancellationToken
	) {
		var record = new Dictionary<string, object?> {
			["$type"] = BlueskyPublishProvider._Collection,
			["text"] = request.PostBody,
			["createdAt"] = DateTime.SpecifyKind(request.ScheduledAtUtc, DateTimeKind.Utc)
				.ToString("o", CultureInfo.InvariantCulture),
		};
		if (images.Count > 0) {
			record["embed"] = new Dictionary<string, object?> {
				["$type"] = "app.bsky.embed.images",
				["images"] = images,
			};
		}

		var payload = new Dictionary<string, object?> {
			["repo"] = request.Session.Did,
			["collection"] = BlueskyPublishProvider._Collection,
			["rkey"] = rkey,
			["record"] = record,
		};

		using var httpRequest = new HttpRequestMessage(
			HttpMethod.Post,
			$"{request.Session.PdsHost.TrimEnd('/')}/xrpc/com.atproto.repo.createRecord"
		);
		httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
			"Bearer",
			request.Session.AccessJwt
		);
		httpRequest.Content = new StringContent(
			JsonSerializer.Serialize(payload, BlueskyPublishProvider._WireOptions),
			Encoding.UTF8,
			"application/json"
		);

		return await client.SendAsync(httpRequest, cancellationToken);
	}

	private sealed record UploadedImages(
		IReadOnlyList<Dictionary<string, object?>> Images,
		PublishResult? Failure
	);

	/// <summary>
	/// Uploads the post's images sequentially, in order, as blobs
	/// (<c>com.atproto.repo.uploadBlob</c>), fitting each under the provider's
	/// byte limit first. Blob uploads are not idempotent, but an unreferenced blob
	/// is garbage-collected by the PDS, so a retry re-uploading is safe. Returns
	/// the embed entries, or the classified failure naming the image (1-based).
	/// </summary>
	private static async Task<UploadedImages> _UploadImagesAsync(
		HttpClient client,
		PublishRequest request,
		CancellationToken cancellationToken
	) {
		var limits = ProviderLimits.Bluesky;
		var entries = new List<Dictionary<string, object?>>();
		if (request.Media.Count > limits.MaxImages) {
			return new UploadedImages(
				entries,
				new PublishResult.ContentFailure(
					$"the post has {request.Media.Count} images, Bluesky accepts {limits.MaxImages}"
				)
			);
		}

		for (var index = 0; index < request.Media.Count; index++) {
			var number = index + 1;
			var media = request.Media[index];
			if (!limits.AcceptedImageContentTypes.Contains(media.ContentType)) {
				return new UploadedImages(
					entries,
					new PublishResult.ContentFailure(
						$"image {number} is {media.ContentType}, which Bluesky does not accept"
					)
				);
			}

			var fitted = ImageDerivative.Fit(
				media.Content, media.ContentType, media.WidthPx, media.HeightPx, limits.MaxImageBytes
			);
			if (fitted is ImageDerivative.CannotFit cannotFit) {
				return new UploadedImages(
					entries,
					new PublishResult.ContentFailure($"image {number} cannot be published: {cannotFit.Reason}")
				);
			}

			var derivative = (ImageDerivative.Fitted)fitted;
			using var httpRequest = new HttpRequestMessage(
				HttpMethod.Post,
				$"{request.Session.PdsHost.TrimEnd('/')}/xrpc/com.atproto.repo.uploadBlob"
			);
			httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
				"Bearer",
				request.Session.AccessJwt
			);
			httpRequest.Content = new ByteArrayContent(derivative.Content);
			httpRequest.Content.Headers.ContentType =
				new System.Net.Http.Headers.MediaTypeHeaderValue(derivative.ContentType);

			using var response = await client.SendAsync(httpRequest, cancellationToken);
			if (!response.IsSuccessStatusCode) {
				var (error, message) = await BlueskyPublishProvider._ReadErrorAsync(response, cancellationToken);
				return new UploadedImages(
					entries,
					BlueskyPublishProvider._ClassifyUploadFailure(response.StatusCode, number, error, message)
				);
			}

			var payload = await BlueskyPublishProvider._ReadJsonAsync(response, cancellationToken);
			if (!payload.TryGetProperty("blob", out var blob)) {
				return new UploadedImages(
					entries,
					new PublishResult.TransientFailure(
						$"Bluesky accepted image {number} but returned no blob reference"
					)
				);
			}

			entries.Add(new Dictionary<string, object?> {
				["alt"] = media.AltText ?? string.Empty,
				["image"] = blob,
				["aspectRatio"] = new Dictionary<string, object?> {
					["width"] = derivative.WidthPx,
					["height"] = derivative.HeightPx,
				},
			});
		}

		return new UploadedImages(entries, null);
	}

	private static PublishResult _ClassifyUploadFailure(
		HttpStatusCode status,
		int imageNumber,
		string error,
		string message
	) {
		var cause = $"{(int)status} {error}: {message}";
		if (status is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden) {
			return new PublishResult.AccountFailure(
				"Bluesky rejected the stored credential while uploading image "
					+ $"{imageNumber} ({LastErrorSanitiser.Sanitize(cause) ?? cause})"
			);
		}

		if ((int)status >= 500 || status == HttpStatusCode.TooManyRequests) {
			return new PublishResult.TransientFailure(
				LastErrorSanitiser.Sanitize($"uploading image {imageNumber} failed: {cause}")
					?? $"uploading image {imageNumber} failed"
			);
		}

		return new PublishResult.ContentFailure(
			LastErrorSanitiser.Sanitize($"image {imageNumber} was refused: {cause}")
				?? $"image {imageNumber} was refused"
		);
	}

	private static async Task<PublishResult> _ReadExistingBackAsync(
		HttpClient client,
		SocialSession session,
		string rkey,
		CancellationToken cancellationToken
	) {
		var url = $"{session.PdsHost.TrimEnd('/')}/xrpc/com.atproto.repo.getRecord"
			+ $"?repo={Uri.EscapeDataString(session.Did)}"
			+ $"&collection={Uri.EscapeDataString(BlueskyPublishProvider._Collection)}"
			+ $"&rkey={Uri.EscapeDataString(rkey)}";

		try {
			using var response = await client.GetAsync(url, cancellationToken);
			if (response.IsSuccessStatusCode) {
				var payload = await BlueskyPublishProvider._ReadJsonAsync(response, cancellationToken);
				var recordId = BlueskyPublishProvider._RecordIdentity(payload, session.Did, rkey);
				return new PublishResult.AlreadyExistsTreatedAsPublished(
					recordId,
					BlueskyPublishProvider._WebUrl(recordId, session.Did, rkey)
				);
			}

			var (error, message) = await BlueskyPublishProvider._ReadErrorAsync(response, cancellationToken);
			return new PublishResult.TransientFailure(
				LastErrorSanitiser.Sanitize(
					$"an existing record answered already-exists but could not be read back "
						+ $"({(int)response.StatusCode} {error}: {message})"
				) ?? "the existing record could not be read back"
			);
		} catch (HttpRequestException exception) {
			return new PublishResult.TransientFailure(
				LastErrorSanitiser.Sanitize(
					$"network error reading back the existing record: {exception.Message}"
				) ?? "network error reading back the existing record"
			);
		}
	}

	private static bool _LooksLikeAlreadyExists(string error, string message) {
		return error.Contains("duplicate", StringComparison.OrdinalIgnoreCase)
			|| message.Contains("already_exists", StringComparison.OrdinalIgnoreCase)
			|| message.Contains("already exists", StringComparison.OrdinalIgnoreCase);
	}

	private static string _RecordIdentity(JsonElement payload, string did, string rkey) {
		if (payload.TryGetProperty("uri", out var uri)) {
			var value = uri.GetString();
			if (!string.IsNullOrWhiteSpace(value)) {
				return value;
			}
		}

		return $"at://{did}/{BlueskyPublishProvider._Collection}/{rkey}";
	}

	private static string _WebUrl(string recordId, string did, string rkey) {
		var marker = $"{BlueskyPublishProvider._Collection}/";
		var index = recordId.IndexOf(marker, StringComparison.Ordinal);
		var suffix = index < 0 ? rkey : recordId[(index + marker.Length)..];
		return $"https://bsky.app/profile/{did}/post/{suffix}";
	}

	private static async Task<(string Error, string Message)> _ReadErrorAsync(
		HttpResponseMessage response,
		CancellationToken cancellationToken
	) {
		var error = "unknown_error";
		var message = "the PDS returned an error without a parsable body";
		try {
			var payload = await BlueskyPublishProvider._ReadJsonAsync(response, cancellationToken);
			if (payload.TryGetProperty("error", out var errorElement)) {
				error = errorElement.GetString() ?? error;
			}

			if (payload.TryGetProperty("message", out var messageElement)) {
				message = messageElement.GetString() ?? message;
			}
		} catch (JsonException) {
			// Non-JSON error body: keep the descriptive defaults above.
		}

		return (error, message);
	}

	private static async Task<JsonElement> _ReadJsonAsync(
		HttpResponseMessage response,
		CancellationToken cancellationToken
	) {
		await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
		var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
		using (document) {
			return document.RootElement.Clone();
		}
	}
}
