using System.Net;
using System.Text.Json;

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
	private const string CreateSessionPath = "xrpc/com.atproto.server.createSession";

	// Fixed handle for the shared PDS entrypoint; per-PDS discovery is OAuth-era work.
	private const string DefaultPdsBaseAddress = "https://bsky.social/";

	private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(10);

	private readonly IHttpClientFactory _httpClientFactory;
	private readonly ILogger<BlueskyClient> _logger;

	public BlueskyClient(
		IHttpClientFactory httpClientFactory,
		ILogger<BlueskyClient> logger
	) {
		_httpClientFactory = httpClientFactory;
		_logger = logger;
	}

	public async Task<BlueskySessionResult> CreateSessionAsync(
		BlueskyCredentials credentials,
		CancellationToken cancellationToken = default
	) {
		var client = _httpClientFactory.CreateClient(WellKnownClientName);
		using var request = new HttpRequestMessage(HttpMethod.Post, CreateSessionPath) {
			Content = JsonContent.Create(new CreateSessionBody(
				identifier: credentials.Identifier,
				password: credentials.AppPassword
			)),
		};

		using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
		timeoutCts.CancelAfter(RequestTimeout);

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
				return await ParseSuccessAsync(response, timeoutCts.Token);
			}

			if ((int)response.StatusCode >= 500) {
				return new BlueskySessionResult.Transient();
			}

			// 4xx from the PDS: 401 invalid credentials, 400 unknown identifier /
			// malformed request — both are account-caused refusals.
			return ClassifyAccountFailure(response.StatusCode);
		}
	}

	private static BlueskySessionResult ClassifyAccountFailure(HttpStatusCode statusCode) {
		if (statusCode == HttpStatusCode.Unauthorized) {
			return new BlueskySessionResult.AccountFailure("credentials refused");
		}

		return new BlueskySessionResult.AccountFailure("account not found");
	}

	private async Task<BlueskySessionResult> ParseSuccessAsync(
		HttpResponseMessage response,
		CancellationToken cancellationToken
	) {
		BlueskyCreateSessionResponse? payload;
		try {
			payload = await response.Content
				.ReadFromJsonAsync<BlueskyCreateSessionResponse>(cancellationToken);
		} catch (JsonException) {
			_logger.LogError(
				"Bluesky createSession returned unparseable JSON with status {Status}",
				(int)response.StatusCode
			);
			return new BlueskySessionResult.Transient();
		}

		if (payload is null || string.IsNullOrEmpty(payload.Did)
			|| string.IsNullOrEmpty(payload.AccessJwt)) {
			_logger.LogError(
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
			PdsHost: DefaultPdsBaseAddress.TrimEnd('/')
		);
	}

	/// <summary>Named HttpClient registered once in DI (base address pinned there).</summary>
	public const string WellKnownClientName = "bluesky-client";

	public static void RegisterHttpClient(
		Microsoft.Extensions.DependencyInjection.IServiceCollection services
	) {
		services.AddHttpClient(WellKnownClientName, client => {
			client.BaseAddress = new Uri(DefaultPdsBaseAddress);
			client.Timeout = Timeout.InfiniteTimeSpan; // per-request timeout above
		});
	}

	// Wire types local to the adapter — never exposed beyond this class.
	private sealed record CreateSessionBody(string identifier, string password);

	private sealed class BlueskyCreateSessionResponse {
		public string Did { get; set; } = string.Empty;
		public string? Handle { get; set; }
		public string? AccessJwt { get; set; }
	}
}
