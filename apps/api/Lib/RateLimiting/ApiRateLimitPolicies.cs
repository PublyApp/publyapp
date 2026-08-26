using System.Threading.RateLimiting;

using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace PublyApp.Api.Lib.RateLimiting;

internal sealed class ApiRateLimiterStore
	: IAsyncDisposable {
	private readonly IReadOnlyDictionary<
		string,
		RateLimitWindowSettings
	> _windows;
	private readonly IRateLimitCounterStore _counterStore;

	public ApiRateLimiterStore(
		ApiRateLimitSettings settings,
		IRateLimitCounterStore counterStore
	) {
		_counterStore = counterStore;
		_windows = new Dictionary<
			string,
			RateLimitWindowSettings
		>(StringComparer.Ordinal) {
			[ApiRateLimitPolicies.GlobalSafetyNet] = settings.Global,
			[ApiRateLimitPolicies.AnonymousOther] = settings.AnonymousOther,
			[ApiRateLimitPolicies.AuthenticatedDefault] = settings.Authenticated,
			[ApiRateLimitPolicies.HeavySearchList] = settings.HeavySearch,
			[ApiRateLimitPolicies.BulkOperation] = settings.Bulk,
			[ApiRateLimitPolicies.TenantBulkOperation] = settings.TenantBulk,
			[ApiRateLimitPolicies.EmailOperation] = settings.Email,
			[ApiRateLimitPolicies.TenantEmailOperation] = settings.TenantEmail,
			[ApiRateLimitPolicies.Export] = settings.Export,
			[ApiRateLimitPolicies.TenantExport] = settings.TenantExport,
			[ApiRateLimitPolicies.Upload] = settings.Upload,
			[ApiRateLimitPolicies.SocialConnect] = settings.SocialConnect,
		};
	}

	public RateLimiter CreateSingle(
		string policyName,
		string partitionKey
	) {
		var window = GetWindow(policyName);
		return new CounterBackedFixedWindowRateLimiter(
			_counterStore,
			policyName,
			partitionKey,
			window.PermitLimit,
			TimeSpan.FromSeconds(window.WindowSeconds)
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
		await _counterStore.DisposeAsync();
	}

	private RateLimitWindowSettings GetWindow(
		string policyName
	) {
		if (_windows.TryGetValue(policyName, out var window)) {
			return window;
		}

		throw new InvalidOperationException(
			$"Unknown API rate-limit policy '{policyName}'"
		);
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
