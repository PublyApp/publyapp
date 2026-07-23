using System.Net.Sockets;
using System.Text.Json;

namespace PublyApp.Api.Lib.RateLimiting;

internal sealed class EmailRateLimitMetadata;

internal static class AnonymousAuthRateLimitPartitionKeys {
	private static readonly object NormalizedEmailItemKey = new();

	public static string GetClientIp(HttpContext context) {
		var address = context.Connection.RemoteIpAddress;
		if (address is null) {
			return "unknown";
		}

		if (
			address.AddressFamily
				is AddressFamily.InterNetworkV6
			&& address.IsIPv4MappedToIPv6
		) {
			address = address.MapToIPv4();
		}

		return address.ToString();
	}

	public static string GetEmail(HttpContext context) {
		if (
			context.Items.TryGetValue(
				NormalizedEmailItemKey,
				out var value
			)
			&& value is string normalizedEmail
		) {
			return normalizedEmail;
		}

		return $"missing:{GetClientIp(context)}";
	}

	public static void SetEmail(
		HttpContext context,
		string email
	) {
		context.Items[NormalizedEmailItemKey] =
			email.Trim().ToLowerInvariant();
	}
}

internal sealed class EmailRateLimitPartitionMiddleware {
	private readonly RequestDelegate _next;

	public EmailRateLimitPartitionMiddleware(
		RequestDelegate next
	) {
		_next = next;
	}

	public async Task InvokeAsync(HttpContext context) {
		var hasEmailRateLimit = context
			.GetEndpoint()
			?.Metadata
			.GetMetadata<EmailRateLimitMetadata>()
			is not null;

		if (hasEmailRateLimit) {
			await ReadEmailAsync(context);
		}

		await _next(context);
	}

	private static async Task ReadEmailAsync(
		HttpContext context
	) {
		context.Request.EnableBuffering();

		try {
			using var document =
				await JsonDocument.ParseAsync(
					context.Request.Body,
					cancellationToken:
						context.RequestAborted
				);

			if (
				document.RootElement.TryGetProperty(
					"email",
					out var emailElement
				)
				&& emailElement.ValueKind
					is JsonValueKind.String
			) {
				var email = emailElement.GetString();
				if (!string.IsNullOrWhiteSpace(email)) {
					AnonymousAuthRateLimitPartitionKeys
						.SetEmail(context, email);
				}
			}
		} catch (JsonException) {
			// Binding and validation own malformed JSON responses.
			// The fallback partition still keeps abuse bounded by IP.
		} finally {
			context.Request.Body.Position = 0;
		}
	}
}
