
using System.Reflection;
using System.Runtime.CompilerServices;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;
/// <summary>
/// Architecture guards locking in the #431 handler file contract (#357 Wave B).
/// Each fact scans the compiled API assembly via reflection and fails with the
/// concrete offender when the contract regresses — cheaper and more reliable than
/// catching it in review. The contract: every handler is a non-abstract class whose
/// public Minimal-API entrypoint is named exactly <c>Handle</c>; handlers never take
/// or store any EF Core <see cref="DbContext"/> (including
/// <see cref="AppDbContext"/>), a factory/wrapper that hands one out, or an
/// <see cref="IServiceProvider"/> service-locator (DbContext access is via injected
/// services only); and HTTP wire/contract + validator types are top-level siblings,
/// never nested types (public or non-public) inside the handler class. See
/// docs/guides/test-conventions.md ("Architecture Tests") for the rationale and the
/// architecture-test vs Roslyn-analyzer split (#357 / #350).
///
/// Scope note (#357 Wave B):
/// - B.5 "namespace matches folder path" is already enforced at build by
///   <c>IDE0130</c> (treated as error), so it is intentionally NOT duplicated here.
/// - B.5 "file name matches the primary class" is deferred: several handler files
///   legitimately declare multiple top-level handler/contract classes (e.g.
///   <c>TenantUserCompanyActionsForStaff.cs</c> with four handlers plus supporting
///   contract/validator types,
///   <c>GetStaffUserProfiles.cs</c> with item/result/handler), and a few file names
///   match none of their declared classes by design (<c>PassWordLogin.cs</c> to
///   <c>PasswordLogin</c>, <c>FindStaffUser.cs</c> to <c>FindStaffUsers</c>). A robust
///   one-class-per-file rule would need a large, brittle allowlist; it belongs in
///   the #350 Roslyn track where the syntax tree can identify the primary
///   declaration directly. The repo-root locator was achievable, but the rule itself
///   is not clean against current code, so robustness wins over a flaky guard.
/// </summary>
public sealed class HandlerContractGuardSpec {
	static HandlerContractGuardSpec() {
		AppEnvironment.Initialize();
	}

	[Fact]
	public void ItShouldDiscoverHandlerEntrypointsToGuard() {
		// Vacuity check shared by every handler-class guard below: a silent
		// zero-count (e.g. a broken namespace filter) would make those guards
		// pass for the wrong reason.
		_ = ArchitectureDiscovery
			.EnumerateHandlerEntrypoints()
			.Should()
			.NotBeEmpty(
				"handler-entrypoint discovery must find classes exposing a "
				+ "public static Handle method; an empty result would make the "
				+ "handler-contract guards vacuous."
			);
	}

	// B.1 — the public Minimal-API entrypoint is named exactly "Handle".
	// A handler must have NO public method whose name starts with "Handle"
	// other than exactly "Handle" (catches a leftover HandleCreate/HandleUpdate
	// from before the #431 rename). Private helpers like HandleSuccessAsync are
	// non-public and so are not considered.
	//
	// Candidate set: handlers exposing ANY public static Handle* method (NOT only
	// those with an exact "Handle"). Using the strict entrypoint enumerator here
	// would be vacuous — a handler regressed to HandleCreate only (no exact
	// "Handle") would be filtered out before this guard could flag it.
	[Fact]
	public void ItShouldNameHandlerEntrypointsExactlyHandle() {
		IReadOnlyList<Type> candidates =
			ArchitectureDiscovery.EnumerateHandlerEntrypointCandidateTypes();

		// Vacuity check inside the guard: an empty candidate set (e.g. a broken
		// namespace filter) would make this guard pass for the wrong reason.
		_ = candidates.Should().NotBeEmpty(
			"handler entrypoint-candidate discovery must find classes exposing a "
			+ "public static Handle* method; an empty result would make the "
			+ "entrypoint-naming guard vacuous."
		);

		List<string> offenders = candidates
			.SelectMany(type => type
				.GetMethods(
					BindingFlags.Public
					| BindingFlags.Static
					// Instance is deliberate: all current Handle entrypoints are
					// static, but scanning instance methods too catches a
					// hypothetical instance-method entrypoint regression.
					| BindingFlags.Instance
					| BindingFlags.DeclaredOnly
				)
				.Where(method =>
					method.Name.StartsWith("Handle", StringComparison.Ordinal)
					&& !string.Equals(
						method.Name, "Handle", StringComparison.Ordinal))
				.Select(method => $"{type.FullName}.{method.Name}"))
			.OrderBy(name => name, StringComparer.Ordinal)
			.ToList();

		_ = offenders.Should().BeEmpty(
			"a handler's public Minimal-API entrypoint must be named exactly "
			+ "'Handle' (per the #431 contract); a leftover Handle{Operation} "
			+ "public method is a regression. Rename it to 'Handle' or make the "
			+ "helper non-public."
		);
	}

	// B.2 — handler classes do not depend on AppDbContext. Scan constructor
	// parameters, instance/static fields, properties, and the Handle method's
	// parameters. DbContext access belongs in services, never in handlers.
	[Fact]
	public void ItShouldKeepHandlersFreeOfDbContext() {
		IReadOnlyList<Type> entrypoints =
			ArchitectureDiscovery.EnumerateHandlerEntrypointTypes();

		// Vacuity check inside the guard: an empty entrypoint set would make this
		// guard pass for the wrong reason.
		_ = entrypoints.Should().NotBeEmpty(
			"handler-entrypoint discovery must find classes exposing a public "
			+ "static Handle method; an empty result would make the no-DbContext "
			+ "guard vacuous."
		);

		List<string> offenders = entrypoints
			.SelectMany(FindDbContextDependencies)
			.OrderBy(name => name, StringComparer.Ordinal)
			.ToList();

		_ = offenders.Should().BeEmpty(
			"handlers must not inject, store, or parameterize "
			+ "AppDbContext — DbContext access is via services only "
			+ "(handlers orchestrate, services implement)."
		);
	}

	// B.3 — handler classes expose no nested types. HTTP contract types
	// (Body/Query/Result/Response/Item) and *Validator types must be top-level
	// siblings in the handler file, never nested inside the class.
	// Both Public AND NonPublic nested types are scanned: an internal/protected
	// internal nested Body/Query/Validator still violates the top-level-sibling
	// convention and must not slip through a Public-only scan.
	[Fact]
	public void ItShouldKeepContractTypesOutOfHandlerClasses() {
		IReadOnlyList<Type> entrypoints =
			ArchitectureDiscovery.EnumerateHandlerEntrypointTypes();

		// Vacuity check inside the guard: an empty entrypoint set would make this
		// guard pass for the wrong reason.
		_ = entrypoints.Should().NotBeEmpty(
			"handler-entrypoint discovery must find classes exposing a public "
			+ "static Handle method; an empty result would make the "
			+ "nested-contract-type guard vacuous."
		);

		List<string> offenders = entrypoints
			.SelectMany(type => type
				.GetNestedTypes(BindingFlags.Public | BindingFlags.NonPublic)
				// Exclude compiler-generated nested types — an async Handle method
				// emits a state machine (<Handle>d__N) and lambdas emit display
				// classes (<>c) as NonPublic nested types. They are not authored
				// contract/validator types and must not be flagged.
				.Where(nested => !IsCompilerGenerated(nested))
				.Select(nested => $"{type.FullName}+{nested.Name}"))
			.OrderBy(name => name, StringComparer.Ordinal)
			.ToList();

		_ = offenders.Should().BeEmpty(
			"handler classes must expose no authored nested types — HTTP "
			+ "contract types (Body/Query/Result/Response/Item) and *Validator "
			+ "types must be declared as top-level siblings in the handler file, "
			+ "not nested inside the handler class (public or non-public)."
		);
	}

	// B.4 — every FluentValidation AbstractValidator<T> declared in a .Handlers.
	// namespace targets a T that is a top-level (non-nested) type whose name ends
	// in "Body" or "Query" AND lives in the SAME namespace as the validator. This
	// keeps validators bound to the public request contract types (the body/query
	// DTOs) of their OWN handler file, never to nested, arbitrary, or unrelated
	// same-suffix types declared in another namespace.
	[Fact]
	public void ItShouldTargetTopLevelBodyOrQueryTypesFromHandlerValidators() {
		IReadOnlyList<Type> validators =
			ArchitectureDiscovery.EnumerateValidatorTypes();

		// Vacuity check: an empty discovery would make the target check pass
		// for the wrong reason.
		_ = validators.Should().NotBeEmpty(
			"validator discovery must find AbstractValidator<T> subclasses in "
			+ "handler namespaces to scan."
		);

		List<string> offenders = validators
			.Select(validator => (
				Validator: validator,
				Target: ArchitectureDiscovery.GetValidatorTarget(validator)
			))
			.Where(pair => !IsValidValidatorTarget(pair.Validator, pair.Target))
			.Select(pair =>
				$"{pair.Validator.Name} -> {DescribeTarget(pair.Target)}")
			.OrderBy(name => name, StringComparer.Ordinal)
			.ToList();

		_ = offenders.Should().BeEmpty(
			"an AbstractValidator<T> in a handler namespace must target a "
			+ "top-level (non-nested) request contract type whose name ends in "
			+ "'Body' or 'Query' and that lives in the SAME namespace as the "
			+ "validator (its own handler file)."
		);
	}

	// Yields "TypeName.member (kind)" strings for every DbContext-family dependency
	// found on the given handler type. Covers all four injection surfaces a handler
	// could use to sneak in a DbContext: constructor parameters (DI injection),
	// stored fields/properties (assigned from ctor or static init), and the Handle
	// method's own parameters (sometimes used for Minimal-API parameter binding).
	// Other public methods are intentionally not scanned — they are not part of the
	// Minimal-API contract and a non-Handle method that happens to accept a DbContext
	// parameter would be a separate, unrelated design smell.
	private static IEnumerable<string> FindDbContextDependencies(Type type) {
		foreach (var constructor in type.GetConstructors()) {
			foreach (var parameter in constructor.GetParameters()) {
				if (IsDbContext(parameter.ParameterType)) {
					yield return $"{type.FullName}.ctor({parameter.Name})";
				}
			}
		}

		// No DeclaredOnly: include inherited members so a AppDbContext stashed
		// in a base class (not the handler's own declaration) is still caught.
		var fieldFlags = BindingFlags.Public
			| BindingFlags.NonPublic
			| BindingFlags.Instance
			| BindingFlags.Static;
		foreach (var field in type.GetFields(fieldFlags)) {
			if (IsDbContext(field.FieldType)) {
				yield return $"{type.FullName}.{field.Name} (field)";
			}
		}

		// No DeclaredOnly: include inherited properties for the same reason.
		var propertyFlags = BindingFlags.Public
			| BindingFlags.NonPublic
			| BindingFlags.Instance
			| BindingFlags.Static;
		foreach (var property in type.GetProperties(propertyFlags)) {
			if (IsDbContext(property.PropertyType)) {
				yield return $"{type.FullName}.{property.Name} (property)";
			}
		}

		// DeclaredOnly here on purpose: we want the handler's OWN Handle
		// entrypoint, not an inherited one from a base type.
		var handle = type.GetMethod(
			"Handle",
			BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly
		);
		if (handle is not null) {
			foreach (var parameter in handle.GetParameters()) {
				if (IsDbContext(parameter.ParameterType)) {
					yield return $"{type.FullName}.Handle({parameter.Name})";
				}
			}
		}
	}

	private static bool IsCompilerGenerated(Type type) {
		// Belt-and-suspenders: the attribute is the contract, the angle-bracket name
		// is the observable convention for state machines/display classes.
		return type.IsDefined(typeof(CompilerGeneratedAttribute), inherit: false)
			|| type.Name.Contains('<', StringComparison.Ordinal);
	}

	private static bool IsDbContext(Type type) {
		return IsDbContext(type, new HashSet<Type>());
	}

	// Recursive DbContext-access detector. Catches a direct DbContext, any wrapper
	// that hands one out (IDbContextFactory<...>, Func<...>, Lazy<...>, arrays,
	// by-ref/out params, …), and the IServiceProvider service-locator escape hatch.
	private static bool IsDbContext(Type type, HashSet<Type> visited) {
		// ANY EF Core DbContext, not just AppDbContext — a handler reaching for
		// a base/other DbContext is just as much of a violation.
		if (typeof(DbContext).IsAssignableFrom(type)) {
			return true;
		}

		// IServiceProvider is a service-locator escape hatch a handler could use to
		// resolve a DbContext (or a service) out of band, bypassing the
		// orchestrate-via-injected-services contract. The stricter review wants it
		// flagged (reversing the earlier "intentionally not flagged" note).
		if (type == typeof(IServiceProvider)) {
			return true;
		}

		// Unwrap by-ref/out (ref/out params), pointers, and arrays.
		if (type.IsByRef || type.IsPointer || type.IsArray) {
			Type? elementType = type.GetElementType();
			return elementType is not null && IsDbContext(elementType, visited);
		}

		// Recurse through generic arguments so wrappers like
		// IDbContextFactory<AppDbContext>, Func<AppDbContext>, and
		// Lazy<AppDbContext> are all caught.
		if (type.IsGenericType) {
			foreach (var argument in type.GetGenericArguments()) {
				if (visited.Add(argument) && IsDbContext(argument, visited)) {
					return true;
				}
			}
		}

		return false;
	}

	private static bool IsValidValidatorTarget(Type validator, Type? target) {
		if (target is null || target.IsNested) {
			return false;
		}

		// Must live in the validator's own namespace (its handler file), so a
		// validator cannot bind to an unrelated top-level FooBody/FooQuery declared
		// in some other namespace.
		if (!string.Equals(
			target.Namespace, validator.Namespace, StringComparison.Ordinal)) {
			return false;
		}

		return target.Name.EndsWith("Body", StringComparison.Ordinal)
			|| target.Name.EndsWith("Query", StringComparison.Ordinal);
	}

	private static string DescribeTarget(Type? target) {
		if (target is null) {
			return "<no AbstractValidator<T> base>";
		}

		if (target.IsNested) {
			return $"{target.Name} (nested)";
		}

		// Include the namespace so a cross-namespace mismatch is legible in the
		// offender message.
		return $"{target.Namespace}.{target.Name}";
	}
}
