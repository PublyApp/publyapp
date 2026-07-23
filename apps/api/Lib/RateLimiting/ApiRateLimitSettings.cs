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
	RateLimitWindowSettings Upload
) {
	public static ApiRateLimitSettings ProductionDefaults {
		get {
			return new(
				Global: new RateLimitWindowSettings(1_200, 60),
				AnonymousOther: new RateLimitWindowSettings(120, 60),
				Authenticated: new RateLimitWindowSettings(600, 60),
				HeavySearch: new RateLimitWindowSettings(180, 60),
				Bulk: new RateLimitWindowSettings(30, 60),
				TenantBulk: new RateLimitWindowSettings(120, 60),
				Email: new RateLimitWindowSettings(10, 900),
				TenantEmail: new RateLimitWindowSettings(50, 900),
				Export: new RateLimitWindowSettings(10, 60),
				TenantExport: new RateLimitWindowSettings(40, 60),
				Upload: new RateLimitWindowSettings(20, 60)
			);
		}
	}
}

public static class ApiRateLimitPolicies {
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
}
