namespace PublyApp.Api.Lib.RateLimiting;

public sealed record RateLimitWindowSettings(
	int PermitLimit,
	int WindowSeconds
);

public sealed record AnonymousAuthRateLimitSettings(
	RateLimitWindowSettings PerIp,
	RateLimitWindowSettings PerEmail,
	RateLimitWindowSettings PasswordResetPerEmail
) {
	public static AnonymousAuthRateLimitSettings FromEnvironment(
		AppEnvironment environment
	) {
		return new(
			PerIp: new RateLimitWindowSettings(
				environment
					.ANON_AUTH_IP_RATE_LIMIT_PERMIT_LIMIT,
				environment
					.ANON_AUTH_IP_RATE_LIMIT_WINDOW_SECONDS
			),
			PerEmail: new RateLimitWindowSettings(
				environment
					.ANON_AUTH_EMAIL_RATE_LIMIT_PERMIT_LIMIT,
				environment
					.ANON_AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS
			),
			PasswordResetPerEmail:
				new RateLimitWindowSettings(
					environment
						.PASSWORD_RESET_EMAIL_RATE_LIMIT_PERMIT_LIMIT,
					environment
						.PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS
				)
		);
	}
}

public static class AnonymousAuthRateLimitPolicies {
	public const string PerIp =
		"anonymous-auth-per-ip";
	public const string PerEmail =
		"anonymous-auth-per-email";
	public const string PasswordResetPerEmail =
		"password-reset-per-email";
}
