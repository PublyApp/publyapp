using System.Security.Cryptography;
using System.Text;

using Microsoft.AspNetCore.RateLimiting;

using PublyApp.Api.Modules.Auth.Services;

namespace PublyApp.Api.Lib.RateLimiting;

internal static class ApiRateLimitPartitionKeys {
	private static readonly object
		_ValidatedSessionFingerprintItemKey = new();
	private static readonly object
		_SessionValidationAttemptedItemKey = new();

	public static string GetSessionFingerprint(
		HttpContext context
	) {
		if (
			context.Items.TryGetValue(
				_ValidatedSessionFingerprintItemKey,
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
			_ValidatedSessionFingerprintItemKey
		] = Hash(sessionId.ToString("D"));
	}

	public static void MarkSessionValidationAttempted(
		HttpContext context
	) {
		context.Items[
			_SessionValidationAttemptedItemKey
		] = true;
	}

	public static bool WasSessionValidationAttempted(
		HttpContext context
	) {
		return context.Items.ContainsKey(
			_SessionValidationAttemptedItemKey
		);
	}

	public static string GetTenant(
		HttpContext context
	) {
		var routeTenant = context.Request.RouteValues[
			"tenantId"
		]?.ToString();
		if (!string.IsNullOrWhiteSpace(routeTenant)) {
			return _NormalizeTenant(routeTenant);
		}

		var headerTenant = context.Request.Headers[
			AppEnvironment.Instance.TENANT_ID_HEADER_KEY
		].ToString();
		if (!string.IsNullOrWhiteSpace(headerTenant)) {
			return _NormalizeTenant(headerTenant);
		}

		return $"missing:{GetSessionFingerprint(context)}";
	}

	public static string Hash(string value) {
		var bytes = SHA256.HashData(
			Encoding.UTF8.GetBytes(value)
		);
		return Convert.ToHexString(bytes).ToLowerInvariant();
	}

	private static string _NormalizeTenant(string value) {
		var trimmed = value.Trim();
		if (Guid.TryParse(trimmed, out var tenantId)) {
			return tenantId.ToString("D");
		}

		return trimmed;
	}
}

internal sealed class
	ValidatedSessionRateLimitPartitionMiddleware {
	private readonly RequestDelegate _Next;

	public ValidatedSessionRateLimitPartitionMiddleware(
		RequestDelegate next
	) {
		_Next = next;
	}

	public async Task InvokeAsync(HttpContext context) {
		if (!_RequiresValidatedSessionPartition(context)) {
			await _Next(context);
			return;
		}

		var token = context.Request.Headers[
			AppEnvironment.Instance.SESSION_TOKEN_HEADER_KEY
		].FirstOrDefault();
		if (string.IsNullOrWhiteSpace(token)) {
			await _Next(context);
			return;
		}

		ApiRateLimitPartitionKeys
			.MarkSessionValidationAttempted(context);
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
			await _Next(context);
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

		await _Next(context);
	}

	private static bool
		_RequiresValidatedSessionPartition(
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
	private static readonly object _ItemKey = new();
	private const int _FingerprintLength = 16;

	public static void Set(
		HttpContext context,
		string policyName,
		string partitionKey
	) {
		var hash = ApiRateLimitPartitionKeys.Hash(
			partitionKey
		);
		context.Items[_ItemKey] = new RateLimitRejectionInfo(
			policyName,
			hash[.._FingerprintLength]
		);
	}

	public static RateLimitRejectionInfo? Get(
		HttpContext context
	) {
		if (
			context.Items.TryGetValue(_ItemKey, out var value)
			&& value is RateLimitRejectionInfo info
		) {
			return info;
		}

		return null;
	}
}
