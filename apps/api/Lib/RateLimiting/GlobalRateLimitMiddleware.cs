namespace PublyApp.Api.Lib.RateLimiting;

internal sealed class GlobalRateLimitMiddleware {
	private readonly RequestDelegate _next;

	public GlobalRateLimitMiddleware(
		RequestDelegate next
	) {
		_next = next;
	}

	public async Task InvokeAsync(HttpContext context) {
		if (IsExcluded(context)) {
			await _next(context);
			return;
		}

		var clientIp =
			AnonymousAuthRateLimitPartitionKeys
				.GetClientIp(context);
		RateLimitRejectionContext.Set(
			context,
			ApiRateLimitPolicies.GlobalSafetyNet,
			clientIp
		);
		var store = context.RequestServices
			.GetRequiredService<ApiRateLimiterStore>();
		using var limiter = store.CreateGlobal(clientIp);
		using var lease = await limiter.AcquireAsync(
			1,
			context.RequestAborted
		);
		if (!lease.IsAcquired) {
			await RateLimitRejectionResponse.WriteAsync(
				context,
				lease
			);
			return;
		}

		await _next(context);
	}

	internal static bool IsExcluded(
		HttpContext context
	) {
		return context.Request.Path == "/health"
			|| context.Request.Path == "/health/live"
			|| context.Request.Path == "/health/ready"
			|| context.Request.Path == "/health/drain"
			|| context.Request.Path.StartsWithSegments(
				"/files"
			);
	}
}

public static class GlobalRateLimitExtensions {
	public static IApplicationBuilder
		UseGlobalRateLimit(
			this IApplicationBuilder app
		) {
		return app.UseMiddleware<
			GlobalRateLimitMiddleware>();
	}
}
