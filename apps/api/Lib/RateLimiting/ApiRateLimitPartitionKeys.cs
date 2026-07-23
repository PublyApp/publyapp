using System.Security.Cryptography;
using System.Text;

using Microsoft.AspNetCore.RateLimiting;

using PublyApp.Api.Modules.Auth.Services;

namespace PublyApp.Api.Lib.RateLimiting;

internal static class ApiRateLimitPartitionKeys {
	private static readonly object
		ValidatedSessionFingerprintItemKey = new();

	public static string GetSessionFingerprint(
		HttpContext context
	) {
		if (
			context.Items.TryGetValue(
				ValidatedSessionFingerprintItemKey,
				out var value
			)
			&& value is string fingerprint
		) {
			return fingerprint;
		}

		var clientIp =
			AnonymousAuthRateLimitPartitionKeys
				.GetClientIp(context);
		return $"unauthenticated:{Hash(clientIp)}";
	}

	public static void SetValidatedSession(
		HttpContext context,
		Guid sessionId
	) {
		context.Items[
			ValidatedSessionFingerprintItemKey
		] = Hash(sessionId.ToString("D"));
	}

	public static string GetTenant(
		HttpContext context
	) {
		var routeTenant = context.Request.RouteValues[
			"tenantId"
		]?.ToString();
		if (!string.IsNullOrWhiteSpace(routeTenant)) {
			return NormalizeTenant(routeTenant);
		}

		var headerTenant = context.Request.Headers[
			AppEnvironment.Instance.TENANT_ID_HEADER_KEY
		].ToString();
		if (!string.IsNullOrWhiteSpace(headerTenant)) {
			return NormalizeTenant(headerTenant);
		}

		return $"missing:{GetSessionFingerprint(context)}";
	}

	public static string Hash(string value) {
		var bytes = SHA256.HashData(
			Encoding.UTF8.GetBytes(value)
		);
		return Convert.ToHexString(bytes).ToLowerInvariant();
	}

	private static string NormalizeTenant(string value) {
		var trimmed = value.Trim();
		if (Guid.TryParse(trimmed, out var tenantId)) {
			return tenantId.ToString("D");
		}

		return trimmed;
	}
}

internal sealed class
	ValidatedSessionRateLimitPartitionMiddleware {
	private readonly RequestDelegate _next;

	public ValidatedSessionRateLimitPartitionMiddleware(
		RequestDelegate next
	) {
		_next = next;
	}

	public async Task InvokeAsync(HttpContext context) {
		if (!RequiresValidatedSessionPartition(context)) {
			await _next(context);
			return;
		}

		var token = context.Request.Headers[
			AppEnvironment.Instance.SESSION_TOKEN_HEADER_KEY
		].FirstOrDefault();
		if (string.IsNullOrWhiteSpace(token)) {
			await _next(context);
			return;
		}

		var sessionService = context.RequestServices
			.GetRequiredService<ISessionService>();
		var sessionData =
			await sessionService.GetSessionByToken(
				token,
				context.RequestAborted
			);
		if (
			sessionData?.Session.Id is not Guid sessionId
			|| sessionData.User.Id is not Guid userId
		) {
			await _next(context);
			return;
		}

		var authContext = context.RequestServices
			.GetRequiredService<IRequestAuthContext>();
		authContext.SessionToken = token;
		authContext.UserId = userId;
		ApiRateLimitPartitionKeys.SetValidatedSession(
			context,
			sessionId
		);

		await _next(context);
	}

	private static bool
		RequiresValidatedSessionPartition(
			HttpContext context
		) {
		var endpoint = context.GetEndpoint();
		if (
			endpoint?.Metadata
				.GetMetadata<
					DisableRateLimitingAttribute>()
				is not null
		) {
			return false;
		}

		var policyName = endpoint?.Metadata
			.GetMetadata<EnableRateLimitingAttribute>()
			?.PolicyName;
		return ApiRateLimitPolicies
			.UsesValidatedSessionPartition(policyName);
	}
}

public static class
	ValidatedSessionRateLimitPartitionExtensions {
	public static IApplicationBuilder
		UseValidatedSessionRateLimitPartitioning(
			this IApplicationBuilder app
		) {
		return app.UseMiddleware<
			ValidatedSessionRateLimitPartitionMiddleware>();
	}
}

internal sealed record RateLimitRejectionInfo(
	string PolicyName,
	string PartitionFingerprint
);

internal static class RateLimitRejectionContext {
	private static readonly object ItemKey = new();
	private const int FingerprintLength = 16;

	public static void Set(
		HttpContext context,
		string policyName,
		string partitionKey
	) {
		var hash = ApiRateLimitPartitionKeys.Hash(
			partitionKey
		);
		context.Items[ItemKey] = new RateLimitRejectionInfo(
			policyName,
			hash[..FingerprintLength]
		);
	}

	public static RateLimitRejectionInfo? Get(
		HttpContext context
	) {
		if (
			context.Items.TryGetValue(ItemKey, out var value)
			&& value is RateLimitRejectionInfo info
		) {
			return info;
		}

		return null;
	}
}
