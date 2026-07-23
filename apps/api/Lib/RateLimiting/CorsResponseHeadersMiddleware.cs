using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.Net.Http.Headers;

namespace PublyApp.Api.Lib.RateLimiting;

internal sealed class CorsResponseHeadersMiddleware {
	private readonly RequestDelegate _next;

	public CorsResponseHeadersMiddleware(
		RequestDelegate next
	) {
		_next = next;
	}

	public async Task InvokeAsync(
		HttpContext context,
		ICorsPolicyProvider policyProvider,
		ICorsService corsService
	) {
		if (
			context.Request.Headers.ContainsKey(
				HeaderNames.Origin
			)
		) {
			var policy = await policyProvider
				.GetPolicyAsync(context, policyName: null);
			if (policy is not null) {
				var result = corsService.EvaluatePolicy(
					context,
					policy
				);
				corsService.ApplyResult(
					result,
					context.Response
				);
			}
		}

		await _next(context);
	}
}

public static class CorsResponseHeadersExtensions {
	public static IApplicationBuilder
		UseCorsResponseHeaders(
			this IApplicationBuilder app
		) {
		return app.UseMiddleware<
			CorsResponseHeadersMiddleware>();
	}
}
