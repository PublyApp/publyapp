using System.Threading.RateLimiting;

using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace PublyApp.Api.Lib.RateLimiting;

internal sealed class ApiRateLimiterStore
	: IAsyncDisposable {
	private readonly IReadOnlyDictionary<
		string,
		RateLimitWindowSettings
	> _Windows;
	private readonly IRateLimitCounterStore _CounterStore;

	public ApiRateLimiterStore(
		ApiRateLimitSettings settings,
		IRateLimitCounterStore counterStore
	) {
		_CounterStore = counterStore;
		_Windows = new Dictionary<
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
			[ApiRateLimitPolicies.SystemJobTrigger] = settings.SystemJobTrigger,
		};
	}

	public RateLimiter CreateSingle(
		string policyName,
		string partitionKey
	) {
		var window = _GetWindow(policyName);
		return new CounterBackedFixedWindowRateLimiter(
			_CounterStore,
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
		await _CounterStore.DisposeAsync();
	}

	private RateLimitWindowSettings _GetWindow(
		string policyName
	) {
		if (_Windows.TryGetValue(policyName, out var window)) {
			return window;
		}

		throw new InvalidOperationException(
			$"Unknown API rate-limit policy '{policyName}'"
		);
	}
}

internal sealed class ApiRateLimiterOptionsSetup
	: IConfigureOptions<RateLimiterOptions> {
	private readonly ApiRateLimiterStore _Store;

	public ApiRateLimiterOptionsSetup(
		ApiRateLimiterStore store
	) {
		_Store = store;
	}

	public void Configure(RateLimiterOptions options) {
		_AddSinglePolicy(
			options,
			ApiRateLimitPolicies.AnonymousOther,
			_GetClientIp
		);
		_AddSinglePolicy(
			options,
			ApiRateLimitPolicies.AuthenticatedDefault,
			ApiRateLimitPartitionKeys
				.GetSessionFingerprint
		);
		_AddSinglePolicy(
			options,
			ApiRateLimitPolicies.HeavySearchList,
			ApiRateLimitPartitionKeys
				.GetSessionFingerprint
		);
		_AddSinglePolicy(
			options,
			ApiRateLimitPolicies.BulkOperation,
			ApiRateLimitPartitionKeys
				.GetSessionFingerprint
		);
		_AddTenantPolicy(
			options,
			ApiRateLimitPolicies.TenantBulkOperation,
			ApiRateLimitPolicies.BulkOperation
		);
		_AddSinglePolicy(
			options,
			ApiRateLimitPolicies.EmailOperation,
			ApiRateLimitPartitionKeys
				.GetSessionFingerprint
		);
		_AddTenantPolicy(
			options,
			ApiRateLimitPolicies.TenantEmailOperation,
			ApiRateLimitPolicies.EmailOperation
		);
		_AddSinglePolicy(
			options,
			ApiRateLimitPolicies.Export,
			ApiRateLimitPartitionKeys
				.GetSessionFingerprint
		);
		_AddTenantPolicy(
			options,
			ApiRateLimitPolicies.TenantExport,
			ApiRateLimitPolicies.Export
		);
		_AddSinglePolicy(
			options,
			ApiRateLimitPolicies.Upload,
			ApiRateLimitPartitionKeys
				.GetSessionFingerprint
		);
		// Stricter-than-read window (spec §4): connect/reconnect call Bluesky with
		// user-supplied credentials; partition per session like other authed policies.
		_AddSinglePolicy(
			options,
			ApiRateLimitPolicies.SocialConnect,
			ApiRateLimitPartitionKeys
				.GetSessionFingerprint
		);
		// A5 (#636): trigger-now is a real enqueue; partition per validated session
		// fingerprint so two staff sessions have independent trigger budgets.
		_AddSinglePolicy(
			options,
			ApiRateLimitPolicies.SystemJobTrigger,
			ApiRateLimitPartitionKeys
				.GetSessionFingerprint
		);
	}

	private void _AddSinglePolicy(
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
					_ => _Store.CreateSingle(
						policyName,
						partitionKey
					)
				);
			}
		);
	}

	private void _AddTenantPolicy(
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
					_ => _Store.CreateTenantChained(
						sessionPolicyName,
						sessionFingerprint,
						policyName,
						tenantKey
					)
				);
			}
		);
	}

	private static string _GetClientIp(
		HttpContext context
	) {
		return AnonymousAuthRateLimitPartitionKeys
			.GetClientIp(context);
	}
}
