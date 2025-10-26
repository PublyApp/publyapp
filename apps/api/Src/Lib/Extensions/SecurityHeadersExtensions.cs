namespace MainApi.Src.Lib.Extensions;

public static class SecurityHeadersExtensions {
	/// <summary>
	/// Configures security headers for a JSON API backend.
	///
	/// Key Headers Explained:
	/// - X-Frame-Options: Prevents API responses from being embedded in iframes (clickjacking protection)
	/// - X-Content-Type-Options: Prevents MIME sniffing attacks
	/// - Referrer-Policy: Controls referrer information sent with requests
	/// - CORP (Cross-Origin-Resource-Policy): Controls who can READ responses
	///     * Set to "cross-origin" because frontend and API are different origins (localhost:5050 vs localhost:5000)
	///     * Works WITH CORS (not against it) - CORS controls who can REQUEST, CORP controls who can READ
	///
	/// Intentionally NOT set:
	/// - COOP (Cross-Origin-Opener-Policy): Only needed for HTML pages with window.open(), not relevant for JSON APIs
	/// - COEP (Cross-Origin-Embedder-Policy): Would block cross-origin API calls
	/// </summary>
	public static WebApplication UseSecurityHeaders(this WebApplication app) {
		var policyCollection = new HeaderPolicyCollection()
			.AddFrameOptionsDeny()
			.AddContentTypeOptionsNoSniff()
			.AddReferrerPolicyStrictOriginWhenCrossOrigin()
			.RemoveServerHeader()
			// CORP allows cross-origin reading (frontend on different port can read API responses)
			// This works together with CORS policy (configured in AppServicesConfig.cs)
			.AddCrossOriginResourcePolicy(builder => builder.CrossOrigin());

		if (!app.Environment.IsDevelopment()) {
			// Add HSTS in production
			policyCollection.AddStrictTransportSecurityMaxAgeIncludeSubDomains();
		}

		// Content Security Policy
		// - In development: Permissive for Scalar API docs (needs inline scripts/styles)
		// - In production: Very strict since we primarily serve JSON
		if (app.Environment.IsDevelopment()) {
			policyCollection.AddContentSecurityPolicy(builder => {
				builder.AddDefaultSrc().Self();
				builder.AddScriptSrc()
					.Self()
					.UnsafeInline()
					.UnsafeEval(); // Scalar API docs need these
				builder.AddStyleSrc()
					.Self()
					.UnsafeInline();
				builder.AddImgSrc()
					.Self()
					.Data()
					.From("https:");
				builder.AddFontSrc()
					.Self()
					.Data();
				builder.AddConnectSrc()
					.Self();
			});
		} else {
			// Production: Strict CSP for JSON API
			policyCollection.AddContentSecurityPolicy(builder => {
				builder.AddDefaultSrc().None();
				builder.AddFrameAncestors().None();
			});
		}

		app.UseSecurityHeaders(policyCollection);

		return app;
	}
}

