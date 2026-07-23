using System.Globalization;
using System.Threading.RateLimiting;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;

namespace PublyApp.Api.Lib.RateLimiting;

internal sealed class RecipientWeightedRateLimitFilter<
	TRequest
> : IEndpointFilter
	where TRequest : class {
	private readonly string _policyName;
	private readonly Func<TRequest, int>
		_getRecipientCount;

	public RecipientWeightedRateLimitFilter(
		string policyName,
		Func<TRequest, int> getRecipientCount
	) {
		_policyName = policyName;
		_getRecipientCount = getRecipientCount;
	}

	public async ValueTask<object?> InvokeAsync(
		EndpointFilterInvocationContext context,
		EndpointFilterDelegate next
	) {
		var request = context.Arguments
			.OfType<TRequest>()
			.FirstOrDefault();
		if (request is null) {
			throw new InvalidOperationException(
				$"Recipient-weighted policy "
					+ $"'{_policyName}' could not find "
					+ $"body {typeof(TRequest).Name}"
			);
		}

		var recipientCount =
			_getRecipientCount(request);
		if (recipientCount < 0) {
			throw new InvalidOperationException(
				"Recipient count cannot be negative"
			);
		}

		var additionalPermits =
			Math.Max(0, recipientCount - 1);
		if (additionalPermits == 0) {
			return await next(context);
		}

		var store = context.HttpContext
			.RequestServices
			.GetRequiredService<ApiRateLimiterStore>();
		using var limiter =
			store.CreateRecipientWeighted(
				_policyName,
				context.HttpContext
			);
		using var lease = await limiter.AcquireAsync(
			additionalPermits,
			context.HttpContext.RequestAborted
		);
		if (!lease.IsAcquired) {
			await RateLimitRejectionResponse.WriteAsync(
				context.HttpContext,
				lease
			);
			return null;
		}

		return await next(context);
	}
}

public static class
	RecipientWeightedRateLimitExtensions {
	public static RouteHandlerBuilder
		WithRecipientWeightedRateLimit<TRequest>(
			this RouteHandlerBuilder builder,
			string policyName,
			Func<TRequest, int> getRecipientCount
		) where TRequest : class {
		if (
			policyName is not (
				ApiRateLimitPolicies.EmailOperation
				or ApiRateLimitPolicies
					.TenantEmailOperation
			)
		) {
			throw new ArgumentException(
				"Recipient weighting requires an email "
					+ "rate-limit policy",
				nameof(policyName)
			);
		}

		return builder.AddEndpointFilter(
			new RecipientWeightedRateLimitFilter<
				TRequest
			>(
				policyName,
				getRecipientCount
			)
		);
	}
}

internal static class RateLimitRejectionResponse {
	public static async ValueTask WriteAsync(
		HttpContext context,
		RateLimitLease lease
	) {
		var rejectionInfo =
			RateLimitRejectionContext.Get(context);
		if (rejectionInfo is not null) {
			var logger = context.RequestServices
				.GetRequiredService<ILoggerFactory>()
				.CreateLogger(
					"PublyApp.Api.RateLimiting"
				);
			logger.LogWarning(
				"Rate limit rejected request for policy "
					+ "{RateLimitPolicy} partition "
					+ "{RateLimitPartitionFingerprint}",
				rejectionInfo.PolicyName,
				rejectionInfo.PartitionFingerprint
			);
		}

		var retryAfter = TimeSpan.FromSeconds(1);
		if (
			lease.TryGetMetadata(
				MetadataName.RetryAfter,
				out var leaseRetryAfter
			)
		) {
			retryAfter = leaseRetryAfter;
		}

		var retryAfterSeconds = Math.Max(
			1,
			(int)Math.Ceiling(
				retryAfter.TotalSeconds
			)
		);
		context.Response.Headers[
			"Retry-After"
		] = retryAfterSeconds.ToString(
			CultureInfo.InvariantCulture
		);

		await TypedProblems.TooManyRequests(
			"Too many requests. Please try again later.",
			ResponseKeys.TooManyRequests
		).ExecuteAsync(context);
	}
}
