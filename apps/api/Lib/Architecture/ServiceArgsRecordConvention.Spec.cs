
using System.Reflection;

using FluentAssertions;

using PublyApp.Api.Modules.Account.Services;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Impersonations.Services;
using PublyApp.Api.Modules.Invitations.Services;
using PublyApp.Api.Modules.Profiles.Services;
using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.SystemNotices.Services;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;
/// <summary>
/// Architecture guard for the service-args convention (#357 Wave A, row A.4):
/// any public method on a domain service interface that takes 3 or more parameters
/// (excluding <see cref="CancellationToken"/>) MUST collapse them into a single
/// <c>{Action}{Domain}Args</c> record. This keeps service signatures stable as they
/// grow and avoids long positional parameter lists. The guard discovers service
/// interfaces via <see cref="ArchitectureDiscovery"/> and reports the concrete
/// <c>IService.Method (N params)</c> offender, replacing the original issue-specific
/// hardcoded list. A small explicit allowlist baselines the legitimate pre-existing
/// exceptions (baseline-then-ratchet); new violations fail the build.
/// </summary>
public sealed class ServiceArgsRecordConventionSpec {
	static ServiceArgsRecordConventionSpec() {
		AppEnvironment.Initialize();
	}

	/// <summary>
	/// Methods that currently take 3+ non-token parameters and are intentionally
	/// exempt from the args-record rule for now. The key is the FULL non-token
	/// parameter-type signature (<c>InterfaceName.MethodName(Type1, Type2, …)</c>),
	/// NOT just <c>Interface.Method</c>: keying by name alone would also suppress a
	/// NEW 3+-param overload of an allowlisted method, silently widening the
	/// baseline. This is a baseline, not a blessing: each entry is a pre-existing
	/// case to ratchet toward zero, never a way to weaken the rule for new code.
	/// </summary>
	private static readonly HashSet<string> AllowedMultiParamMethods = new(
		StringComparer.Ordinal
	) {
		// Optional permission-scope discriminators on a hot read path; folding three
		// IDs into an args record here buys little and would churn every caller of
		// the PermissionFilter. Ratchet target.
		"IPermissionService.GetEffectivePermissionsAsync(Guid, Guid?, Guid?)",

		// Three required identifiers/level for account creation; an args record is
		// the eventual shape but this is a stable, internal seam. Ratchet target.
		"IAccountService.CreateTenantAccountAsync(Guid, Guid, AccountLevel)",

		// (tenantId, userId, document) tenant-user update; should adopt an
		// UpdateTenantUserArgs record like its siblings. Ratchet target.
		"ITenantUserMembershipService.UpdateTenantUserAsync"
			+ "(Guid, Guid, UpdateTenantUserDocument)",
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
		var serviceInterfaces = EnumerateServiceInterfaces();

		// Vacuity check inside the guard: an empty scan (e.g. a broken namespace
		// filter) would make this guard pass for the wrong reason.
		_ = serviceInterfaces.Should().NotBeEmpty(
			"service-interface discovery must find I*Service interfaces; an "
			+ "empty result would make the args-record convention vacuous."
		);

		List<string> offenders = serviceInterfaces
			.SelectMany(serviceInterface => serviceInterface
				.GetMethods()
				.Select(method => (
					Interface: serviceInterface,
					Method: method,
					NonTokenCount: CountNonTokenParameters(method)
				)))
			.Where(entry => entry.NonTokenCount >= 3)
			.Select(entry => (
				Key: BuildSignatureKey(entry.Interface, entry.Method),
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
				.Select(method => BuildSignatureKey(serviceInterface, method)))
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
		AssertMethodParameterTypeNames<IAccountProfileService>(
			"UpdateAccountProfileAsync",
			"UpdateAccountProfileArgs",
			nameof(CancellationToken)
		);
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
		AssertMethodParameterTypeNames<IInvitationQueryService>(
			"FindStaffInvitationsAsync",
			"FindStaffInvitationsArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationAcceptanceService>(
			"AcceptStaffInvitationAsync",
			"AcceptStaffInvitationArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationAcceptanceService>(
			"AcceptTenantInvitationAsync",
			"AcceptTenantInvitationArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"BulkCreateStaffInvitationsAsync",
			"BulkCreateStaffInvitationsArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IStaffProfileAsStaffService>(
			"CreateStaffProfileAsync",
			"CreateStaffProfileArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<ISystemNoticeService>(
			"FindAsync",
			"FindSystemNoticesArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IPublicationStatusTransitionService>(
			"MarkInProgressAsync",
			"MarkPublicationInProgressArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IPublicationStatusTransitionService>(
			"MarkPublishedAsync",
			"MarkPublicationPublishedArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IPublicationStatusTransitionService>(
			"MarkFailedAsync",
			"MarkPublicationFailedArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IPublicationStatusTransitionService>(
			"MarkPausedAsync",
			"MarkPublicationPausedArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IPublicationStatusTransitionService>(
			"RescheduleToNowAsync",
			"ReschedulePublicationToNowArgs",
			nameof(CancellationToken)
		);
	}

	// Filters to interfaces only. The args-record convention is defined at the
	// contract boundary (the I*Service interface), not the implementation class.
	// Scanning concrete implementations would double-count every method and would
	// also pick up private/explicit-interface members that are not part of the
	// public contract callers depend on.
	private static IReadOnlyList<Type> EnumerateServiceInterfaces() {
		return ArchitectureDiscovery
			.EnumerateDomainServices()
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

	/// <summary>
	/// Builds the allowlist/offender key for a method:
	/// <c>InterfaceName.MethodName(Type1, Type2, …)</c> using the non-token
	/// parameter TYPES (CancellationToken excluded). Keying by type signature — not
	/// just <c>Interface.Method</c> — means a NEW 3+-param overload of an
	/// allowlisted method is NOT suppressed by the existing entry.
	/// </summary>
	private static string BuildSignatureKey(
		Type serviceInterface,
		MethodInfo method
	) {
		var parameterTypes = method
			.GetParameters()
			.Where(parameter =>
				parameter.ParameterType != typeof(CancellationToken))
			.Select(parameter => RenderTypeName(parameter.ParameterType));

		return $"{serviceInterface.Name}.{method.Name}"
			+ $"({string.Join(", ", parameterTypes)})";
	}

	/// <summary>
	/// Renders a readable, stable parameter type name for signature keys:
	/// <c>Nullable&lt;Guid&gt;</c> becomes <c>Guid?</c>; everything else uses
	/// <see cref="MemberInfo.Name"/> (so <c>Guid</c>, <c>AccountLevel</c>,
	/// <c>UpdateTenantUserDocument</c>, …).
	/// </summary>
	private static string RenderTypeName(Type type) {
		var underlying = Nullable.GetUnderlyingType(type);
		if (underlying is not null) {
			return $"{underlying.Name}?";
		}

		return type.Name;
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
