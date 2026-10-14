using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky;

/// <summary>
/// Minimal Bluesky client: opens an AT Protocol session with an app password
/// (<c>com.atproto.server.createSession</c>) and resolves DID + handle from the
/// response (Epic C §6 item 2). Failure classification happens here so no exception
/// other than cancellation ever crosses the seam:
/// <list type="bullet">
/// <item>HTTP 401/400 → <see cref="BlueskySessionResult.AccountFailure"/> — credentials
/// refused / identifier not found; nothing may be persisted.</item>
/// <item>Network error, timeout, malformed payload, 5xx →
/// <see cref="BlueskySessionResult.Transient"/> — retry/backoff belongs to jobs
/// infrastructure later.</item>
/// </list>
/// The app password exists only inside the outgoing request body. It is never logged,
/// never echoed into a failure reason, and never included in any returned value.
/// </summary>
public sealed class BlueskyClient : IBlueskyClient {
	private const string _CreateSessionPath = "xrpc/com.atproto.server.createSession";

	// Fixed handle for the shared PDS entrypoint; per-PDS discovery is OAuth-era work.
	private const string _DefaultPdsBaseAddress = "https://bsky.social/";

	private static readonly TimeSpan _RequestTimeout = TimeSpan.FromSeconds(10);

	private readonly IHttpClientFactory _HttpClientFactory;
	private readonly ILogger<BlueskyClient> _Logger;

	public BlueskyClient(
		IHttpClientFactory httpClientFactory,
		ILogger<BlueskyClient> logger
	) {
		this._HttpClientFactory = httpClientFactory;
		this._Logger = logger;
	}

	public async Task<BlueskySessionResult> CreateSessionAsync(
		BlueskyCredentials credentials,
		CancellationToken cancellationToken = default
	) {
		var client = this._HttpClientFactory.CreateClient(BlueskyClient.WellKnownClientName);
		using var request = new HttpRequestMessage(HttpMethod.Post, BlueskyClient._CreateSessionPath) {
			Content = JsonContent.Create(new CreateSessionBody(
				identifier: credentials.Identifier,
				password: credentials.AppPassword
			)),
		};

		using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
		timeoutCts.CancelAfter(BlueskyClient._RequestTimeout);

		HttpResponseMessage response;
		try {
			response = await client.SendAsync(request, timeoutCts.Token);
		} catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) {
			// Our own timeout fired — caller's token is still live, classify as transient.
			return new BlueskySessionResult.Transient();
		} catch (HttpRequestException) {
			return new BlueskySessionResult.Transient();
		}

		using (response) {
			if (response.IsSuccessStatusCode) {
				return await this._ParseSuccessAsync(response, timeoutCts.Token);
			}

			if ((int)response.StatusCode >= 500) {
				return new BlueskySessionResult.Transient();
			}

			// 4xx from the PDS: 401 invalid credentials, 400 unknown identifier /
			// malformed request — both are account-caused refusals.
			return BlueskyClient._ClassifyAccountFailure(response.StatusCode);
		}
	}

	private static BlueskySessionResult _ClassifyAccountFailure(HttpStatusCode statusCode) {
		if (statusCode == HttpStatusCode.Unauthorized) {
			return new BlueskySessionResult.AccountFailure("credentials refused");
		}

		return new BlueskySessionResult.AccountFailure("account not found");
	}

	private async Task<BlueskySessionResult> _ParseSuccessAsync(
		HttpResponseMessage response,
		CancellationToken cancellationToken
	) {
		BlueskyCreateSessionResponse? payload;
		try {
			payload = await response.Content
				.ReadFromJsonAsync<BlueskyCreateSessionResponse>(cancellationToken);
		} catch (JsonException) {
			this._Logger.LogError(
				"Bluesky createSession returned unparseable JSON with status {Status}",
				(int)response.StatusCode
			);
			return new BlueskySessionResult.Transient();
		}

		if (payload is null || string.IsNullOrEmpty(payload.Did)
			|| string.IsNullOrEmpty(payload.AccessJwt)) {
			this._Logger.LogError(
				"Bluesky createSession response missing did or accessJwt (status {Status})",
				(int)response.StatusCode
			);
			return new BlueskySessionResult.Transient();
		}

		var handle = string.IsNullOrWhiteSpace(payload.Handle)
			? payload.Did
			: payload.Handle.Trim();

		return new BlueskySessionResult.Success(
			new BlueskyIdentity(payload.Did, handle),
			AccessJwt: payload.AccessJwt,
			PdsHost: BlueskyClient._DefaultPdsBaseAddress.TrimEnd('/')
		);
	}

	/// <summary>Named HttpClient registered once in DI (base address pinned there).</summary>
	public const string WellKnownClientName = "bluesky-client";

	public static void RegisterHttpClient(
		Microsoft.Extensions.DependencyInjection.IServiceCollection services
	) {
		services.AddHttpClient(BlueskyClient.WellKnownClientName, client => {
			client.BaseAddress = new Uri(BlueskyClient._DefaultPdsBaseAddress);
			client.Timeout = Timeout.InfiniteTimeSpan; // per-request timeout above
		});
	}

	// Wire types local to the adapter — never exposed beyond this class.
	private sealed record CreateSessionBody {
		public CreateSessionBody(string identifier, string password) {
			this.Identifier = identifier;
			this.Password = password;
		}

		[JsonPropertyName("identifier")]
		public string Identifier { get; }

		[JsonPropertyName("password")]
		public string Password { get; }
	}

	private sealed class BlueskyCreateSessionResponse {
		public string Did { get; set; } = string.Empty;
		public string? Handle { get; set; }
		public string? AccessJwt { get; set; }
	}
}
