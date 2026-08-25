namespace PublyApp.Api.Lib.RateLimiting;

public sealed record ApiRateLimitSettings(
	RateLimitWindowSettings Global,
	RateLimitWindowSettings AnonymousOther,
	RateLimitWindowSettings Authenticated,
	RateLimitWindowSettings HeavySearch,
	RateLimitWindowSettings Bulk,
	RateLimitWindowSettings TenantBulk,
	RateLimitWindowSettings Email,
	RateLimitWindowSettings TenantEmail,
	RateLimitWindowSettings Export,
	RateLimitWindowSettings TenantExport,
	RateLimitWindowSettings Upload,
	RateLimitWindowSettings SocialConnect
) {
	public static ApiRateLimitSettings FromEnvironment(
		AppEnvironment environment
	) {
		return new(
			Global: new RateLimitWindowSettings(
				environment.GLOBAL_RATE_LIMIT_PERMIT_LIMIT,
				environment.GLOBAL_RATE_LIMIT_WINDOW_SECONDS
			),
			AnonymousOther: new RateLimitWindowSettings(
				environment
					.ANONYMOUS_OTHER_RATE_LIMIT_PERMIT_LIMIT,
				environment
					.ANONYMOUS_OTHER_RATE_LIMIT_WINDOW_SECONDS
			),
			Authenticated: new RateLimitWindowSettings(
				environment
					.AUTHENTICATED_RATE_LIMIT_PERMIT_LIMIT,
				environment
					.AUTHENTICATED_RATE_LIMIT_WINDOW_SECONDS
			),
			HeavySearch: new RateLimitWindowSettings(
				environment
					.HEAVY_SEARCH_RATE_LIMIT_PERMIT_LIMIT,
				environment
					.HEAVY_SEARCH_RATE_LIMIT_WINDOW_SECONDS
			),
			Bulk: new RateLimitWindowSettings(
				environment.BULK_RATE_LIMIT_PERMIT_LIMIT,
				environment.BULK_RATE_LIMIT_WINDOW_SECONDS
			),
			TenantBulk: new RateLimitWindowSettings(
				environment
					.TENANT_BULK_RATE_LIMIT_PERMIT_LIMIT,
				environment
					.TENANT_BULK_RATE_LIMIT_WINDOW_SECONDS
			),
			Email: new RateLimitWindowSettings(
				environment.EMAIL_RATE_LIMIT_PERMIT_LIMIT,
				environment.EMAIL_RATE_LIMIT_WINDOW_SECONDS
			),
			TenantEmail: new RateLimitWindowSettings(
				environment
					.TENANT_EMAIL_RATE_LIMIT_PERMIT_LIMIT,
				environment
					.TENANT_EMAIL_RATE_LIMIT_WINDOW_SECONDS
			),
			Export: new RateLimitWindowSettings(
				environment.EXPORT_RATE_LIMIT_PERMIT_LIMIT,
				environment.EXPORT_RATE_LIMIT_WINDOW_SECONDS
			),
			TenantExport: new RateLimitWindowSettings(
				environment
					.TENANT_EXPORT_RATE_LIMIT_PERMIT_LIMIT,
				environment
					.TENANT_EXPORT_RATE_LIMIT_WINDOW_SECONDS
			),
			Upload: new RateLimitWindowSettings(
				environment.UPLOAD_RATE_LIMIT_PERMIT_LIMIT,
				environment.UPLOAD_RATE_LIMIT_WINDOW_SECONDS
			),
			SocialConnect: new RateLimitWindowSettings(
				environment.SOCIAL_CONNECT_RATE_LIMIT_PERMIT_LIMIT,
				environment.SOCIAL_CONNECT_RATE_LIMIT_WINDOW_SECONDS
			)
		);
	}

}

public static class ApiRateLimitPolicies {
	public const string GlobalSafetyNet = "global-safety-net";
	public const string AnonymousOther = "anonymous-other";
	public const string AuthenticatedDefault = "authenticated-default";
	public const string HeavySearchList = "heavy-search-list";
	public const string BulkOperation = "bulk-operation";
	public const string TenantBulkOperation = "tenant-bulk-operation";
	public const string EmailOperation = "email-operation";
	public const string TenantEmailOperation = "tenant-email-operation";
	public const string Export = "export";
	public const string TenantExport = "tenant-export";
	public const string Upload = "upload";
	public const string SocialConnect = "social-connect";

	public static bool IsKnown(string? policyName) {
		return policyName is AnonymousOther
			or AuthenticatedDefault
			or HeavySearchList
			or BulkOperation
			or TenantBulkOperation
			or EmailOperation
			or TenantEmailOperation
			or Export
			or TenantExport
			or Upload
			or SocialConnect;
	}

	public static bool UsesValidatedSessionPartition(
		string? policyName
	) {
		return policyName is AuthenticatedDefault
			or HeavySearchList
			or BulkOperation
			or TenantBulkOperation
			or EmailOperation
			or TenantEmailOperation
			or Export
			or TenantExport
			or Upload
			or SocialConnect;
	}
}
