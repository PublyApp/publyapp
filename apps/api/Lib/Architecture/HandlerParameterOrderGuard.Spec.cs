
using System.Reflection;
using System.Security.Claims;

using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Architecture guard enforcing the canonical <c>Handle</c> method parameter
/// order for all handler entrypoints (#357, issue #565).
///
/// Canonical group order (per docs/guides/csharp-coding-standards.md,
/// "Suggested parameter order"):
///   1) <c>[FromRoute]</c> route parameters
///   2) <c>[AsParameters]</c> query DTO
///   3) <c>[FromBody]</c> request body
///   4) <c>[FromServices]</c> (any number of injected services/loggers)
///   5) <c>CancellationToken cancellationToken = default</c> — MUST be last
///
/// Missing groups are fine; present groups must appear in the order above.
/// The guard reports the concrete offending handler + the violated ordering
/// rule so regressions are immediately actionable.
/// </summary>
public sealed class HandlerParameterOrderGuardSpec {
	static HandlerParameterOrderGuardSpec() {
		AppEnvironment.Initialize();
	}

	/// <summary>
	/// Allowlist for pre-existing handlers whose parameter order does not yet
	/// match the canonical shape. This is intentionally EMPTY: the #538 triage
	/// already fixed the previously known violations
	/// (<c>CreateStaffInvitation</c> and
	/// <c>AssignTenantProfilePermissionAsStaff</c>). New violations must never
	/// be added here; they must be fixed instead.
	/// </summary>
	private static readonly HashSet<string> Allowlist = new(
		StringComparer.Ordinal
	) {
		// Zero entries — the guard is strict by design.
	};

	[Fact]
	public void ItShouldDiscoverHandlerEntrypointsToGuard() {
		// Vacuity check: a broken namespace filter would produce an empty list
		// and make the order guard pass trivially. Assert discovery is non-empty
		// so the vacuity cannot silently hide a real regression.
		_ = ArchitectureDiscovery
			.EnumerateHandlerEntrypoints()
			.Should()
			.NotBeEmpty(
				"handler-entrypoint discovery must find classes exposing a "
				+ "public static Handle method; an empty result would make the "
				+ "parameter-order guard vacuous."
			);
	}

	// Enforces the canonical group order:
	// [FromRoute]* → [AsParameters]? → [FromBody]? → [FromServices]* → CancellationToken
	//
	// The rule is encoded as: for each pair of adjacent groups (A, B) where
	// A must precede B, the last parameter in group A must have a lower
	// positional index than the first parameter in group B. Groups not
	// present in a given Handle signature are skipped.
	[Fact]
	public void ItShouldOrderHandleParametersCanonically() {
		IReadOnlyList<MethodInfo> entrypoints =
			ArchitectureDiscovery.EnumerateHandlerEntrypoints();

		// Vacuity check inside the guard.
		_ = entrypoints.Should().NotBeEmpty(
			"handler-entrypoint discovery must find classes exposing a public "
			+ "static Handle method; an empty result would make the "
			+ "parameter-order guard vacuous."
		);

		List<string> offenders = entrypoints
			.Select(method => (
				Method: method,
				HandlerName: method.DeclaringType?.FullName
					?? method.DeclaringType?.Name
					?? "<unknown>"
			))
			.Where(entry => !Allowlist.Contains(entry.HandlerName))
			.Select(entry => (
				entry.HandlerName,
				Violation: FindParameterOrderViolation(entry.Method)
			))
			.Where(entry => entry.Violation is not null)
			.Select(entry => $"{entry.HandlerName}: {entry.Violation}")
			.OrderBy(name => name, StringComparer.Ordinal)
			.ToList();

		_ = offenders.Should().BeEmpty(
			"every Handle method must list its parameters in canonical group "
			+ "order: [FromRoute]* → [AsParameters]? → [FromBody]? → "
			+ "[FromServices]* → CancellationToken (last). "
			+ "Missing groups are fine; present groups must respect the order. "
			+ "Fix the offending handler(s) — do not add them to the allowlist."
		);
	}

	[Fact]
	public void ItShouldKeepAllowlistEmpty() {
		// Guards against allowlist growth: any entry added to the allowlist
		// must be a tracked, justified baseline. This fact asserts the
		// zero-entry invariant explicitly so a reviewer cannot miss a new
		// entry that slipped in without discussion.
		_ = Allowlist.Should().BeEmpty(
			"the parameter-order allowlist must remain empty; all handlers "
			+ "must conform to the canonical group order. If a pre-existing "
			+ "violation is found, fix it rather than adding it here."
		);
	}

	// Returns a human-readable violation description for the Handle method's
	// parameter list, or null when the order is canonical.
	//
	// Group assignment:
	//   FromRoute     → group 1
	//   AsParameters  → group 2
	//   FromBody      → group 3
	//   FromServices  → group 4
	//   CancellationToken (last) → group 5
	//   Everything else (unannotated, e.g. implicit route params) → group 1
	//     because ASP.NET Core treats unannotated simple-type params as
	//     route/query by default; this is a conservative approximation that
	//     avoids false positives for unannotated scalar params used as IDs.
	//
	// A violation occurs when any parameter's group number is less than the
	// group number of a parameter that appeared earlier in the list.
	private static string? FindParameterOrderViolation(MethodInfo method) {
		var parameters = method.GetParameters();
		var classified = parameters
			.Select(parameter => (
				Parameter: parameter,
				Group: ClassifyGroup(parameter)
			))
			.ToList();

		int maxGroupSeen = 0;
		for (int index = 0; index < classified.Count; index++) {
			var (parameter, group) = classified[index];

			// CancellationToken must always be last (highest index).
			if (parameter.ParameterType == typeof(CancellationToken)) {
				if (index != classified.Count - 1) {
					return $"CancellationToken '{parameter.Name}' is not the "
						+ $"last parameter (position {index + 1} of "
						+ $"{classified.Count}).";
				}
				// CancellationToken is group 5 — no further order check
				// needed because it IS last.
				continue;
			}

			if (group < maxGroupSeen) {
				var (prevParam, prevGroup) = classified[index - 1];
				return $"parameter '{parameter.Name}' (group {group} = "
					+ $"{GroupName(group)}) appears after "
					+ $"'{prevParam.Name}' (group {prevGroup} = "
					+ $"{GroupName(prevGroup)}); expected order is "
					+ "[FromRoute] → [AsParameters] → [FromBody] → "
					+ "[FromServices] → CancellationToken.";
			}

			if (group > maxGroupSeen) {
				maxGroupSeen = group;
			}
		}

		return null;
	}

	// Assigns a canonical group number to a Handle method parameter.
	private static int ClassifyGroup(ParameterInfo parameter) {
		// CancellationToken is handled separately (must be last).
		if (parameter.ParameterType == typeof(CancellationToken)) {
			return 5;
		}

		if (HasAttribute<FromServicesAttribute>(parameter)) {
			return 4;
		}

		// ASP.NET Core Minimal API "special" parameters are automatically
		// resolved by the framework at the service/infrastructure level, even
		// without an explicit [FromServices] attribute. They behave like group-4
		// parameters and must therefore not be classified as route-level (group 1)
		// to avoid false positives when they follow [AsParameters] or [FromBody].
		if (IsSpecialMinimalApiParameter(parameter.ParameterType)) {
			return 4;
		}

		if (HasAttribute<FromBodyAttribute>(parameter)) {
			return 3;
		}

		if (HasAttribute<AsParametersAttribute>(parameter)) {
			return 2;
		}

		if (HasAttribute<FromRouteAttribute>(parameter)) {
			return 1;
		}

		// Unannotated simple-type scalar parameters (e.g. a route-bound
		// string without an explicit [FromRoute]) are treated conservatively
		// as group 1 (route-level) to avoid false positives. ASP.NET Core
		// resolves these from route data by default when the route template
		// contains a matching segment.
		return 1;
	}

	// Returns true for ASP.NET Core Minimal API "special" parameter types that
	// are automatically resolved by the framework at the HTTP-infrastructure
	// level without requiring an explicit [FromServices] attribute.
	// Source: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis/parameter-binding
	private static bool IsSpecialMinimalApiParameter(Type type) {
		return type == typeof(HttpContext)
			|| type == typeof(HttpRequest)
			|| type == typeof(HttpResponse)
			|| type == typeof(ClaimsPrincipal)
			|| type == typeof(IFormFile)
			|| type == typeof(IFormFileCollection);
	}

	private static string GroupName(int group) {
		return group switch {
			1 => "[FromRoute]",
			2 => "[AsParameters]",
			3 => "[FromBody]",
			4 => "[FromServices]",
			5 => "CancellationToken",
			_ => $"group-{group}",
		};
	}

	private static bool HasAttribute<TAttribute>(ParameterInfo parameter)
		where TAttribute : Attribute {
		return parameter.IsDefined(typeof(TAttribute), inherit: false);
	}
}
