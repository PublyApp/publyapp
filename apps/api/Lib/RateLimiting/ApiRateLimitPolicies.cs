using System.Threading.RateLimiting;

using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace PublyApp.Api.Lib.RateLimiting;

internal sealed class ApiRateLimiterStore
	: IAsyncDisposable {
	private readonly IReadOnlyDictionary<
		string,
		PartitionedRateLimiter<string>
	> _limiters;

	public RateLimitWindowSettings GlobalSettings { get; }

	public ApiRateLimiterStore(
		ApiRateLimitSettings settings
	) {
		GlobalSettings = settings.Global;
		_limiters = new Dictionary<
			string,
			PartitionedRateLimiter<string>
		>(StringComparer.Ordinal) {
			[ApiRateLimitPolicies.AnonymousOther] =
				CreateLimiter(settings.AnonymousOther),
			[ApiRateLimitPolicies.AuthenticatedDefault] =
				CreateLimiter(settings.Authenticated),
			[ApiRateLimitPolicies.HeavySearchList] =
				CreateLimiter(settings.HeavySearch),
			[ApiRateLimitPolicies.BulkOperation] =
				CreateLimiter(settings.Bulk),
			[ApiRateLimitPolicies.TenantBulkOperation] =
				CreateLimiter(settings.TenantBulk),
			[ApiRateLimitPolicies.EmailOperation] =
				CreateLimiter(settings.Email),
			[ApiRateLimitPolicies.TenantEmailOperation] =
				CreateLimiter(settings.TenantEmail),
			[ApiRateLimitPolicies.Export] =
				CreateLimiter(settings.Export),
			[ApiRateLimitPolicies.TenantExport] =
				CreateLimiter(settings.TenantExport),
			[ApiRateLimitPolicies.Upload] =
				CreateLimiter(settings.Upload),
		};
	}

	public RateLimiter CreateSingle(
		string policyName,
		string partitionKey
	) {
		return new PartitionedResourceRateLimiter(
			GetLimiter(policyName),
			partitionKey
		);
	}

	public RateLimiter CreateTenantChained(
		string sessionPolicyName,
		string sessionFingerprint,
		string tenantPolicyName,
		string tenantKey
	) {
		return RateLimiter.CreateChained(
			CreateSingle(
				sessionPolicyName,
				sessionFingerprint
			),
			CreateSingle(
				tenantPolicyName,
				tenantKey
			)
		);
	}

	public async ValueTask DisposeAsync() {
		foreach (var limiter in _limiters.Values) {
			await limiter.DisposeAsync();
		}
	}

	private PartitionedRateLimiter<string> GetLimiter(
		string policyName
	) {
		if (_limiters.TryGetValue(policyName, out var limiter)) {
			return limiter;
		}

		throw new InvalidOperationException(
			$"Unknown API rate-limit policy '{policyName}'"
		);
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

internal sealed class ApiRateLimiterOptionsSetup
	: IConfigureOptions<RateLimiterOptions> {
	private readonly ApiRateLimiterStore _store;

	public ApiRateLimiterOptionsSetup(
		ApiRateLimiterStore store
	) {
		_store = store;
	}

	public void Configure(RateLimiterOptions options) {
		options.GlobalLimiter =
			CreateGlobalLimiter(
				_store.GlobalSettings
			);
		AddSinglePolicy(
			options,
			ApiRateLimitPolicies.AnonymousOther,
			GetClientIp
		);
		AddSinglePolicy(
			options,
			ApiRateLimitPolicies.AuthenticatedDefault,
			ApiRateLimitPartitionKeys
				.GetSessionFingerprint
		);
		AddSinglePolicy(
			options,
			ApiRateLimitPolicies.HeavySearchList,
			ApiRateLimitPartitionKeys
				.GetSessionFingerprint
		);
		AddSinglePolicy(
			options,
			ApiRateLimitPolicies.BulkOperation,
			ApiRateLimitPartitionKeys
				.GetSessionFingerprint
		);
		AddTenantPolicy(
			options,
			ApiRateLimitPolicies.TenantBulkOperation,
			ApiRateLimitPolicies.BulkOperation
		);
		AddSinglePolicy(
			options,
			ApiRateLimitPolicies.EmailOperation,
			ApiRateLimitPartitionKeys
				.GetSessionFingerprint
		);
		AddTenantPolicy(
			options,
			ApiRateLimitPolicies.TenantEmailOperation,
			ApiRateLimitPolicies.EmailOperation
		);
		AddSinglePolicy(
			options,
			ApiRateLimitPolicies.Export,
			ApiRateLimitPartitionKeys
				.GetSessionFingerprint
		);
		AddTenantPolicy(
			options,
			ApiRateLimitPolicies.TenantExport,
			ApiRateLimitPolicies.Export
		);
		AddSinglePolicy(
			options,
			ApiRateLimitPolicies.Upload,
			ApiRateLimitPartitionKeys
				.GetSessionFingerprint
		);
	}

	private static PartitionedRateLimiter<HttpContext>
		CreateGlobalLimiter(
			RateLimitWindowSettings settings
		) {
		return PartitionedRateLimiter.Create<
			HttpContext,
			string
		>(context => {
			if (IsExcludedFromGlobalLimit(context)) {
				return RateLimitPartition.GetNoLimiter(
					"global-excluded"
				);
			}

			var clientIp = GetClientIp(context);
			RateLimitRejectionContext.Set(
				context,
				ApiRateLimitPolicies.GlobalSafetyNet,
				clientIp
			);
			return RateLimitPartition
				.GetFixedWindowLimiter(
					clientIp,
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

	private void AddSinglePolicy(
		RateLimiterOptions options,
		string policyName,
		Func<HttpContext, string> getPartitionKey
	) {
		options.AddPolicy(
			policyName,
			context => {
				var partitionKey = getPartitionKey(
					context
				);
				RateLimitRejectionContext.Set(
					context,
					policyName,
					partitionKey
				);
				return RateLimitPartition.Get(
					$"{policyName}\n{partitionKey}",
					_ => _store.CreateSingle(
						policyName,
						partitionKey
					)
				);
			}
		);
	}

	private void AddTenantPolicy(
		RateLimiterOptions options,
		string policyName,
		string sessionPolicyName
	) {
		options.AddPolicy(
			policyName,
			context => {
				var sessionFingerprint =
					ApiRateLimitPartitionKeys
						.GetSessionFingerprint(context);
				var tenantKey =
					ApiRateLimitPartitionKeys
						.GetTenant(context);
				var partitionKey =
					$"{sessionFingerprint}\n{tenantKey}";
				RateLimitRejectionContext.Set(
					context,
					policyName,
					partitionKey
				);
				return RateLimitPartition.Get(
					$"{policyName}\n{partitionKey}",
					_ => _store.CreateTenantChained(
						sessionPolicyName,
						sessionFingerprint,
						policyName,
						tenantKey
					)
				);
			}
		);
	}

	private static string GetClientIp(
		HttpContext context
	) {
		return AnonymousAuthRateLimitPartitionKeys
			.GetClientIp(context);
	}

	private static bool IsExcludedFromGlobalLimit(
		HttpContext context
	) {
		return context.Request.Path.StartsWithSegments(
				"/health"
			)
			|| context.Request.Path.StartsWithSegments(
				"/files"
			);
	}
}
