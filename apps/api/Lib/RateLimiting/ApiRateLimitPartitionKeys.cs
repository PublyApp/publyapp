using System.Security.Cryptography;
using System.Text;

namespace PublyApp.Api.Lib.RateLimiting;

internal static class ApiRateLimitPartitionKeys {
	public static string GetSessionFingerprint(
		HttpContext context
	) {
		var token = context.Request.Headers[
			AppEnvironment.Instance.SESSION_TOKEN_HEADER_KEY
		].ToString();

		if (!string.IsNullOrWhiteSpace(token)) {
			return Hash(token);
		}

		var clientIp =
			AnonymousAuthRateLimitPartitionKeys
				.GetClientIp(context);
		return $"missing:{Hash(clientIp)}";
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
