using System.Threading.RateLimiting;

using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace PublyApp.Api.Lib.RateLimiting;

internal sealed class ApiRateLimiterStore
	: IAsyncDisposable {
	private readonly IReadOnlyDictionary<
		string,
		StoredLimiter
	> _limiters;

	public ApiRateLimiterStore(
		ApiRateLimitSettings settings
	) {
		_limiters = new Dictionary<
			string,
			StoredLimiter
		>(StringComparer.Ordinal) {
			[ApiRateLimitPolicies.GlobalSafetyNet] =
				CreateLimiter(settings.Global),
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
			[ApiRateLimitPolicies.SocialConnect] =
				CreateLimiter(settings.SocialConnect),
		};
	}

	public RateLimiter CreateSingle(
		string policyName,
		string partitionKey
	) {
		var storedLimiter = GetLimiter(policyName);
		return new PartitionedResourceRateLimiter(
			storedLimiter.Limiter,
			partitionKey,
			storedLimiter.Window
		);
	}

	public RateLimiter CreateGlobal(
		string clientIp
	) {
		return CreateSingle(
			ApiRateLimitPolicies.GlobalSafetyNet,
			clientIp
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

	public RateLimiter CreateRecipientWeighted(
		string policyName,
		HttpContext context
	) {
		var sessionFingerprint =
			ApiRateLimitPartitionKeys
				.GetSessionFingerprint(context);
		if (
			policyName
				== ApiRateLimitPolicies.EmailOperation
		) {
			RateLimitRejectionContext.Set(
				context,
				policyName,
				sessionFingerprint
			);
			return CreateSingle(
				policyName,
				sessionFingerprint
			);
		}

		if (
			policyName
				== ApiRateLimitPolicies
					.TenantEmailOperation
		) {
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
			return CreateTenantChained(
				ApiRateLimitPolicies.EmailOperation,
				sessionFingerprint,
				policyName,
				tenantKey
			);
		}

		throw new InvalidOperationException(
			$"Policy '{policyName}' does not support "
				+ "recipient weighting"
		);
	}

	public async ValueTask DisposeAsync() {
		foreach (var storedLimiter in _limiters.Values) {
			await storedLimiter.Limiter.DisposeAsync();
		}
	}

	private StoredLimiter GetLimiter(
		string policyName
	) {
		if (_limiters.TryGetValue(policyName, out var limiter)) {
			return limiter;
		}

		throw new InvalidOperationException(
			$"Unknown API rate-limit policy '{policyName}'"
		);
	}

	private static StoredLimiter
		CreateLimiter(RateLimitWindowSettings settings) {
		var window = TimeSpan.FromSeconds(
			settings.WindowSeconds
		);
		var limiter = PartitionedRateLimiter.Create<
				string,
				string
			>(partitionKey => {
				return RateLimitPartition
					.GetFixedWindowLimiter(
						partitionKey,
						_ => new FixedWindowRateLimiterOptions {
							PermitLimit =
								settings.PermitLimit,
							Window = window,
							QueueLimit = 0,
							QueueProcessingOrder =
								QueueProcessingOrder
									.OldestFirst,
							AutoReplenishment = false,
						}
					);
			});
		return new StoredLimiter(limiter, window);
	}

	private sealed record StoredLimiter(
		PartitionedRateLimiter<string> Limiter,
		TimeSpan Window
	);
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
		// Stricter-than-read window (spec §4): connect/reconnect call Bluesky with
		// user-supplied credentials; partition per session like other authed policies.
		AddSinglePolicy(
			options,
			ApiRateLimitPolicies.SocialConnect,
			ApiRateLimitPartitionKeys
				.GetSessionFingerprint
		);
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
}
