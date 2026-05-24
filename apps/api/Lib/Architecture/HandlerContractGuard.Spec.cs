namespace MainApi.Lib.Architecture;

using System.Reflection;

using FluentAssertions;

using MainApi.Data.DbContext;
using MainApi.Lib.Testing.Helpers;

using Microsoft.EntityFrameworkCore;

using Xunit;

/// <summary>
/// Architecture guards locking in the #431 handler file contract (#357 Wave B).
/// Each fact scans the compiled API assembly via reflection and fails with the
/// concrete offender when the contract regresses — cheaper and more reliable than
/// catching it in review. The contract: every handler is a non-abstract class whose
/// public Minimal-API entrypoint is named exactly <c>Handle</c>; handlers never take
/// or store <see cref="MainApiDbContext"/> (DbContext access is via services only);
/// and HTTP wire/contract + validator types are top-level siblings, never public
/// nested types inside the handler class. See
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
		_ = ArchitectureDiscoveryHelper
			.EnumerateHandlerEntrypointTypes()
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
	[Fact]
	public void ItShouldNameHandlerEntrypointsExactlyHandle() {
		List<string> offenders = ArchitectureDiscoveryHelper
			.EnumerateHandlerEntrypointTypes()
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

	// B.2 — handler classes do not depend on MainApiDbContext. Scan constructor
	// parameters, instance/static fields, properties, and the Handle method's
	// parameters. DbContext access belongs in services, never in handlers.
	[Fact]
	public void ItShouldKeepHandlersFreeOfDbContext() {
		List<string> offenders = ArchitectureDiscoveryHelper
			.EnumerateHandlerEntrypointTypes()
			.SelectMany(FindDbContextDependencies)
			.OrderBy(name => name, StringComparer.Ordinal)
			.ToList();

		_ = offenders.Should().BeEmpty(
			"handlers must not inject, store, or parameterize "
			+ "MainApiDbContext — DbContext access is via services only "
			+ "(handlers orchestrate, services implement)."
		);
	}

	// B.3 — handler classes expose no public nested types. HTTP contract types
	// (Body/Query/Result/Response/Item) and *Validator types must be top-level
	// siblings in the handler file, never nested public types inside the class.
	[Fact]
	public void ItShouldKeepContractTypesOutOfHandlerClasses() {
		List<string> offenders = ArchitectureDiscoveryHelper
			.EnumerateHandlerEntrypointTypes()
			.SelectMany(type => type
				.GetNestedTypes(BindingFlags.Public)
				.Select(nested => $"{type.FullName}+{nested.Name}"))
			.OrderBy(name => name, StringComparer.Ordinal)
			.ToList();

		_ = offenders.Should().BeEmpty(
			"handler classes must expose no public nested types — HTTP "
			+ "contract types (Body/Query/Result/Response/Item) and *Validator "
			+ "types must be declared as top-level siblings in the handler file, "
			+ "not nested inside the handler class."
		);
	}

	// B.4 — every FluentValidation AbstractValidator<T> declared in a .Handlers.
	// namespace targets a T that is a top-level (non-nested) type whose name ends
	// in "Body" or "Query". This keeps validators bound to the public request
	// contract types (the body/query DTOs), never to nested or arbitrary shapes.
	[Fact]
	public void ItShouldTargetTopLevelBodyOrQueryTypesFromHandlerValidators() {
		IReadOnlyList<Type> validators =
			ArchitectureDiscoveryHelper.EnumerateValidatorTypes();

		// Vacuity check: an empty discovery would make the target check pass
		// for the wrong reason.
		_ = validators.Should().NotBeEmpty(
			"validator discovery must find AbstractValidator<T> subclasses in "
			+ "handler namespaces to scan."
		);

		List<string> offenders = validators
			.Select(validator => (
				Validator: validator,
				Target: ArchitectureDiscoveryHelper.GetValidatorTarget(validator)
			))
			.Where(pair => !IsValidValidatorTarget(pair.Target))
			.Select(pair =>
				$"{pair.Validator.Name} -> {DescribeTarget(pair.Target)}")
			.OrderBy(name => name, StringComparer.Ordinal)
			.ToList();

		_ = offenders.Should().BeEmpty(
			"an AbstractValidator<T> in a handler namespace must target a "
			+ "top-level (non-nested) request contract type whose name ends in "
			+ "'Body' or 'Query'."
		);
	}

	private static IEnumerable<string> FindDbContextDependencies(Type type) {
		foreach (var constructor in type.GetConstructors()) {
			foreach (var parameter in constructor.GetParameters()) {
				if (IsDbContext(parameter.ParameterType)) {
					yield return $"{type.FullName}.ctor({parameter.Name})";
				}
			}
		}

		// No DeclaredOnly: include inherited members so a MainApiDbContext stashed
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

	private static bool IsDbContext(Type type) {
		if (type == typeof(MainApiDbContext)
			|| typeof(MainApiDbContext).IsAssignableFrom(type)) {
			return true;
		}

		// IDbContextFactory<MainApiDbContext> is a real DbContext-access vector
		// (it hands out MainApiDbContext instances), so flag it too.
		// IServiceProvider is intentionally NOT flagged: it is too broad and would
		// false-positive on legitimate non-DbContext service resolution.
		return type.IsGenericType
			&& type.GetGenericTypeDefinition() == typeof(IDbContextFactory<>)
			&& type.GetGenericArguments()[0] == typeof(MainApiDbContext);
	}

	private static bool IsValidValidatorTarget(Type? target) {
		if (target is null || target.IsNested) {
			return false;
		}

		return target.Name.EndsWith("Body", StringComparison.Ordinal)
			|| target.Name.EndsWith("Query", StringComparison.Ordinal);
	}

	private static string DescribeTarget(Type? target) {
		if (target is null) {
			return "<no AbstractValidator<T> base>";
		}

		return target.IsNested
			? $"{target.Name} (nested)"
			: target.Name;
	}
}
