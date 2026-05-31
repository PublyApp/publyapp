
using System.Text.RegularExpressions;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;
/// <summary>
/// Guards the repo convention that route path constants never carry inline route
/// constraints (e.g. <c>{userId:guid}</c> or <c>{id:int}</c>). IDs are parsed in
/// handlers with <c>Guid.TryParse</c>; a malformed ID must return 400 (BadRequest),
/// not a route-level 404. Inline constraints would silently turn malformed IDs
/// into 404s, regressing that contract. See docs/guides/test-conventions.md
/// ("Architecture Tests") for the guardrail rationale and how to add new guards.
/// </summary>
public sealed class RouteConstraintGuardSpec {
	static RouteConstraintGuardSpec() {
		AppEnvironment.Initialize();
	}

	/// <summary>
	/// Matches a route parameter segment that contains a constraint: an opening
	/// brace, a parameter name, then a colon before the closing brace —
	/// e.g. <c>{userId:guid}</c>, <c>{id:int}</c>, <c>{slug:minlength(2)}</c>.
	/// </summary>
	private static readonly Regex RouteConstraintPattern =
		new(
			@"\{[A-Za-z_][A-Za-z0-9_]*:",
			RegexOptions.Compiled,
			TimeSpan.FromMilliseconds(100)
		);

	[Fact]
	public void ItShouldRejectRouteConstraintsInRoutePathConstants() {
		var offenders = ArchitectureDiscovery
			.EnumerateRouteConstants()
			.Where(constant =>
				RouteConstraintPattern.IsMatch(constant.Value))
			.Select(constant =>
				$"{constant.Name} = \"{constant.Value}\"")
			.OrderBy(name => name, StringComparer.Ordinal)
			.ToList();

		offenders.Should().BeEmpty(
			"route path constants must not use inline route constraints "
			+ "like ':guid' or ':int'. Validate IDs in handlers with "
			+ "Guid.TryParse so malformed IDs return 400 (BadRequest), "
			+ "not a route-level 404."
		);
	}

	[Fact]
	public void ItShouldDiscoverRouteConstantsToGuard() {
		// Sanity check: the guard above is only meaningful if discovery actually
		// finds route constants. A silent zero-count would make the constraint
		// guard vacuously pass.
		ArchitectureDiscovery
			.EnumerateRouteConstants()
			.Should()
			.NotBeEmpty(
				"route-constant discovery must find the Routes.* constants; "
				+ "an empty result would make the constraint guard vacuous."
			);
	}
}
