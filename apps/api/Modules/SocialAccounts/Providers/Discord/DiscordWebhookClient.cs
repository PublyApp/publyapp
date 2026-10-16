using System.Text.Json;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Discord;

/// <summary>What <c>GET /webhooks/{id}/{token}</c> tells us about a webhook.</summary>
public sealed record DiscordWebhookInfo(string Name, string? GuildId);

public abstract record DiscordVerifyResult {
	public sealed record Ok(DiscordWebhookInfo Info) : DiscordVerifyResult;

	/// <summary>Discord answered 401/403/404: the webhook does not exist (any more).</summary>
	public sealed record Refused() : DiscordVerifyResult;

	/// <summary>Transport, timeout, 429, 5xx or an unreadable answer: try again later.</summary>
	public sealed record Unreachable() : DiscordVerifyResult;
}

/// <summary>
/// Verifies a pasted webhook with one read-only GET over the SSRF-guarded client
/// (public addresses only, no redirects). The answer carries the webhook's own
/// token, so only the name and guild id are ever read from it.
/// </summary>
public sealed class DiscordWebhookClient {
	public const string HttpClientName = "DiscordWebhook";

	private readonly IHttpClientFactory _HttpClientFactory;

	public DiscordWebhookClient(IHttpClientFactory httpClientFactory) {
		this._HttpClientFactory = httpClientFactory;
	}

	public async Task<DiscordVerifyResult> VerifyAsync(
		DiscordWebhookUrl webhook,
		CancellationToken cancellationToken
	) {
		var client = this._HttpClientFactory.CreateClient(DiscordWebhookClient.HttpClientName);
		try {
			using var response = await client.GetAsync(webhook.Full, cancellationToken);
			if ((int)response.StatusCode is 401 or 403 or 404) {
				return new DiscordVerifyResult.Refused();
			}

			if (!response.IsSuccessStatusCode) {
				return new DiscordVerifyResult.Unreachable();
			}

			await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
			using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
			var root = document.RootElement;
			var name = DiscordWebhookClient._String(root, "name");
			return name is null
				? new DiscordVerifyResult.Unreachable()
				: new DiscordVerifyResult.Ok(new DiscordWebhookInfo(name, DiscordWebhookClient._String(root, "guild_id")));
		} catch (JsonException) {
			return new DiscordVerifyResult.Unreachable();
		} catch (HttpRequestException) {
			return new DiscordVerifyResult.Unreachable();
		} catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) {
			return new DiscordVerifyResult.Unreachable();
		}
	}

	private static string? _String(JsonElement payload, string name) {
		return payload.ValueKind == JsonValueKind.Object
			&& payload.TryGetProperty(name, out var value)
			&& value.ValueKind == JsonValueKind.String
			&& !string.IsNullOrWhiteSpace(value.GetString())
				? value.GetString()
				: null;
	}
}
