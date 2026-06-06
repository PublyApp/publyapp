
using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;
/// <summary>
/// Architecture guard: asserts that every public sealed handler class under
/// <c>Modules/**/Handlers/&lt;Scope&gt;/</c> carries a name that clearly signals
/// its auth scope, so that a misplaced handler (e.g. a Tenant handler dropped
/// into <c>Handlers/Staff/</c>) is caught immediately by CI rather than in code
/// review (#357, sub-issue #535).
///
/// Scope rules (derived from <c>docs/guides/api-route-design.md</c> and AGENTS.md):
/// <list type="bullet">
///   <item>
///     <c>Handlers/Staff/</c> (namespace ends with <c>.Handlers.Staff</c>):
///     class name must contain <c>Staff</c> OR <c>Tenant</c>. Both fragments cover
///     the two resource families a Staff handler may target — staff-only resources
///     (e.g. <c>CreateStaffUser</c>, <c>FindStaffProfiles</c>) and tenant resources
///     operated by staff (e.g. <c>FindTenantsAsStaff</c>, <c>FindTenantPermissions</c>,
///     <c>AssignTenantProfilePermissionAsStaff</c>). The accepted naming styles are
///     the canonical <c>*ForStaff</c> / <c>*ForTenantAsStaff</c> (target for new code)
///     as well as the established <c>*AsStaff</c> / <c>*Staff&lt;Domain&gt;</c> forms
///     that pre-date this guard.
///   </item>
///   <item>
///     <c>Handlers/Tenant/</c> (namespace ends with <c>.Handlers.Tenant</c>):
///     class name must contain <c>ForTenant</c> or <c>Tenant</c>. No Tenant-scoped
///     handlers exist yet; this rule acts as a forward-looking guardrail.
///   </item>
///   <item>
///     <c>Handlers/Anonymous/</c> (namespace ends with <c>.Handlers.Anonymous</c>):
///     no name suffix is enforced — the handler lives in the Anonymous subfolder,
///     which is already a sufficient structural scope marker. Enforcing <c>*Anonymous</c>
///     suffixes on the existing well-named handlers (e.g. <c>AcceptInvitation</c>,
///     <c>GetInvitationDetails</c>) would require a large allowlist with no benefit.
///   </item>
/// </list>
///
/// Handlers in <c>Handlers/</c> (no scope subfolder, e.g. Auth) are excluded from
/// this check — they are session-adjacent utilities, not scoped API handlers.
///
/// Allowlist strategy (baseline-then-ratchet):
/// The allowlist seeds ONLY genuine current drift: handlers correctly placed in
/// their scope folder but whose name lacks the expected Staff / Tenant fragment.
/// These are admin-only operations on domain-level resources (AuditLogs,
/// SystemNotices) whose names pre-date the scope-fragment convention. Each entry
/// is a ratchet target — rename toward the canonical form and remove the entry;
/// never add new entries for new code.
///
/// The original issue-#535 allowlist (PassWordLogin, FindStaffUser,
/// TenantUserCompanyActionsForStaff) was cleared by PR #538 before this guard
/// shipped. No scope misplacements were found on develop at the time of
/// authoring; the remaining allowlist entries are naming-style baselines, not
/// placement errors.
/// </summary>
public sealed class HandlerScopeNamingGuardSpec {
	static HandlerScopeNamingGuardSpec() {
		AppEnvironment.Initialize();
	}

	// Namespace-segment suffixes: a scoped handler namespace ends with
	// ".Handlers.<Scope>" (no trailing dot — C# namespaces have no trailing dot).
	// Using EndsWith ensures we match the scope segment exactly rather than a
	// coincidental substring of a longer namespace like ".Handlers.StaffFoo".
	private const string StaffNamespaceSuffix = ".Handlers.Staff";
	private const string TenantNamespaceSuffix = ".Handlers.Tenant";
	private const string AnonymousNamespaceSuffix = ".Handlers.Anonymous";

	// ---------------------------------------------------------------------------
	// Allowlist — baseline-then-ratchet
	// Each entry: full type name (FullName), so a new handler with the same
	// short class name does not accidentally suppress a new violation.
	//
	// Ratchet plan: rename these handlers toward the canonical *ForStaff form
	// (e.g. CreateSystemNotice → CreateSystemNoticeForStaff), remove the entry
	// here, and update the corresponding endpoint file and route constant.
	// ---------------------------------------------------------------------------
	private static readonly HashSet<string> StaffScopeAllowlist = new(
		StringComparer.Ordinal
	) {
		// AuditLogs — admin-only audit log handlers that predate the scope-fragment
		// convention; all correctly placed in Staff/. Ratchet: rename *ForStaff.
		"PublyApp.Api.Modules.AuditLogs.Handlers.Staff.ExportAuditLogs",
		"PublyApp.Api.Modules.AuditLogs.Handlers.Staff.FindAuditLogs",
		"PublyApp.Api.Modules.AuditLogs.Handlers.Staff.GetAuditLogActions",
		"PublyApp.Api.Modules.AuditLogs.Handlers.Staff.GetAuditLogById",

		// SystemNotices — staff-only CRUD handlers that predate the scope-fragment
		// convention; all correctly placed in Staff/. Ratchet: rename *ForStaff.
		"PublyApp.Api.Modules.SystemNotices.Handlers.Staff.CreateSystemNotice",
		"PublyApp.Api.Modules.SystemNotices.Handlers.Staff.DeleteSystemNotice",
		"PublyApp.Api.Modules.SystemNotices.Handlers.Staff.FindSystemNotices",
		"PublyApp.Api.Modules.SystemNotices.Handlers.Staff.GetSystemNoticeById",
		"PublyApp.Api.Modules.SystemNotices.Handlers.Staff.UpdateSystemNotice",
	};

	// ---------------------------------------------------------------------------
	// Tests
	// ---------------------------------------------------------------------------

	[Fact]
	public void ItShouldDiscoverScopedHandlerEntrypointsToGuard() {
		// Vacuity check: a silent zero-count (e.g. from a broken namespace filter)
		// would make the scope-naming guards pass for the wrong reason.
		var scopedHandlers = DiscoverScopedHandlerEntrypointTypes();

		_ = scopedHandlers.Should().NotBeEmpty(
			"scoped handler-entrypoint discovery (Staff/Tenant/Anonymous) must "
			+ "find handler classes with a public static Handle method; an empty "
			+ "result would make the scope-naming guards vacuous."
		);
	}

	// Handlers in Handlers/Staff/ must contain "Staff" OR "Tenant" in their class
	// name to confirm they are explicitly staff-scoped operations.
	//
	// Accepted naming styles:
	//   Canonical (new code):    *ForStaff, *ForTenantAsStaff
	//   Established (pre-guard): *AsStaff, *StaffUser, *StaffProfile,
	//                            *TenantsAsStaff, *TenantPermissions, ...
	//
	// An allowlist covers the small set of correctly placed handlers whose domain
	// names (AuditLogs, SystemNotices) happen to contain neither "Staff" nor
	// "Tenant". See the class-level doc comment for the ratchet plan.
	[Fact]
	public void ItShouldNameStaffHandlersWithStaffOrTenantScopeMarker() {
		var staffHandlers = DiscoverScopedHandlerEntrypointTypes()
			.Where(type =>
				type.Namespace?.EndsWith(
					StaffNamespaceSuffix,
					StringComparison.Ordinal
				) is true)
			.ToList();

		_ = staffHandlers.Should().NotBeEmpty(
			"Staff-scope handler discovery must find handler classes in namespaces "
			+ "ending with .Handlers.Staff; an empty result would make this "
			+ "guard vacuous."
		);

		List<string> offenders = staffHandlers
			.Where(type => !IsAllowlisted(type, StaffScopeAllowlist))
			.Where(type => !HasStaffScopeMarker(type.Name))
			.Select(type =>
				$"{type.FullName} (expected name to contain 'Staff' or 'Tenant')")
			.OrderBy(name => name, StringComparer.Ordinal)
			.ToList();

		_ = offenders.Should().BeEmpty(
			"a handler class in Handlers/Staff/ must contain 'Staff' or 'Tenant' "
			+ "in its name to signal its auth scope unambiguously. Rename toward "
			+ "the canonical *ForStaff or *ForTenantAsStaff form for new handlers, "
			+ "or add a justified entry to StaffScopeAllowlist for pre-existing "
			+ "domain-named handlers."
		);
	}

	// Handlers in Handlers/Tenant/ must contain "ForTenant" or "Tenant" in their
	// class name. No Tenant-scoped handlers exist at time of writing; this guard
	// fires as a forward-looking ratchet the moment one is introduced without the
	// correct scope marker.
	[Fact]
	public void ItShouldNameTenantHandlersWithTenantScopeMarker() {
		var tenantHandlers = DiscoverScopedHandlerEntrypointTypes()
			.Where(type =>
				type.Namespace?.EndsWith(
					TenantNamespaceSuffix,
					StringComparison.Ordinal
				) is true)
			.ToList();

		List<string> offenders = tenantHandlers
			.Where(type => !HasTenantScopeMarker(type.Name))
			.Select(type =>
				$"{type.FullName} (expected name to contain 'Tenant' or 'ForTenant')")
			.OrderBy(name => name, StringComparer.Ordinal)
			.ToList();

		_ = offenders.Should().BeEmpty(
			"a handler class in Handlers/Tenant/ must contain 'Tenant' or "
			+ "'ForTenant' in its name to signal its auth scope unambiguously. "
			+ "Use the canonical *ForTenant suffix for new handlers."
		);
	}

	// No suffix is enforced for Anonymous/ handlers: the subfolder itself is the
	// scope marker, and the existing handlers (AcceptInvitation, GetInvitationDetails,
	// etc.) are clearly named without a redundant *Anonymous suffix. This test
	// acts as a discovery vacuity guard only — ensuring the folder is not empty
	// when handlers are expected.
	[Fact]
	public void ItShouldDiscoverAnonymousHandlers() {
		var anonymousHandlers = DiscoverScopedHandlerEntrypointTypes()
			.Where(type =>
				type.Namespace?.EndsWith(
					AnonymousNamespaceSuffix,
					StringComparison.Ordinal
				) is true)
			.ToList();

		_ = anonymousHandlers.Should().NotBeEmpty(
			"Anonymous-scope handler discovery must find handler classes in "
			+ "namespaces ending with .Handlers.Anonymous; an empty result would "
			+ "make this guard vacuous (currently expects invitation and "
			+ "system-notice anonymous handlers)."
		);
	}

	// Guards the allowlist itself: every entry must still exist as a real handler
	// type AND still lack the Staff/Tenant scope marker. If a handler is renamed
	// or removed, its allowlist entry must be removed too so the baseline ratchets
	// downward over time.
	[Fact]
	public void ItShouldKeepStaffAllowlistEntriesRelevant() {
		var allHandlerFullNames = DiscoverScopedHandlerEntrypointTypes()
			.Select(type => type.FullName!)
			.ToHashSet(StringComparer.Ordinal);

		var staffHandlersByFullName = DiscoverScopedHandlerEntrypointTypes()
			.Where(type =>
				type.Namespace?.EndsWith(
					StaffNamespaceSuffix,
					StringComparison.Ordinal
				) is true)
			.ToDictionary(type => type.FullName!, StringComparer.Ordinal);

		List<string> staleEntries = StaffScopeAllowlist
			.Where(entry => {
				// Stale if the type no longer exists at all.
				if (!allHandlerFullNames.Contains(entry)) {
					return true;
				}

				// Stale if the type now HAS a scope marker — the ratchet succeeded.
				if (staffHandlersByFullName.TryGetValue(entry, out var type)
					&& HasStaffScopeMarker(type.Name)) {
					return true;
				}

				return false;
			})
			.OrderBy(name => name, StringComparer.Ordinal)
			.ToList();

		_ = staleEntries.Should().BeEmpty(
			"allowlisted handler types must still exist and still lack the "
			+ "Staff/Tenant scope marker; remove stale entries so the baseline "
			+ "ratchets toward zero."
		);
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	/// <summary>
	/// Returns handler entrypoint types from scoped subfolders only
	/// (<c>Handlers/Staff/</c>, <c>Handlers/Tenant/</c>, <c>Handlers/Anonymous/</c>).
	/// Flat <c>Handlers/</c> classes (Auth module utilities) are excluded — their
	/// namespace ends with <c>.Handlers</c> without a scope segment, so the
	/// <c>EndsWith</c> checks below do not match them.
	/// </summary>
	private static IReadOnlyList<Type> DiscoverScopedHandlerEntrypointTypes() {
		return ArchitectureDiscovery
			.EnumerateHandlerEntrypointTypes()
			.Where(type =>
				type.Namespace?.EndsWith(
					StaffNamespaceSuffix,
					StringComparison.Ordinal
				) is true
				|| type.Namespace?.EndsWith(
					TenantNamespaceSuffix,
					StringComparison.Ordinal
				) is true
				|| type.Namespace?.EndsWith(
					AnonymousNamespaceSuffix,
					StringComparison.Ordinal
				) is true)
			.ToList();
	}

	private static bool HasStaffScopeMarker(string className) {
		// Accepts both the canonical new-code forms (*ForStaff, *ForTenantAsStaff)
		// and the established alternate forms (*AsStaff, *StaffUser, *StaffProfile,
		// *TenantsAsStaff, *TenantPermissions, …).
		return className.Contains("Staff", StringComparison.Ordinal)
			|| className.Contains("Tenant", StringComparison.Ordinal);
	}

	private static bool HasTenantScopeMarker(string className) {
		return className.Contains("Tenant", StringComparison.Ordinal)
			|| className.Contains("ForTenant", StringComparison.Ordinal);
	}

	private static bool IsAllowlisted(
		Type type,
		HashSet<string> allowlist
	) {
		return type.FullName is not null
			&& allowlist.Contains(type.FullName);
	}
}
