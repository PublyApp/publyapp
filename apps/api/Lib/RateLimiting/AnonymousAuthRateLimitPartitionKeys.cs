using System.Buffers;
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
	private const int MaxInspectedBodyBytes =
		16 * 1_024;
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
		if (
			context.Request.ContentLength
				is > MaxInspectedBodyBytes
		) {
			return;
		}

		context.Request.EnableBuffering();
		var inspectionLength =
			MaxInspectedBodyBytes + 1;
		var buffer = ArrayPool<byte>.Shared.Rent(
			inspectionLength
		);

		try {
			var bytesRead = 0;
			var reachedEnd = false;

			while (bytesRead < inspectionLength) {
				var read = await context.Request.Body
					.ReadAsync(
						buffer.AsMemory(
							bytesRead,
							inspectionLength
								- bytesRead
						),
						context.RequestAborted
					);

				if (read == 0) {
					reachedEnd = true;
					break;
				}

				bytesRead += read;
			}

			if (
				!reachedEnd
				|| bytesRead > MaxInspectedBodyBytes
			) {
				return;
			}

			using var document = JsonDocument.Parse(
				buffer.AsMemory(0, bytesRead)
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
			ArrayPool<byte>.Shared.Return(buffer);
		}
	}
}
