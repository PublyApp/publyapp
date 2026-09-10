using System.Threading.RateLimiting;

using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

using PublyApp.Api.Lib.Extensions;

namespace PublyApp.Api.Lib.RateLimiting;

internal sealed class AnonymousAuthRateLimiterStore
	: IAsyncDisposable {
	private readonly AnonymousAuthRateLimitSettings _Settings;
	private readonly IRateLimitCounterStore _CounterStore;

	public AnonymousAuthRateLimiterStore(
		AnonymousAuthRateLimitSettings settings,
		IRateLimitCounterStore counterStore
	) {
		_Settings = settings;
		_CounterStore = counterStore;
	}

	public RateLimiter CreatePerIp(string clientIp) {
		return new CounterBackedFixedWindowRateLimiter(
			_CounterStore,
			AnonymousAuthRateLimitPolicies.PerIp,
			clientIp,
			_Settings.PerIp.PermitLimit,
			TimeSpan.FromSeconds(
				_Settings.PerIp.WindowSeconds
			)
		);
	}

	public RateLimiter CreatePerEmail(
		string clientIp,
		string email,
		bool isPasswordReset
	) {
		var emailPolicyName = isPasswordReset
			? AnonymousAuthRateLimitPolicies.PasswordResetPerEmail
			: AnonymousAuthRateLimitPolicies.PerEmail;
		var emailWindow = isPasswordReset
			? _Settings.PasswordResetPerEmail
			: _Settings.PerEmail;

		return RateLimiter.CreateChained(
			CreatePerIp(clientIp),
			new CounterBackedFixedWindowRateLimiter(
				_CounterStore,
				emailPolicyName,
				email,
				emailWindow.PermitLimit,
				TimeSpan.FromSeconds(
					emailWindow.WindowSeconds
				)
			)
		);
	}

	public async ValueTask DisposeAsync() {
		await _CounterStore.DisposeAsync();
	}
}

internal sealed class AnonymousAuthPerIpRateLimitPolicy
	: IRateLimiterPolicy<string> {
	private readonly AnonymousAuthRateLimiterStore _Store;

	public AnonymousAuthPerIpRateLimitPolicy(
		AnonymousAuthRateLimiterStore store
	) {
		_Store = store;
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
			_ => _Store.CreatePerIp(clientIp)
		);
	}
}

internal sealed class AnonymousAuthPerEmailRateLimitPolicy
	: IRateLimiterPolicy<string> {
	private readonly AnonymousAuthRateLimiterStore _Store;

	public AnonymousAuthPerEmailRateLimitPolicy(
		AnonymousAuthRateLimiterStore store
	) {
		_Store = store;
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
			_Store,
			AnonymousAuthRateLimitPolicies.PerEmail,
			isPasswordReset: false
		);
	}
}

internal sealed class PasswordResetPerEmailRateLimitPolicy
	: IRateLimiterPolicy<string> {
	private readonly AnonymousAuthRateLimiterStore _Store;

	public PasswordResetPerEmailRateLimitPolicy(
		AnonymousAuthRateLimiterStore store
	) {
		_Store = store;
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
			_Store,
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
		services.AddRateLimitCounterStore(
			RateLimitCounterStoreSelection.FromEnvironment(
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
			RateLimitRejectionLogAggregator>();
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
				// production. Trust its exact address
				// or a dedicated proxy-only network:
				// shared-network peers could otherwise
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
			options.OnRejected = _WriteRejectedAsync;
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

	private static async ValueTask _WriteRejectedAsync(
		OnRejectedContext context,
		CancellationToken cancellationToken
	) {
		await RateLimitRejectionResponse.WriteAsync(
			context.HttpContext,
			context.Lease
		);
	}
}
