
using FluentAssertions;

using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.Testing.Fakes;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// HIGH-SECURITY architecture guard: every HTTP endpoint under the staff scope
/// (<c>/staff/*</c>) and the tenant scope (<c>/</c> tenant group) MUST declare
/// explicit permission metadata via <c>.WithPermission(…)</c>, which attaches a
/// <see cref="HasPermissionMetadata"/> marker, so that no protected route is
/// accidentally left open to any authenticated user. Anonymous routes (<c>/auth/*</c>,
/// <c>/invitations/*</c>, <c>/notices/active</c>) and system infrastructure
/// routes (<c>/health</c>, OpenAPI, Scalar, fallback) are allowlisted with
/// explicit reasons. Pre-existing drift is baselined here with justification so
/// the guard passes on <c>develop</c> while making the gap visible; each baseline
/// entry is a ratchet target, never a general exception.
///
/// The guard builds a real <c>WebApplication</c> via
/// <see cref="WebApplicationFactory{TEntryPoint}"/> (with DB replaced by a
/// no-op stub so no real Postgres is required) and inspects
/// <see cref="EndpointDataSource"/> metadata — the same metadata the runtime
/// uses when routing a request. This is the only reliable way to verify
/// <c>IEndpointFilter</c> metadata that is attached through fluent builder calls
/// at route-registration time.
///
/// Classification rules (in evaluation order):
/// <list type="number">
///   <item>System routes — hardcoded infrastructure paths: exempt.</item>
///   <item>Anonymous allowlist — explicit per-route entries: exempt.</item>
///   <item>Staff scope — path starts with <c>/staff/</c>: must have <see cref="HasPermissionMetadata"/>.</item>
///   <item>Tenant scope — path starts with <c>/</c> (tenant root) but is not staff/anonymous/system: must have <see cref="HasPermissionMetadata"/>.</item>
/// </list>
/// </summary>
public sealed class EndpointPermissionMetadataGuardSpec : IDisposable {
	static EndpointPermissionMetadataGuardSpec() {
		AppEnvironment.Initialize();
	}

	// ── Anonymous route allowlist ───────────────────────────────────────────

	/// <summary>
	/// Route path prefixes and exact paths that are intentionally anonymous
	/// (no session required, therefore no permission required).
	/// Every entry carries an explicit reason so reviewers understand the
	/// exception without reading the source.
	/// </summary>
	private static readonly IReadOnlyList<AllowlistedRoute> AnonymousAllowlist = [
		new AllowlistedRoute(
			PathMatch: RoutePathMatch.Prefix("/auth/"),
			Reason:
				"Auth group endpoints are public (login, register, verify-email, "
				+ "reset-password, redirect-code, user-tenants). Some carry session "
				+ "auth filters (.WithSessionAuthentication()) but none require "
				+ "PermissionFilter — session checks ≠ permission checks."
		),
		new AllowlistedRoute(
			PathMatch: RoutePathMatch.Prefix("/invitations/"),
			Reason:
				"Anonymous invitation endpoints (/invitations/{token}/details, "
				+ "/invitations/{token}/accept, /invitations/check) are public "
				+ "token-based flows used before a user has an active session."
		),
		new AllowlistedRoute(
			PathMatch: RoutePathMatch.Exact("/notices/active"),
			Reason:
				"Public system-notice feed read by unauthenticated visitors; "
				+ "staff-managed notices are exposed on the anonymous surface intentionally."
		),
	];

	// ── System / infrastructure route allowlist ─────────────────────────────

	/// <summary>
	/// Infrastructure route prefixes/exact paths that are neither staff nor
	/// tenant business routes. These do not carry permission metadata by design.
	/// </summary>
	private static readonly IReadOnlyList<AllowlistedRoute> SystemAllowlist = [
		new AllowlistedRoute(
			PathMatch: RoutePathMatch.Exact("/health"),
			Reason:
				"Health-check endpoint registered by app.MapHealthChecks(\"/health\"); "
				+ "must be reachable by load-balancer probes without auth."
		),
		new AllowlistedRoute(
			PathMatch: RoutePathMatch.Prefix("/openapi/"),
			Reason:
				"OpenAPI document endpoints (app.MapOpenApi()) served in Development "
				+ "only; drives TypeScript client generation via Kiota."
		),
		new AllowlistedRoute(
			PathMatch: RoutePathMatch.Prefix("/scalar/"),
			Reason:
				"Scalar interactive API reference (app.MapScalarApiReference()) served "
				+ "in Development only; no auth required for developer tooling."
		),
		new AllowlistedRoute(
			// Fallback handler registered by MapNotFoundRoute() — its RoutePattern
			// is "{**path}" which renders as an empty or wildcard route display.
			PathMatch: RoutePathMatch.Prefix("{"),
			Reason:
				"Catch-all fallback registered by MapNotFoundRoute(). "
				+ "Returns RFC 7807 404 for all unmatched paths; no permission metadata needed."
		),
	];

	// ── Baseline: pre-existing drift (security-sensitive — audit before removing) ──

	/// <summary>
	/// Protected-scope endpoints that currently lack <see cref="HasPermissionMetadata"/>
	/// endpoint metadata (i.e. were registered without <c>.WithPermission(…)</c>).
	/// These are baselined so the guard passes on <c>develop</c> while surfacing
	/// the gap for a follow-up fix. Each entry is a RATCHET TARGET.
	///
	/// SECURITY NOTE: Any entry here represents a route that is authenticated
	/// (session + scope auth filter applies) but has no fine-grained permission
	/// check. Admin-level users bypass PermissionFilter, but non-admin users will
	/// reach the handler without permission enforcement. Fix before GA.
	/// </summary>
	private static readonly HashSet<string> BaselinedDriftRoutes = new(
		StringComparer.OrdinalIgnoreCase
	) {
		// TODO(#534 ratchet): Tenant test/placeholder route at /test.
		// This is a temporary "Hello, World!" route in Program.cs that was
		// used to verify tenant group wiring before real tenant endpoints existed.
		// It is tenant-authenticated (session + TenantAuthFilter runs) but carries
		// no PermissionFilter. Remove or protect this route before the tenant
		// surface ships publicly.
		"GET /test",
	};

	// ── Test factory (no real DB needed for route-metadata inspection) ──────

	private readonly RouteMapFactory _factory = new();

	public void Dispose() {
		_factory.Dispose();
	}

	// ── Vacuity check ───────────────────────────────────────────────────────

	[Fact]
	public void ItShouldDiscoverEndpointsToGuard() {
		// A silent zero-count (e.g. a broken route enumeration) would make
		// the permission guard pass for the wrong reason.
		var endpoints = GetAllRouteEndpoints();

		_ = endpoints
			.Should()
			.NotBeEmpty(
				"route-endpoint discovery must find registered HTTP endpoints; "
				+ "an empty result would make the permission-metadata guard vacuous."
			);
	}

	// ── Main permission guard ───────────────────────────────────────────────

	[Fact]
	public void ItShouldRequirePermissionMetadataOnProtectedEndpoints() {
		// Collect all route endpoints from the live WebApplication route map.
		// This is the same metadata the ASP.NET Core routing pipeline uses.
		var endpoints = GetAllRouteEndpoints();

		var offenders = new List<string>();

		foreach (var endpoint in endpoints) {
			var key = BuildEndpointKey(endpoint);
			var path = endpoint.RoutePattern.RawText ?? string.Empty;

			// 1. Skip system infrastructure routes.
			if (IsSystemRoute(path)) {
				continue;
			}

			// 2. Skip explicitly anonymous routes.
			if (IsAnonymousRoute(path)) {
				continue;
			}

			// 3. Only staff and tenant scoped routes remain.
			// Staff: /staff/* | Tenant: / (all non-staff, non-anonymous).
			// Both MUST carry PermissionFilter metadata.
			var hasPermissionFilter = EndpointHasPermissionFilter(endpoint);
			if (hasPermissionFilter) {
				continue;
			}

			// 4. Check baseline before reporting as an offender.
			if (BaselinedDriftRoutes.Contains(key)) {
				continue;
			}

			offenders.Add(key);
		}

		_ = offenders
			.OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
			.Should()
			.BeEmpty(
				"every staff and tenant endpoint must declare explicit permission "
				+ "metadata via .WithPermission(…) / PermissionFilter. "
				+ "Add .WithPermission([AppPermissions.*]) to the route registration, "
				+ "or add the route to BaselinedDriftRoutes with justification if it "
				+ "is a tracked pre-existing gap."
			);
	}

	// ── Allowlist staleness guard ──────────────────────────────────────────

	[Fact]
	public void ItShouldKeepBaselinedDriftEntriesRelevant() {
		// Guards against stale baseline drift: every baselined route must still
		// exist as an actual endpoint that still lacks PermissionFilter.
		// If a route is fixed or removed, its baseline entry must be pruned.
		var endpoints = GetAllRouteEndpoints();

		var actualUnprotectedKeys = endpoints
			.Where(ep => {
				var path = ep.RoutePattern.RawText ?? string.Empty;
				return !IsSystemRoute(path) && !IsAnonymousRoute(path)
					&& !EndpointHasPermissionFilter(ep);
			})
			.Select(BuildEndpointKey)
			.ToHashSet(StringComparer.OrdinalIgnoreCase);

		var staleEntries = BaselinedDriftRoutes
			.Where(entry => !actualUnprotectedKeys.Contains(entry))
			.OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
			.ToList();

		_ = staleEntries
			.Should()
			.BeEmpty(
				"baselined drift entries must still correspond to an actual "
				+ "unprotected endpoint; remove stale entries so the baseline "
				+ "ratchets down as gaps are fixed."
			);
	}

	// ── Helpers ─────────────────────────────────────────────────────────────

	private IReadOnlyList<RouteEndpoint> GetAllRouteEndpoints() {
		using var scope = _factory.Services.CreateScope();
		var dataSource = scope.ServiceProvider
			.GetRequiredService<EndpointDataSource>();

		return dataSource.Endpoints
			.OfType<RouteEndpoint>()
			.ToList();
	}

	private static bool EndpointHasPermissionFilter(RouteEndpoint endpoint) {
		return endpoint.Metadata
			.OfType<HasPermissionMetadata>()
			.Any();
	}

	private static bool IsSystemRoute(string path) {
		return SystemAllowlist.Any(entry => entry.PathMatch.Matches(path));
	}

	private static bool IsAnonymousRoute(string path) {
		return AnonymousAllowlist.Any(entry => entry.PathMatch.Matches(path));
	}

	/// <summary>
	/// Builds a stable key for an endpoint: <c>"METHOD /path"</c>.
	/// Uses the raw route pattern text (preserving parameter tokens like
	/// <c>{userId}</c>) so the key is deterministic across builds.
	/// </summary>
	private static string BuildEndpointKey(RouteEndpoint endpoint) {
		var httpMethodMetadata = endpoint.Metadata
			.OfType<HttpMethodMetadata>()
			.FirstOrDefault();

		var method = httpMethodMetadata?.HttpMethods.FirstOrDefault() ?? "ANY";
		var path = endpoint.RoutePattern.RawText ?? "(unknown)";
		return $"{method} {path}";
	}

	// ── Inner types ─────────────────────────────────────────────────────────

	/// <summary>
	/// Minimal <see cref="WebApplicationFactory{TEntryPoint}"/> variant that
	/// replaces the EF Core <see cref="DbContext"/> with an unreachable stub so
	/// no real Postgres instance is required. Route metadata is registered during
	/// <c>WebApplication.Build()</c>, before any HTTP request is made, so this
	/// factory is sufficient for inspecting <see cref="EndpointDataSource"/>.
	/// </summary>
	private sealed class RouteMapFactory : WebApplicationFactory<Program> {
		protected override void ConfigureWebHost(IWebHostBuilder builder) {
			// Run in Testing environment so HTTPS redirect is skipped and
			// Scalar/OpenAPI are not mapped (keeping the route set production-like).
			builder.UseEnvironment(EnvironmentNames.Testing);

			builder.ConfigureServices(services => {
				// Replace DbContext with an unreachable stub — we never execute
				// a query, so a dummy connection string is safe here.
				services.RemoveAll<DbContextOptions<AppDbContext>>();
				services.RemoveAll<AppDbContext>();
				services.AddDbContext<AppDbContext>(options =>
					options.UseNpgsql(
						"Host=architecture-guard-stub;Database=stub;Username=stub;Password=stub"
					)
				);

				// Replace email sender with the test fake so no real SMTP is needed.
				services.RemoveAll<Infrastructure.Messaging.Email.IEmailSender>();
				services.AddSingleton<FakeEmailSender>();
				services.AddSingleton<Infrastructure.Messaging.Email.IEmailSender>(
					sp => sp.GetRequiredService<FakeEmailSender>()
				);

				// Route discovery needs no hosted worker loops. In particular, the migration
				// startup gate must not probe this intentionally unreachable stub database.
				ApiFactory.RemoveWorkerHostedServices(services);
			});
		}
	}

	/// <summary>
	/// A pattern that matches a route path either by exact equality or by prefix.
	/// </summary>
	private sealed record RoutePathMatch {
		private readonly string _value;
		private readonly bool _isPrefix;

		private RoutePathMatch(string value, bool isPrefix) {
			_value = value;
			_isPrefix = isPrefix;
		}

		public static RoutePathMatch Prefix(string prefix) {
			return new RoutePathMatch(prefix, isPrefix: true);
		}

		public static RoutePathMatch Exact(string path) {
			return new RoutePathMatch(path, isPrefix: false);
		}

		public bool Matches(string path) {
			return _isPrefix
				? path.StartsWith(_value, StringComparison.OrdinalIgnoreCase)
				: string.Equals(path, _value, StringComparison.OrdinalIgnoreCase);
		}
	}

	/// <summary>
	/// An allowlisted route with an explicit reason explaining why it is exempt
	/// from the permission-metadata requirement.
	/// </summary>
	private sealed record AllowlistedRoute(
		RoutePathMatch PathMatch,
		string Reason
	);
}
