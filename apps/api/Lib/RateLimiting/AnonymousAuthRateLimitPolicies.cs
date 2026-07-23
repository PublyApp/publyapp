using System.Threading.RateLimiting;

using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

using PublyApp.Api.Lib.Extensions;

namespace PublyApp.Api.Lib.RateLimiting;

internal sealed class AnonymousAuthRateLimiterStore
	: IAsyncDisposable {
	private readonly PartitionedRateLimiter<string>
		_perIp;
	private readonly PartitionedRateLimiter<string>
		_perEmail;
	private readonly PartitionedRateLimiter<string>
		_passwordResetPerEmail;
	private readonly TimeSpan _perIpWindow;
	private readonly TimeSpan _perEmailWindow;
	private readonly TimeSpan _passwordResetPerEmailWindow;

	public AnonymousAuthRateLimiterStore(
		AnonymousAuthRateLimitSettings settings
	) {
		_perIp = CreateLimiter(settings.PerIp);
		_perEmail = CreateLimiter(settings.PerEmail);
		_passwordResetPerEmail =
			CreateLimiter(settings.PasswordResetPerEmail);
		_perIpWindow = TimeSpan.FromSeconds(
			settings.PerIp.WindowSeconds
		);
		_perEmailWindow = TimeSpan.FromSeconds(
			settings.PerEmail.WindowSeconds
		);
		_passwordResetPerEmailWindow =
			TimeSpan.FromSeconds(
				settings.PasswordResetPerEmail
					.WindowSeconds
			);
	}

	public RateLimiter CreatePerIp(string clientIp) {
		return new PartitionedResourceRateLimiter(
			_perIp,
			clientIp,
			_perIpWindow
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
		var emailWindow = isPasswordReset
			? _passwordResetPerEmailWindow
			: _perEmailWindow;

		return RateLimiter.CreateChained(
			new PartitionedResourceRateLimiter(
				_perIp,
				clientIp,
				_perIpWindow
			),
			new PartitionedResourceRateLimiter(
				emailLimiter,
				email,
				emailWindow
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
	private readonly TimeSpan _retentionWindow;
	private long _lastAccessTimestamp;

	public PartitionedResourceRateLimiter(
		PartitionedRateLimiter<string> inner,
		string resource,
		TimeSpan retentionWindow
	) {
		_inner = inner;
		_resource = resource;
		_retentionWindow = retentionWindow;
		_lastAccessTimestamp =
			TimeProvider.System.GetTimestamp();
	}

	public override TimeSpan? IdleDuration {
		get {
			var lastAccess = Volatile.Read(
				ref _lastAccessTimestamp
			);
			var elapsed = TimeProvider.System
				.GetElapsedTime(lastAccess);
			if (elapsed < _retentionWindow) {
				return null;
			}

			return elapsed - _retentionWindow;
		}
	}

	public override RateLimiterStatistics? GetStatistics() {
		return _inner.GetStatistics(_resource);
	}

	protected override RateLimitLease AttemptAcquireCore(
		int permitCount
	) {
		MarkAccess();
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
		MarkAccess();
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

	private void MarkAccess() {
		Interlocked.Exchange(
			ref _lastAccessTimestamp,
			TimeProvider.System.GetTimestamp()
		);
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
		RateLimitRejectionContext.Set(
			httpContext,
			AnonymousAuthRateLimitPolicies.PerIp,
			clientIp
		);

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
			AnonymousAuthRateLimitPolicies.PerEmail,
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
			AnonymousAuthRateLimitPolicies
				.PasswordResetPerEmail,
			isPasswordReset: true
		);
	}
}

internal static class EmailRateLimitPartition {
	public static RateLimitPartition<string> Create(
		HttpContext httpContext,
		AnonymousAuthRateLimiterStore store,
		string policyName,
		bool isPasswordReset
	) {
		var clientIp =
			AnonymousAuthRateLimitPartitionKeys
				.GetClientIp(httpContext);
		var email =
			AnonymousAuthRateLimitPartitionKeys
				.GetEmail(httpContext);
		var partitionKey = $"{clientIp}\n{email}";
		RateLimitRejectionContext.Set(
			httpContext,
			policyName,
			partitionKey
		);

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
		services.AddSingleton(
			ApiRateLimitSettings.FromEnvironment(
				AppEnvironment.Instance
			)
		);
		services.AddSingleton<ApiRateLimiterStore>();
		services.AddSingleton<
			IConfigureOptions<RateLimiterOptions>,
			ApiRateLimiterOptionsSetup>();

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
		await RateLimitRejectionResponse.WriteAsync(
			context.HttpContext,
			context.Lease
		);
	}
}
