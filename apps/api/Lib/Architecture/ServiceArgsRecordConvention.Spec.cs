namespace MainApi.Lib.Architecture;

using System.Reflection;

using FluentAssertions;

using MainApi.Lib.Testing.Helpers;
using MainApi.Modules.AuditLogs.Services;
using MainApi.Modules.Impersonations.Services;
using MainApi.Modules.Invitations.Services;
using MainApi.Modules.Profiles.Services;
using MainApi.Modules.SystemNotices.Services;

using Xunit;

/// <summary>
/// Architecture guard for the service-args convention (#357 Wave A, row A.4):
/// any public method on a domain service interface that takes 3 or more parameters
/// (excluding <see cref="CancellationToken"/>) MUST collapse them into a single
/// <c>{Action}{Domain}Args</c> record. This keeps service signatures stable as they
/// grow and avoids long positional parameter lists. The guard discovers service
/// interfaces via <see cref="ArchitectureDiscoveryHelper"/> and reports the concrete
/// <c>IService.Method (N params)</c> offender, replacing the original issue-specific
/// hardcoded list. A small explicit allowlist baselines the legitimate pre-existing
/// exceptions (baseline-then-ratchet); new violations fail the build.
/// </summary>
public sealed class ServiceArgsRecordConventionSpec {
	static ServiceArgsRecordConventionSpec() {
		AppEnvironment.Initialize();
	}

	/// <summary>
	/// Methods (<c>InterfaceName.MethodName</c>) that currently take 3+ non-token
	/// parameters and are intentionally exempt from the args-record rule for now.
	/// This is a baseline, not a blessing: each entry is a pre-existing case to
	/// ratchet toward zero, never a way to weaken the rule for new code.
	/// </summary>
	private static readonly HashSet<string> AllowedMultiParamMethods = new(
		StringComparer.Ordinal
	) {
		// Optional permission-scope discriminators on a hot read path; folding three
		// IDs into an args record here buys little and would churn every caller of
		// the PermissionFilter. Ratchet target.
		"IPermissionService.GetEffectivePermissionsAsync",

		// Three required identifiers/level for account creation; an args record is
		// the eventual shape but this is a stable, internal seam. Ratchet target.
		"IAccountService.CreateTenantAccountAsync",

		// (tenantId, userId, document) tenant-user update; should adopt an
		// UpdateTenantUserArgs record like its siblings. Ratchet target.
		"IUserService.UpdateTenantUserAsync",
	};

	[Fact]
	public void ItShouldDiscoverServiceInterfacesToGuard() {
		// Vacuity check: an empty discovery would make the convention guard pass
		// for the wrong reason.
		_ = EnumerateServiceInterfaces()
			.Should()
			.NotBeEmpty(
				"service-interface discovery must find I*Service interfaces; an "
				+ "empty result would make the args-record convention vacuous."
			);
	}

	[Fact]
	public void ItShouldUseArgsRecordsForMethodsWithThreeOrMoreParameters() {
		List<string> offenders = EnumerateServiceInterfaces()
			.SelectMany(serviceInterface => serviceInterface
				.GetMethods()
				.Select(method => (
					Interface: serviceInterface,
					Method: method,
					NonTokenCount: CountNonTokenParameters(method)
				)))
			.Where(entry => entry.NonTokenCount >= 3)
			.Select(entry => (
				Key: $"{entry.Interface.Name}.{entry.Method.Name}",
				Count: entry.NonTokenCount
			))
			.Where(entry => !AllowedMultiParamMethods.Contains(entry.Key))
			.Select(entry => $"{entry.Key} ({entry.Count} params)")
			.OrderBy(name => name, StringComparer.Ordinal)
			.ToList();

		_ = offenders.Should().BeEmpty(
			"a domain service method with 3+ parameters (excluding "
			+ "CancellationToken) must take a single {Action}{Domain}Args record "
			+ "instead. Introduce the args record, or add the method to the "
			+ "explicit allowlist with justification if it is a tracked baseline."
		);
	}

	[Fact]
	public void ItShouldKeepAllowlistEntriesRelevant() {
		// Guards against stale allowlist drift: every allowlisted method must still
		// exist and still actually have 3+ non-token parameters. If a baseline case
		// is fixed (or removed), its allowlist entry must go too.
		var actualMultiParamKeys = EnumerateServiceInterfaces()
			.SelectMany(serviceInterface => serviceInterface
				.GetMethods()
				.Where(method => CountNonTokenParameters(method) >= 3)
				.Select(method => $"{serviceInterface.Name}.{method.Name}"))
			.ToHashSet(StringComparer.Ordinal);

		List<string> staleEntries = AllowedMultiParamMethods
			.Where(entry => !actualMultiParamKeys.Contains(entry))
			.OrderBy(name => name, StringComparer.Ordinal)
			.ToList();

		_ = staleEntries.Should().BeEmpty(
			"allowlisted methods must still exist and still take 3+ non-token "
			+ "parameters; remove stale entries so the baseline ratchets down."
		);
	}

	[Fact]
	public void ItShouldUseArgsRecordsForKnownArgsRecordServiceMethods() {
		// Positive coverage retained from the original issue-specific guard: these
		// methods already adopt args records, and we assert the exact parameter
		// shape so a regression away from the record form is caught explicitly.
		AssertMethodParameterTypeNames<IAuditLogService>(
			"LogAsync",
			"CreateAuditLogArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IImpersonationService>(
			"CreateImpersonationSessionAsync",
			"CreateImpersonationSessionArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"CreateStaffInvitationAsync",
			"CreateStaffInvitationArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"CreateTenantInvitationAsync",
			"CreateTenantInvitationArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"FindStaffInvitationsAsync",
			"FindStaffInvitationsArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"AcceptStaffInvitationAsync",
			"AcceptStaffInvitationArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"AcceptTenantInvitationAsync",
			"AcceptTenantInvitationArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"BulkCreateStaffInvitationsAsync",
			"BulkCreateStaffInvitationsArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IProfileAsStaffService>(
			"CreateStaffProfileAsync",
			"CreateStaffProfileArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<ISystemNoticeService>(
			"FindAsync",
			"FindSystemNoticesArgs",
			nameof(CancellationToken)
		);
	}

	private static IReadOnlyList<Type> EnumerateServiceInterfaces() {
		return ArchitectureDiscoveryHelper
			.EnumerateServiceTypes()
			.Where(type => type.IsInterface)
			.ToList();
	}

	private static int CountNonTokenParameters(MethodInfo method) {
		// Note: optional/defaulted parameters count toward the threshold.
		return method
			.GetParameters()
			.Count(parameter =>
				parameter.ParameterType != typeof(CancellationToken));
	}

	private static void AssertMethodParameterTypeNames<TService>(
		string methodName,
		params string[] expectedParameterTypeNames
	) {
		var method = typeof(TService)
			.GetMethods()
			.Single(methodInfo => methodInfo.Name == methodName);
		var actualParameterTypeNames = method
			.GetParameters()
			.Select(parameter => parameter.ParameterType.Name)
			.ToArray();

		Assert.Equal(expectedParameterTypeNames, actualParameterTypeNames);
	}
}
