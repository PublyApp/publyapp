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
		_HttpClientFactory = httpClientFactory;
	}

	public async Task<PublishResult> PublishAsync(
		PublishRequest request,
		CancellationToken cancellationToken
	) {
		var client = _HttpClientFactory.CreateClient(HttpClientName);
		var rkey = $"pub-{request.IdempotencyKey}";

		try {
			using var response = await _SendCreateRecordAsync(
				client, request, rkey, cancellationToken
			);

			if (response.IsSuccessStatusCode) {
				var payload = await _ReadJsonAsync(response, cancellationToken);
				return new PublishResult.Published(
					_RecordIdentity(payload, request.Session.Did, rkey),
					_WebUrl(_RecordIdentity(payload, request.Session.Did, rkey), request.Session.Did, rkey)
				);
			}

			var (error, message) = await _ReadErrorAsync(response, cancellationToken);
			var cause = $"{(int)response.StatusCode} {error}: {message}";

			if (response.StatusCode is HttpStatusCode.Unauthorized
				or HttpStatusCode.Forbidden) {
				return new PublishResult.AccountFailure(
					"Bluesky rejected the stored credential "
						+ $"({LastErrorSanitiser.Sanitize(cause) ?? cause})"
				);
			}

			if (_LooksLikeAlreadyExists(error, message)) {
				return await _ReadExistingBackAsync(client, request.Session, rkey, cancellationToken);
			}

			if ((int)response.StatusCode >= 500) {
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
		CancellationToken cancellationToken
	) {
		var payload = new Dictionary<string, object?> {
			["repo"] = request.Session.Did,
			["collection"] = _Collection,
			["rkey"] = rkey,
			["record"] = new Dictionary<string, object?> {
				["$type"] = _Collection,
				["text"] = request.PostBody,
				["createdAt"] = DateTime.SpecifyKind(request.ScheduledAtUtc, DateTimeKind.Utc)
					.ToString("o", CultureInfo.InvariantCulture),
			},
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
			JsonSerializer.Serialize(payload, _WireOptions),
			Encoding.UTF8,
			"application/json"
		);

		return await client.SendAsync(httpRequest, cancellationToken);
	}

	private static async Task<PublishResult> _ReadExistingBackAsync(
		HttpClient client,
		SocialSession session,
		string rkey,
		CancellationToken cancellationToken
	) {
		var url = $"{session.PdsHost.TrimEnd('/')}/xrpc/com.atproto.repo.getRecord"
			+ $"?repo={Uri.EscapeDataString(session.Did)}"
			+ $"&collection={Uri.EscapeDataString(_Collection)}"
			+ $"&rkey={Uri.EscapeDataString(rkey)}";

		try {
			using var response = await client.GetAsync(url, cancellationToken);
			if (response.IsSuccessStatusCode) {
				var payload = await _ReadJsonAsync(response, cancellationToken);
				var recordId = _RecordIdentity(payload, session.Did, rkey);
				return new PublishResult.AlreadyExistsTreatedAsPublished(
					recordId,
					_WebUrl(recordId, session.Did, rkey)
				);
			}

			var (error, message) = await _ReadErrorAsync(response, cancellationToken);
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

		return $"at://{did}/{_Collection}/{rkey}";
	}

	private static string _WebUrl(string recordId, string did, string rkey) {
		var marker = $"{_Collection}/";
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
			var payload = await _ReadJsonAsync(response, cancellationToken);
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
