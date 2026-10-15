using System.Net.Http.Headers;
using System.Text.Json;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

/// <summary>
/// HTTP implementation of <see cref="IMastodonClient"/> over the SSRF-guarded
/// named client (<see cref="MastodonHostGuard.HttpClientName"/>). Every URL is
/// built as <c>https://{normalized host}/...</c>.
/// </summary>
public sealed class MastodonClient : IMastodonClient {
	private const string _ClientName = "PublyApp";
	private const string _Website = "https://publyapp.com";

	private readonly IHttpClientFactory _HttpClientFactory;

	public MastodonClient(IHttpClientFactory httpClientFactory) {
		this._HttpClientFactory = httpClientFactory;
	}

	public async Task<MastodonResult<MastodonApp>> RegisterAppAsync(
		string host, string redirectUri, string scopes, CancellationToken cancellationToken
	) {
		var body = new Dictionary<string, string> {
			["client_name"] = MastodonClient._ClientName,
			["redirect_uris"] = redirectUri,
			["scopes"] = scopes,
			["website"] = MastodonClient._Website,
		};
		var response = await this._SendAsync(
			HttpMethod.Post, host, "/api/v1/apps", new FormUrlEncodedContent(body), null, cancellationToken
		);
		return MastodonClient._Parse(response, payload => {
			var id = MastodonClient._String(payload, "client_id");
			var secret = MastodonClient._String(payload, "client_secret");
			return id is null || secret is null ? null : new MastodonApp(id, secret);
		});
	}

	public async Task<MastodonResult<string>> ExchangeCodeAsync(
		string host, MastodonApp app, string redirectUri, string code, CancellationToken cancellationToken
	) {
		var body = new Dictionary<string, string> {
			["grant_type"] = "authorization_code",
			["code"] = code,
			["client_id"] = app.ClientId,
			["client_secret"] = app.ClientSecret,
			["redirect_uri"] = redirectUri,
		};
		var response = await this._SendAsync(
			HttpMethod.Post, host, "/oauth/token", new FormUrlEncodedContent(body), null, cancellationToken
		);
		return MastodonClient._Parse(response, payload => MastodonClient._String(payload, "access_token"));
	}

	public async Task<MastodonResult<MastodonAccountInfo>> VerifyCredentialsAsync(
		string host, string accessToken, CancellationToken cancellationToken
	) {
		var response = await this._SendAsync(
			HttpMethod.Get, host, "/api/v1/accounts/verify_credentials", null, accessToken, cancellationToken
		);
		return MastodonClient._Parse(response, payload => {
			var id = MastodonClient._String(payload, "id");
			var acct = MastodonClient._String(payload, "acct");
			return id is null || acct is null ? null : new MastodonAccountInfo(id, acct);
		});
	}

	public async Task<MastodonInstanceLimits?> GetInstanceLimitsAsync(
		string host, CancellationToken cancellationToken
	) {
		// v2 first; an instance without it (or a failing one) falls back to v1,
		// and finally to "nothing advertised" (the provider defaults apply).
		foreach (var path in new[] { "/api/v2/instance", "/api/v1/instance" }) {
			var response = await this._SendAsync(
				HttpMethod.Get, host, path, null, null, cancellationToken
			);
			if (response is not { IsSuccess: true, Payload: { } payload }) {
				continue;
			}

			var statuses = MastodonClient._Object(MastodonClient._Object(payload, "configuration"), "statuses");
			var media = MastodonClient._Object(MastodonClient._Object(payload, "configuration"), "media_attachments");
			var types = media is { } mediaObject
				&& mediaObject.TryGetProperty("supported_mime_types", out var list)
				&& list.ValueKind == JsonValueKind.Array
					? list.EnumerateArray()
						.Where(item => item.ValueKind == JsonValueKind.String)
						.Select(item => item.GetString() ?? string.Empty)
						.ToList()
					: null;
			return new MastodonInstanceLimits(
				MastodonClient._Long(statuses, "max_characters") ?? MastodonClient._Long(payload, "max_toot_chars"),
				MastodonClient._Long(statuses, "max_media_attachments"),
				MastodonClient._Long(statuses, "characters_reserved_per_url"),
				MastodonClient._Long(media, "image_size_limit"),
				types
			);
		}

		return null;
	}

	public async Task RevokeAsync(
		string host, MastodonApp app, string accessToken, CancellationToken cancellationToken
	) {
		var body = new Dictionary<string, string> {
			["client_id"] = app.ClientId,
			["client_secret"] = app.ClientSecret,
			["token"] = accessToken,
		};
		await this._SendAsync(
			HttpMethod.Post, host, "/oauth/revoke", new FormUrlEncodedContent(body), null, cancellationToken
		);
	}

	private sealed record Response(int Status, JsonElement? Payload) {
		public bool IsSuccess {
			get { return this.Status is >= 200 and < 300; }
		}
	}

	// null = transport failure, timeout or an unreadable success body.
	private async Task<Response?> _SendAsync(
		HttpMethod method,
		string host,
		string path,
		HttpContent? content,
		string? bearer,
		CancellationToken cancellationToken
	) {
		var client = this._HttpClientFactory.CreateClient(MastodonHostGuard.HttpClientName);
		using var request = new HttpRequestMessage(method, $"https://{host}{path}") { Content = content };
		if (bearer is not null) {
			request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
		}

		try {
			using var response = await client.SendAsync(request, cancellationToken);
			JsonElement? payload = null;
			try {
				await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
				using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
				payload = document.RootElement.Clone();
			} catch (JsonException) {
				// A non-JSON body: only the status is meaningful.
			}

			return new Response((int)response.StatusCode, payload);
		} catch (HttpRequestException) {
			return null;
		} catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) {
			return null;
		}
	}

	private static MastodonResult<T> _Parse<T>(Response? response, Func<JsonElement, T?> read)
		where T : class {
		if (response is null || response.Status >= 500) {
			return new MastodonResult<T>.Unreachable();
		}

		if (!response.IsSuccess) {
			return new MastodonResult<T>.Refused($"the instance answered {response.Status}");
		}

		var value = response.Payload is { } payload ? read(payload) : null;
		return value is null
			? new MastodonResult<T>.Unreachable()
			: new MastodonResult<T>.Ok(value);
	}

	private static JsonElement? _Object(JsonElement? parent, string name) {
		return parent is { ValueKind: JsonValueKind.Object } element
			&& element.TryGetProperty(name, out var child)
			&& child.ValueKind == JsonValueKind.Object
				? child
				: null;
	}

	private static string? _String(JsonElement payload, string name) {
		return payload.ValueKind == JsonValueKind.Object
			&& payload.TryGetProperty(name, out var value)
			&& value.ValueKind == JsonValueKind.String
			&& !string.IsNullOrWhiteSpace(value.GetString())
				? value.GetString()
				: null;
	}

	private static long? _Long(JsonElement? parent, string name) {
		return parent is { ValueKind: JsonValueKind.Object } element
			&& element.TryGetProperty(name, out var value)
			&& value.ValueKind == JsonValueKind.Number
			&& value.TryGetInt64(out var number)
				? number
				: null;
	}
}
