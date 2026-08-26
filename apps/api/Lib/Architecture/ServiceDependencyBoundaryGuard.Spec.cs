
using System.Reflection;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Architecture guard for the service dependency boundary rule (#357 / #533):
/// domain service implementations MUST NOT depend on other domain services —
/// they may only depend on <see cref="PublyApp.Api.Data.DbContext.AppDbContext"/>,
/// infrastructure abstractions (interfaces from the Infrastructure namespace),
/// and framework primitives (<c>ILogger&lt;T&gt;</c>, <c>IOptions&lt;T&gt;</c>,
/// <c>IConfiguration</c>, <c>IHttpContextAccessor</c>, etc.).
/// Handlers orchestrate; services implement. A service calling another service
/// couples two independently-owned slices and makes transactional reasoning harder.
/// The guard reflects constructors of every concrete service class discovered via
/// <see cref="ArchitectureDiscovery"/> and fails the build with the concrete
/// <c>Service → InjectedService</c> pair when a violation is introduced.
/// A small explicit allowlist baselines the pre-existing violations so the spec
/// passes today; each entry is a ratchet target, not a permanent exception.
/// </summary>
public sealed class ServiceDependencyBoundaryGuardSpec {
	static ServiceDependencyBoundaryGuardSpec() {
		AppEnvironment.Initialize();
	}

	/// <summary>
	/// Pre-existing service-to-service constructor dependencies that violate the
	/// boundary rule but existed before this guard was introduced. Each entry is
	/// keyed as <c>ConcreteServiceClass → InjectedServiceInterface</c>. Entries
	/// must carry a justification comment and a ratchet-target note so they are
	/// never treated as a permanent blessing.
	/// </summary>
	private static readonly HashSet<string> AllowedServiceDependencies = new(
		StringComparer.Ordinal
	) {
		// #807 F5 baseline violation (ratchet target): AccountProfileService
		// releases an avatar's asset reference best-effort inside the caller's
		// transaction when a served avatar URL is replaced or cleared. The
		// dependency is one conditional UPDATE with no business branching; if a
		// future change grows it, move the coordination to the calling handler
		// and remove this entry.
		"AccountProfileService → IUploadAssetReferenceService",
		// Same #807 F5 shape as above (ratchet target): these services release
		// an avatar/logo's asset reference best-effort inside the caller's
		// transaction when a served URL is replaced or cleared. One conditional
		// UPDATE each, no business branching; if any of them grows business
		// logic, move the coordination to the calling handler and remove its
		// entry.
		"StaffUserCoreService → IUploadAssetReferenceService",
		"TenantAsStaffService → IUploadAssetReferenceService",
		"TenantUserIdentityService → IUploadAssetReferenceService",
		"TenantUserMembershipService → IUploadAssetReferenceService",
		// Same #807 F5 shape as above (ratchet target): PostMediaAssetService
		// (B3 post images, #1444) acquires the incoming blob's reference BEFORE
		// the asset write and releases the replaced/purged image's reference
		// AFTER its own commit or the calling handler's commit — one conditional
		// UPDATE each, no business branching; if it grows business logic, move
		// the coordination to the calling handlers and remove this entry.
		"PostMediaAssetService → IUploadAssetReferenceService",
	};

	[Fact]
	public void ItShouldDiscoverConcreteServiceClassesToGuard() {
		// Vacuity check: an empty discovery would make the dependency boundary
		// guard pass for the wrong reason.
		_ = EnumerateConcreteServiceClasses()
			.Should()
			.NotBeEmpty(
				"concrete service class discovery must find [Service]-registered "
				+ "implementations; an empty result would make the boundary guard vacuous."
			);
	}

	[Fact]
	public void ItShouldNotInjectDomainServicesIntoDomainServices() {
		// Collect all domain service interface types (the I*Service contracts that
		// live in Modules/**/Services namespaces) so we can recognise them when
		// they appear as constructor parameters of a peer service.
		var domainServiceInterfaces = EnumerateDomainServiceInterfaces()
			.ToHashSet();

		// Vacuity guard: if the interface set is empty the check below trivially
		// passes — wrong for the wrong reason.
		_ = domainServiceInterfaces.Should().NotBeEmpty(
			"domain service interface discovery must find I*Service interfaces; "
			+ "an empty result would make the dependency boundary guard vacuous."
		);

		var concreteServiceClasses = EnumerateConcreteServiceClasses();

		_ = concreteServiceClasses.Should().NotBeEmpty(
			"concrete service class discovery must find [Service]-registered "
			+ "implementations; an empty result would make the boundary guard vacuous."
		);

		List<string> offenders = concreteServiceClasses
			.SelectMany(serviceClass =>
				GetConstructorParameterTypes(serviceClass)
					.Where(paramType => domainServiceInterfaces.Contains(paramType))
					.Select(paramType => BuildDependencyKey(serviceClass, paramType)))
			.Where(key => !AllowedServiceDependencies.Contains(key))
			.OrderBy(key => key, StringComparer.Ordinal)
			.ToList();

		_ = offenders.Should().BeEmpty(
			"domain service implementations must not inject other domain services "
			+ "as constructor dependencies — handlers orchestrate, services implement. "
			+ "Move cross-service coordination to the calling handler, introduce a "
			+ "shared domain event / outbox, or add the case to the explicit allowlist "
			+ "with justification if it is a tracked baseline violation. "
			+ "Failure format: 'Service <X> depends on service <Y>; "
			+ "handlers should orchestrate instead'."
		);
	}

	[Fact]
	public void ItShouldKeepAllowlistEntriesRelevant() {
		// Guards against stale allowlist entries: if a baseline violation is
		// resolved (the dependency is removed or the code is restructured) the
		// entry must be removed from the allowlist so the ratchet moves down.
		var domainServiceInterfaces = EnumerateDomainServiceInterfaces()
			.ToHashSet();

		var actualDependencyKeys = EnumerateConcreteServiceClasses()
			.SelectMany(serviceClass =>
				GetConstructorParameterTypes(serviceClass)
					.Where(paramType => domainServiceInterfaces.Contains(paramType))
					.Select(paramType => BuildDependencyKey(serviceClass, paramType)))
			.ToHashSet(StringComparer.Ordinal);

		List<string> staleEntries = AllowedServiceDependencies
			.Where(entry => !actualDependencyKeys.Contains(entry))
			.OrderBy(entry => entry, StringComparer.Ordinal)
			.ToList();

		_ = staleEntries.Should().BeEmpty(
			"allowlisted service dependencies must still exist; remove stale entries "
			+ "so the baseline ratchets down and the allowlist stays honest."
		);
	}

	// ── discovery helpers ─────────────────────────────────────────────────────

	/// <summary>
	/// Returns concrete (non-abstract, non-interface) service classes whose
	/// namespace ends in <c>.Services</c> under <c>PublyApp.Api.Modules</c>.
	/// </summary>
	private static IReadOnlyList<Type> EnumerateConcreteServiceClasses() {
		return ArchitectureDiscovery
			.EnumerateDomainServices()
			.Where(type =>
				type is { IsClass: true, IsAbstract: false, IsInterface: false })
			.ToList();
	}

	/// <summary>
	/// Returns domain service interface types (types matching <c>I*Service</c>)
	/// whose namespace ends in <c>.Services</c> under <c>PublyApp.Api.Modules</c>.
	/// </summary>
	private static IReadOnlyList<Type> EnumerateDomainServiceInterfaces() {
		return ArchitectureDiscovery
			.EnumerateDomainServices()
			.Where(type =>
				type.IsInterface
				&& type.Name.StartsWith("I", StringComparison.Ordinal)
				&& type.Name.EndsWith("Service", StringComparison.Ordinal))
			.ToList();
	}

	/// <summary>
	/// Returns the distinct set of types used as constructor parameters for the
	/// given concrete class, across all public constructors.
	/// </summary>
	private static IEnumerable<Type> GetConstructorParameterTypes(Type type) {
		return type
			.GetConstructors(BindingFlags.Public | BindingFlags.Instance)
			.SelectMany(ctor => ctor.GetParameters())
			.Select(param => param.ParameterType)
			.Distinct();
	}

	/// <summary>
	/// Builds the allowlist/offender key:
	/// <c>ConcreteServiceClass → InjectedServiceInterface</c>.
	/// </summary>
	private static string BuildDependencyKey(Type serviceClass, Type injectedInterface) {
		return $"{serviceClass.Name} → {injectedInterface.Name}";
	}
}
