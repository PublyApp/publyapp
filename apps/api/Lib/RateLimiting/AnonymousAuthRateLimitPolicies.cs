using System.Globalization;
using System.Threading.RateLimiting;

using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;

using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;

namespace PublyApp.Api.Lib.RateLimiting;

internal sealed class AnonymousAuthRateLimiterStore
	: IAsyncDisposable {
	private readonly PartitionedRateLimiter<string>
		_perIp;
	private readonly PartitionedRateLimiter<string>
		_perEmail;
	private readonly PartitionedRateLimiter<string>
		_passwordResetPerEmail;

	public AnonymousAuthRateLimiterStore(
		AnonymousAuthRateLimitSettings settings
	) {
		_perIp = CreateLimiter(settings.PerIp);
		_perEmail = CreateLimiter(settings.PerEmail);
		_passwordResetPerEmail =
			CreateLimiter(settings.PasswordResetPerEmail);
	}

	public RateLimiter CreatePerIp(string clientIp) {
		return new PartitionedResourceRateLimiter(
			_perIp,
			clientIp
		);
	}

	public RateLimiter CreatePerEmail(
		string clientIp,
		string email,
		bool isPasswordReset
	) {
		var emailLimiter = isPasswordReset
			? _passwordResetPerEmail
			: _perEmail;

		return RateLimiter.CreateChained(
			new PartitionedResourceRateLimiter(
				_perIp,
				clientIp
			),
			new PartitionedResourceRateLimiter(
				emailLimiter,
				email
			)
		);
	}

	public async ValueTask DisposeAsync() {
		await _perIp.DisposeAsync();
		await _perEmail.DisposeAsync();
		await _passwordResetPerEmail.DisposeAsync();
	}

	private static PartitionedRateLimiter<string>
		CreateLimiter(RateLimitWindowSettings settings) {
		return PartitionedRateLimiter.Create<
			string,
			string
		>(partitionKey => {
			return RateLimitPartition
				.GetFixedWindowLimiter(
					partitionKey,
					_ => new FixedWindowRateLimiterOptions {
						PermitLimit =
							settings.PermitLimit,
						Window = TimeSpan.FromSeconds(
							settings.WindowSeconds
						),
						QueueLimit = 0,
						QueueProcessingOrder =
							QueueProcessingOrder
								.OldestFirst,
						AutoReplenishment = false,
					}
				);
		});
	}
}

internal sealed class PartitionedResourceRateLimiter
	: RateLimiter {
	private readonly PartitionedRateLimiter<string>
		_inner;
	private readonly string _resource;

	public PartitionedResourceRateLimiter(
		PartitionedRateLimiter<string> inner,
		string resource
	) {
		_inner = inner;
		_resource = resource;
	}

	public override TimeSpan? IdleDuration {
		get { return null; }
	}

	public override RateLimiterStatistics? GetStatistics() {
		return _inner.GetStatistics(_resource);
	}

	protected override RateLimitLease AttemptAcquireCore(
		int permitCount
	) {
		return _inner.AttemptAcquire(
			_resource,
			permitCount
		);
	}

	protected override ValueTask<RateLimitLease>
		AcquireAsyncCore(
			int permitCount,
			CancellationToken cancellationToken
		) {
		return _inner.AcquireAsync(
			_resource,
			permitCount,
			cancellationToken
		);
	}

	protected override void Dispose(bool disposing) {
		// The singleton store owns the shared partitioned
		// limiter. Policy partitions dispose only this adapter.
	}

	protected override ValueTask DisposeAsyncCore() {
		return ValueTask.CompletedTask;
	}
}

internal sealed class AnonymousAuthPerIpRateLimitPolicy
	: IRateLimiterPolicy<string> {
	private readonly AnonymousAuthRateLimiterStore _store;

	public AnonymousAuthPerIpRateLimitPolicy(
		AnonymousAuthRateLimiterStore store
	) {
		_store = store;
	}

	public Func<
		OnRejectedContext,
		CancellationToken,
		ValueTask
	>? OnRejected {
		get { return null; }
	}

	public RateLimitPartition<string> GetPartition(
		HttpContext httpContext
	) {
		var clientIp =
			AnonymousAuthRateLimitPartitionKeys
				.GetClientIp(httpContext);

		return RateLimitPartition.Get(
			clientIp,
			_ => _store.CreatePerIp(clientIp)
		);
	}
}

internal sealed class AnonymousAuthPerEmailRateLimitPolicy
	: IRateLimiterPolicy<string> {
	private readonly AnonymousAuthRateLimiterStore _store;

	public AnonymousAuthPerEmailRateLimitPolicy(
		AnonymousAuthRateLimiterStore store
	) {
		_store = store;
	}

	public Func<
		OnRejectedContext,
		CancellationToken,
		ValueTask
	>? OnRejected {
		get { return null; }
	}

	public RateLimitPartition<string> GetPartition(
		HttpContext httpContext
	) {
		return EmailRateLimitPartition.Create(
			httpContext,
			_store,
			isPasswordReset: false
		);
	}
}

internal sealed class PasswordResetPerEmailRateLimitPolicy
	: IRateLimiterPolicy<string> {
	private readonly AnonymousAuthRateLimiterStore _store;

	public PasswordResetPerEmailRateLimitPolicy(
		AnonymousAuthRateLimiterStore store
	) {
		_store = store;
	}

	public Func<
		OnRejectedContext,
		CancellationToken,
		ValueTask
	>? OnRejected {
		get { return null; }
	}

	public RateLimitPartition<string> GetPartition(
		HttpContext httpContext
	) {
		return EmailRateLimitPartition.Create(
			httpContext,
			_store,
			isPasswordReset: true
		);
	}
}

internal static class EmailRateLimitPartition {
	public static RateLimitPartition<string> Create(
		HttpContext httpContext,
		AnonymousAuthRateLimiterStore store,
		bool isPasswordReset
	) {
		var clientIp =
			AnonymousAuthRateLimitPartitionKeys
				.GetClientIp(httpContext);
		var email =
			AnonymousAuthRateLimitPartitionKeys
				.GetEmail(httpContext);
		var partitionKey = $"{clientIp}\n{email}";

		return RateLimitPartition.Get(
			partitionKey,
			_ => store.CreatePerEmail(
				clientIp,
				email,
				isPasswordReset
			)
		);
	}
}

public static class AnonymousAuthRateLimitExtensions {
	public static IServiceCollection
		AddAnonymousAuthRateLimiting(
			this IServiceCollection services
		) {
		services.AddSingleton(
			AnonymousAuthRateLimitSettings
				.FromEnvironment(
					AppEnvironment.Instance
				)
		);
		services.AddSingleton<
			AnonymousAuthRateLimiterStore>();
		services.AddSingleton<
			AnonymousAuthPerIpRateLimitPolicy>();
		services.AddSingleton<
			AnonymousAuthPerEmailRateLimitPolicy>();
		services.AddSingleton<
			PasswordResetPerEmailRateLimitPolicy>();

		services.Configure<ForwardedHeadersOptions>(
			options => {
				options.ForwardedHeaders =
					ForwardedHeaders.XForwardedFor
					| ForwardedHeaders.XForwardedProto;
				options.ForwardLimit = 1;
				options.KnownProxies.Clear();
				options.KnownIPNetworks.Clear();

				// Traefik is the only trusted hop in
				// production. The exact dokploy-network
				// CIDR is deployment config: trusting
				// arbitrary senders would let clients
				// forge X-Forwarded-For and evade limits.
				foreach (
					var cidr in AppEnvironment
						.Instance
						.TRUSTED_PROXY_CIDRS
				) {
					options.KnownIPNetworks.Add(
						System.Net.IPNetwork.Parse(cidr)
					);
				}
			}
		);

		services.AddRateLimiter(options => {
			options.RejectionStatusCode =
				StatusCodes.Status429TooManyRequests;
			options.OnRejected = WriteRejectedAsync;
			options.AddPolicy<
				string,
				AnonymousAuthPerIpRateLimitPolicy
			>(
				AnonymousAuthRateLimitPolicies.PerIp
			);
			options.AddPolicy<
				string,
				AnonymousAuthPerEmailRateLimitPolicy
			>(
				AnonymousAuthRateLimitPolicies.PerEmail
			);
			options.AddPolicy<
				string,
				PasswordResetPerEmailRateLimitPolicy
			>(
				AnonymousAuthRateLimitPolicies
					.PasswordResetPerEmail
			);
		});

		return services;
	}

	public static IApplicationBuilder
		UseEmailRateLimitPartitioning(
			this IApplicationBuilder app
		) {
		return app.UseMiddleware<
			EmailRateLimitPartitionMiddleware>();
	}

	public static RouteHandlerBuilder
		RequireAnonymousAuthIpRateLimit(
			this RouteHandlerBuilder builder
		) {
		return builder
			.RequireRateLimiting(
				AnonymousAuthRateLimitPolicies.PerIp
			)
			.ProducesAppProblem(
				StatusCodes.Status429TooManyRequests
			);
	}

	public static RouteHandlerBuilder
		RequireAnonymousAuthEmailRateLimit(
			this RouteHandlerBuilder builder,
			bool isPasswordReset = false
		) {
		var policy = isPasswordReset
			? AnonymousAuthRateLimitPolicies
				.PasswordResetPerEmail
			: AnonymousAuthRateLimitPolicies.PerEmail;

		return builder
			.WithMetadata(new EmailRateLimitMetadata())
			.RequireRateLimiting(policy)
			.ProducesAppProblem(
				StatusCodes.Status429TooManyRequests
			);
	}

	private static async ValueTask WriteRejectedAsync(
		OnRejectedContext context,
		CancellationToken cancellationToken
	) {
		var retryAfter = TimeSpan.FromSeconds(1);
		if (
			context.Lease.TryGetMetadata(
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
		context.HttpContext.Response.Headers[
			"Retry-After"
		] = retryAfterSeconds.ToString(
			CultureInfo.InvariantCulture
		);

		await TypedProblems.TooManyRequests(
			"Too many requests. Please try again later.",
			ResponseKeys.TooManyRequests
		).ExecuteAsync(context.HttpContext);
	}
}
