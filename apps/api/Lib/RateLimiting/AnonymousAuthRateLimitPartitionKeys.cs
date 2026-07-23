using System.Buffers;
using System.Net.Sockets;
using System.Text.Json;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;

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
			var canContinue = await ReadEmailAsync(
				context
			);
			if (!canContinue) {
				return;
			}
		}

		await _next(context);
	}

	private static async Task<bool> ReadEmailAsync(
		HttpContext context
	) {
		if (
			context.Request.ContentLength
				is > MaxInspectedBodyBytes
		) {
			await WritePayloadTooLargeAsync(context);
			return false;
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
				await WritePayloadTooLargeAsync(context);
				return false;
			}

			using var document = JsonDocument.Parse(
				buffer.AsMemory(0, bytesRead)
			);

			if (
				document.RootElement.ValueKind
					is not JsonValueKind.Object
			) {
				return true;
			}

			string? matchedEmail = null;
			foreach (
				var property in document.RootElement
					.EnumerateObject()
			) {
				if (
					!property.Name.Equals(
						"email",
						StringComparison.OrdinalIgnoreCase
					)
				) {
					continue;
				}

				matchedEmail =
					property.Value.ValueKind
						is JsonValueKind.String
					? property.Value.GetString()
					: null;
			}

			if (!string.IsNullOrWhiteSpace(matchedEmail)) {
				AnonymousAuthRateLimitPartitionKeys
					.SetEmail(context, matchedEmail);
			}

			return true;
		} catch (JsonException) {
			// Binding and validation own malformed JSON responses.
			// The fallback partition still keeps abuse bounded by IP.
			return true;
		} finally {
			context.Request.Body.Position = 0;
			ArrayPool<byte>.Shared.Return(buffer);
		}
	}

	private static async Task WritePayloadTooLargeAsync(
		HttpContext context
	) {
		await TypedProblems.PayloadTooLarge(
			$"Request body exceeds the "
				+ $"{MaxInspectedBodyBytes}-byte limit",
			ResponseKeys.RequestBodyValidationFailed
		).ExecuteAsync(context);
	}
}
