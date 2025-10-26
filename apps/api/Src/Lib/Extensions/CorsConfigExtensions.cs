using Microsoft.Extensions.Options;

namespace MainApi.Src.Lib.Extensions;

public static class CorsConfigExtensions {
	public static WebApplicationBuilder AddCors(this WebApplicationBuilder builder) {
		// Add CORS
		builder.Services.AddCors(options => {
			options.AddDefaultPolicy(
					policy => {
						// Get session token header name from configuration
						var appSettings = builder.Services.BuildServiceProvider().GetRequiredService<IOptions<AppSettings>>();
						var sessionTokenHeaderKey = appSettings.Value.SESSION_TOKEN_HEADER_KEY;

						policy
							.WithOrigins(AppEnvironment.FRONT_URL)
							.AllowAnyMethod() // GET, POST, PUT, DELETE, PATCH, OPTIONS
							.WithHeaders(
								// Standard headers
								"Content-Type",
								"Accept",
								// Custom headers
								sessionTokenHeaderKey    // X-Session-Token
																				 // "X-Tenant-Id"
							)
							.WithExposedHeaders(sessionTokenHeaderKey) // Allow frontend to read this header from responses
							.SetPreflightMaxAge(TimeSpan.FromMinutes(10)); // Cache preflight requests
					});
		});
		return builder;
	}
}
