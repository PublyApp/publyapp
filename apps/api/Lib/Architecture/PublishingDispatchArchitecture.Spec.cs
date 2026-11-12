using System.Reflection;
using System.Reflection.Emit;
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
using System.Reflection.PortableExecutable;
using System.Text.RegularExpressions;

using FluentAssertions;

using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.Testing.Fakes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Publishing.Jobs;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Publishing-specific dispatch + HTTP architecture guard (Epic D3), companion to
/// <see cref="PublicationArchitectureSpec"/>:
/// <list type="number">
/// <item>every publishing tenant endpoint (<c>/posts/*/schedule</c>,
/// <c>/posts/publications</c>) must carry explicit permission metadata
/// (<c>.WithTenantPermission</c>, marker <see cref="HasPermissionMetadata"/> — the
/// same live-route-map technique as EndpointPermissionMetadataGuardSpec) AND an
/// explicit rate-limit policy; the route set is closed — an unreviewed new
/// publishing route fails the count until it joins the guard.</item>
/// <item><c>DispatchDuePostsJob</c> is the ONLY place allowed to issue
/// <c>SELECT … FOR UPDATE SKIP LOCKED</c> against the publications table. The
/// due-scan lock IS the linearization point of concurrent dispatch; a second
/// locker would silently fork the exactly-once guarantee proven by
/// DispatchDuePostsConcurrencySpec. The guard reads the string literals of the
/// COMPILED API assembly (not source text) and is closed over a METHOD-level
/// inventory: any (type, declared method) whose literals, alone or joined in
/// order, contain the clause must be the job or a reviewed entry that names its
/// own table as a literal in the same method (so a table-parameter helper can
/// never be inventoried) and never names publications. Concatenation,
/// interpolation, helper methods/classes and async methods are all seen.
/// Failures name type.method and file:line (portable PDB). Not reusing
/// ArchitectureDiscovery: it excludes the Migrations namespace, where SQL lives.
/// Maintenance cost: ~100 lines of IL decoding plus one inventory line per
/// reviewed lock. Retire when the claim sits behind one repository seam or
/// Postgres-side enforcement.</item>
/// </list>
/// Documented residual gaps (static scan of one assembly): only the API
/// assembly is scanned (a sibling production project would need its own scan);
/// runtime-built SQL (reflection, a table or clause fed from config/data),
/// stored Postgres functions or views that lock internally, a clause split into
/// fragments that never share a method and never spell SKIP LOCKED, and a
/// comment between SKIP and LOCKED are invisible; an inventoried method's
/// table is asserted by literal only. An executed check (command interceptor)
/// would only cover paths a test runs, so it is not used.
/// Proven RED by planting a second publications-row SKIP LOCKED claim and by
/// stripping permission metadata from a publishing endpoint
/// (.dump/mutation-rogue-schedule-writer.md).
///
/// Round R1 hardening: the route guard was suffix-based (<c>IsPublishingRoute</c>
/// matched <c>/posts/*</c> paths ending in <c>/schedule</c> or <c>/publications</c>),
/// which silently admitted any other <c>/posts/*</c> route (e.g. <c>/posts/{postId}/publish-now</c>,
/// <c>/posts/publish-targets</c>) without permission metadata or rate-limiting. The
/// guard now uses an EXPLICIT, CLOSED INVENTORY of every <c>/posts/*</c> route on the
/// live route map. Each route is classified as publishing (must carry permission +
/// rate-limit) or non-publishing (must be listed to stay closed). Any <c>/posts/*</c>
/// route absent from the inventory fails loudly, naming the unknown route.
/// </summary>
public sealed partial class PublishingDispatchArchitectureSpec : IDisposable {
	static PublishingDispatchArchitectureSpec() {
		AppEnvironment.Initialize();
	}

	// ── (a) Publishing tenant routes: permission + rate limiting ────────────

	// The closed set of publishing tenant routes (by endpoint name). Adding a route
	// here is the review checkpoint; an unlisted publishing route fails the
	// count assertion.
	private static readonly string[] _PublishingRouteEndpointNames = [
		"SchedulePostForTenant",
		"EditPostScheduleForTenant",
		"CancelPostScheduleForTenant",
		"FindScheduledPublicationsForTenant",
		// D2 publish-now landed in #1457 and is a publishing surface; its
		// handler resolves in PostEndpointsForTenant but its name must be
		// inventoried here so the route-vs-name cross-check holds.
		"PublishNowForTenant",
		// #647: retry of a Failed/Paused publication.
		"RetryPublicationForTenant",
		// #2176: the user resolves a needs-review publication as published.
		"MarkPublicationPublishedForTenant",
		// #2172: per-destination content overrides.
		"GetPublicationRenditionForTenant",
		"SetPublicationRenditionForTenant",
		"ResetPublicationRenditionForTenant",
	];

	// The explicit, closed inventory of every /posts/* route on the live route map.
	// Each entry is classified as publishing (must carry permission metadata +
	// rate-limit policy) or non-publishing (listed to keep the set closed). Any
	// /posts/* route NOT in this inventory fails the guard loudly — it is named
	// rather than silently bypassed. Adding a new /posts/* route requires choosing
	// a bucket here FIRST.
	//
	// Route patterns are normalised to the ASP.NET route-template form with
	// brace parameters (e.g. "/posts/{postId}/schedule"). The guard matches
	// against RoutePattern.RawText, which is the template as registered.
	private static readonly PublishingRouteInventoryEntry[] _PublishingRouteInventory = [
		// ── Publishing routes (must carry permission + rate limit) ─────────────
		new("/posts/publications", "GET", IsPublishing: true),
		new("/posts/{postId}/schedule", "POST", IsPublishing: true),
		new("/posts/{postId}/schedule", "PATCH", IsPublishing: true),
		new("/posts/{postId}/schedule", "DELETE", IsPublishing: true),
		// D2 publish-now: immediate publishing through the job queue, hanging off
		// the existing posts resource (D2 plan reconciliation 2 — the route
		// landed in #1457 and is a publishing surface).
		new("/posts/{postId}/publish-now", "POST", IsPublishing: true),
		new("/posts/publications/{publicationId}/retry", "POST", IsPublishing: true),
		new("/posts/publications/{publicationId}/mark-published", "POST", IsPublishing: true),
		new("/posts/publications/{publicationId}/rendition", "GET", IsPublishing: true),
		new("/posts/publications/{publicationId}/rendition", "PUT", IsPublishing: true),
		new("/posts/publications/{publicationId}/rendition", "DELETE", IsPublishing: true),
		// ── Non-publishing routes (listed to keep the set closed) ──────────────
		new("/posts", "POST", IsPublishing: false),
		new("/posts", "GET", IsPublishing: false),
		new("/posts/{postId}", "GET", IsPublishing: false),
		new("/posts/{postId}", "PATCH", IsPublishing: false),
		new("/posts/{postId}", "DELETE", IsPublishing: false),
		new("/posts/{postId}/image", "POST", IsPublishing: false),
		new("/posts/{postId}/image", "DELETE", IsPublishing: false),
		new("/posts/{postId}/images/{assetId}", "DELETE", IsPublishing: false),
		new("/posts/{postId}/images/{assetId}", "PATCH", IsPublishing: false),
		new("/posts/{postId}/images/order", "PATCH", IsPublishing: false),
	];

	// ── (b) Single SKIP LOCKED claimant on publications ─────────────────────

	// Reviewed closed inventory of every (type, method) in the API assembly that
	// may hold a SKIP LOCKED clause besides the sanctioned due-scan job. The
	// value is the table the method must name as a literal; null marks a
	// prose/data string that is not SQL. Never publications.
	private static readonly IReadOnlyDictionary<string, string?> _SkipLockedInventory =
		new Dictionary<string, string?>(StringComparer.Ordinal) {
			["PublyApp.Api.Modules.Jobs.Seeders.SystemJobDefinitionSeeder._GetDefinitions"] = null,
			["PublyApp.Api.Modules.Uploads.Jobs.UploadOrphanReclaimerHandler._ReclaimBatchAsync"] = "upload_assets",
			["PublyApp.Api.Modules.Messaging.Jobs.EmailLogRetentionHandler.HandleAsync"] = "email_log",
			["PublyApp.Api.Modules.Messaging.Jobs.EmailPreparedSendsRetentionHandler.HandleAsync"] = "email_prepared_sends",
			["PublyApp.Api.Modules.Jobs.Jobs.DeadLetterRetentionHandler.HandleAsync"] = "job_dead_letter",
			["PublyApp.Api.Modules.Jobs.Jobs.SystemJobOccurrenceRetentionHandler.HandleAsync"] = "system_job_occurrences",
			["PublyApp.Api.Modules.Auth.Jobs.CleanupExpiredSessionsHandler.HandleAsync"] = "sessions",
			["PublyApp.Api.Infrastructure.Messaging.Email.InvitationEmailOutboxDispatcher.ClaimBatchAsync"] = "invitation_email_outbox",
			["PublyApp.Api.Infrastructure.Jobs.JobQueueProcessor.ClaimBatchAsync"] = "job_queue",
		};

	private readonly RouteMapFactory _Factory = new();

	public void Dispose() {
		this._Factory.Dispose();
	}

	// ── (a) Every publishing tenant endpoint is guarded ──────────────────────

	/// <summary>
	/// The closed-set guard is now driven by an EXPLICIT INVENTORY of every
	/// <c>/posts/*</c> route on the live route map. A route absent from the
	/// inventory makes this fact RED, naming the unknown route — there is no
	/// suffix fallback that could silently admit an unreviewed publishing route
	/// (see .dump/URGENT-garde-routes-publiantes-aveugle.md).
	/// </summary>
	[Fact]
	public void ItShouldRequirePermissionAndRateLimitOnEveryPublishingTenantEndpoint() {
		var endpoints = this._GetRouteEndpoints();

		// (a1) Every publishing route by name still carries permission + rate limit.
		foreach (var name in PublishingDispatchArchitectureSpec._PublishingRouteEndpointNames) {
			var endpoint = endpoints.SingleOrDefault(route =>
				route.Metadata.GetMetadata<IEndpointNameMetadata>()?.EndpointName
					== name
			);
			_ = endpoint.Should().NotBeNull(
				"publishing tenant route '{0}' must exist on the live route map; "
					+ "if it was renamed, reconcile this closed-set guard",
				name
				);

			var endpointValue = endpoint.Required();
			_ = endpointValue.Metadata.OfType<HasPermissionMetadata>()
				.Should().NotBeEmpty(
					"'{0}' must declare .WithTenantPermission(...) so the scheduling "
						+ "surface can never ship without explicit permission metadata",
					name
				);

			var ratePolicy = endpointValue.Metadata
				.GetMetadata<EnableRateLimitingAttribute>();
			_ = ratePolicy.Should().NotBeNull(
				"'{0}' must opt into an explicit rate-limit bucket "
					+ "(AuthenticatedDefault, HeavySearchList for the list read)",
				name
			);
			Assert.NotNull(ratePolicy);
			ratePolicy.PolicyName.Should().NotBeNullOrWhiteSpace(
				"a named policy keeps the bucket auditable in api-rate-limiting docs"
			);
		}

		// (a2) The live route map exposes exactly the /posts/* routes we know
		// about — no silent unknown /posts/* routes allowed.
		var postsRoutesOnMap = endpoints
			.Where(endpoint => {
				var path = endpoint.RoutePattern.RawText ?? string.Empty;
				return path.StartsWith("/posts", StringComparison.Ordinal);
			})
			.Select(endpoint => new {
				Path = PublishingDispatchArchitectureSpec._NormalizeRoutePath(
					endpoint.RoutePattern.RawText ?? string.Empty),
				Method = PublishingDispatchArchitectureSpec._GetHttpMethod(endpoint),
				Endpoint = endpoint
			})
			.ToList();

		_ = postsRoutesOnMap.Should().NotBeEmpty(
			"the closed-set guard enumerates /posts/* routes from the live route "
			+ "map; an empty enumeration would silently pass every assertion"
		);

		var unknownRoutes = new List<string>();
		foreach (var entry in postsRoutesOnMap) {
			var match = PublishingDispatchArchitectureSpec._PublishingRouteInventory.FirstOrDefault(inv =>
				string.Equals(
					PublishingDispatchArchitectureSpec._NormalizeRoutePath(inv.Path),
					entry.Path,
					StringComparison.Ordinal)
				&& string.Equals(inv.Method, entry.Method, StringComparison.Ordinal)
			);

			if (match is null) {
				// The route is NOT in the inventory — this is the core fix:
				// an unknown /posts/* route fails loudly instead of being
				// silently bypassed.
				unknownRoutes.Add($"{entry.Method} {entry.Path}");
			} else if (match.IsPublishing) {
				// Cross-check: publishing routes must also appear in the
				// endpoint-name list above — the two closed sets must agree.
				var endpointName = entry.Endpoint
					.Metadata.GetMetadata<IEndpointNameMetadata>()
					?.EndpointName;

				if (endpointName is not null
					&& !PublishingDispatchArchitectureSpec._PublishingRouteEndpointNames.Contains(
						endpointName, StringComparer.Ordinal)) {
					unknownRoutes.Add(
						$"{entry.Method} {entry.Path} (endpoint '{endpointName}' "
						+ "classified as publishing but absent from "
						+ "_PublishingRouteEndpointNames)"
					);
				}
			}
		}

		_ = unknownRoutes.Should().BeEmpty(
			"every /posts/* route must be explicitly inventoried as publishing or "
			+ "non-publishing — an unlisted route silently bypasses permission + "
			+ "rate-limit enforcement; add it to _PublishingRouteInventory with its "
			+ "classification (isPublishing flag):\n{0}",
			string.Join("\n", unknownRoutes)
		);

		// (a3) The inventory count matches the route map — the closed set is
		// complete. If a route was removed from the API, this fails, forcing the
		// inventory to ratchet down.
		_ = postsRoutesOnMap.Should().HaveCount(
			PublishingDispatchArchitectureSpec._PublishingRouteInventory.Length,
			"the /posts/* route count on the live map must equal the explicit "
			+ "inventory length; adding or removing a route requires reconciling "
			+ "this closed set"
		);
	}

	// ── (b) Only the due-scan job SKIP LOCKs publications rows ──────────────

	[Fact]
	public void ItShouldRejectUnreviewedSkipLockedHoldersWhenScanningTheApiAssembly() {
		var scan = PublishingDispatchArchitectureSpec._ScanSkipLocked(
			typeof(Program).Assembly,
			PublishingDispatchArchitectureSpec._SkipLockedInventory
		);

		_ = scan.TotalHits.Should().BeGreaterThan(
			PublishingDispatchArchitectureSpec._SkipLockedInventory.Count,
			"the sanctioned due-scan claim and every inventoried holder must be "
				+ "visible; a lower count means the compiled-literal scan collapsed "
				+ "and failed open"
		);

		_ = scan.SanctionedNamingPublications.Should().BeGreaterThanOrEqualTo(
			1,
			"the due scan must still be seen locking the PUBLICATIONS table "
				+ "(FROM/UPDATE/JOIN publications … SKIP LOCKED) in {0}; a job that "
				+ "locks another table, or moved its SQL, must reconcile this guard",
			typeof(DispatchDuePostsJob).FullName
		);

		_ = scan.MissingInventory.Should().BeEmpty(
			"every inventoried method must still be seen; a stale entry hides a "
				+ "collapsed scan"
		);

		scan.Offenders.Should().BeEmpty(
			"SKIP LOCKED is closed over a method-level inventory: only {0} may lock "
				+ "publications rows; any other method holding the clause must be added "
				+ "to _SkipLockedInventory after review, naming its own table (never "
				+ "publications). Found {1} offender(s):\n{2}",
			typeof(DispatchDuePostsJob).FullName,
			scan.Offenders.Count,
			string.Join("\n", scan.Offenders.Take(20))
		);
	}

	// Non-vacuity, one assertion per claimed capability. Each fixture is red
	// (missing from the offenders) if its capability is removed from the scan.
	[Fact]
	public void ItShouldReportEveryPlantedClaimantShapeWhenScanningCompiledCode() {
		var scan = PublishingDispatchArchitectureSpec._ScanSkipLocked(
			typeof(PublishingDispatchArchitectureSpec).Assembly,
			PublishingDispatchArchitectureSpec._PlantedInventory
		);
		var offenders = scan.Offenders;
		var all = string.Join("\n", offenders);

		// Rule 1: unknown holders, however the SQL is assembled.
		foreach (var shape in new[] {
			"PlantedClaimants.Concatenated ", // compiler-folded concatenation
			"PlantedClaimants.SplitAroundValue ", // fragments joined per method
			"PlantedClaimants.Interpolated ", // FormattableString
			"PlantedClaimants.LowerCase ", // case-insensitive
			"PlantedClaimants.NewlineBetween ", // whitespace between the words
			"PlantedCrossMethod._Tail ", // clause in another method
			"PlantedLockClause.Tail ", // clause in another class
		}) {
			_ = offenders.Should().Contain(
				o => o.Contains(shape),
				"{0} must be reported; offenders were:\n{1}",
				shape,
				all
			);
		}

		// Async method: declared name, with file:line when a portable PDB exists.
		var asyncOffender = offenders.SingleOrDefault(o => o.Contains("PlantedAsync.ClaimAsync "));
		_ = asyncOffender.Should().NotBeNull(all);
		if (!asyncOffender.Required().Contains("no portable PDB")) {
			_ = asyncOffender.Should().Contain("PublishingDispatchArchitecture.Spec.cs:");
		}

		_ = all.Should().NotContain("MoveNext");

		// Rule 2: a table-parameter helper can never be inventoried; its caller
		// holds no clause and is not a holder at all.
		_ = offenders.Should().Contain(
			o => o.Contains("PlantedGenericHelper.Lock ") && o.Contains("does not name its table"),
			all
		);
		_ = all.Should().NotContain("PlantedHelperCaller");

		// Rule 3: every SQL form naming publications is refused per method.
		foreach (var form in new[] { "From", "Only", "Schema", "CommaJoin", "Update", "Join", "Into" }) {
			_ = offenders.Should().Contain(
				o => o.Contains($"PlantedPublicationsForms.{form} ")
					&& o.Contains("names the publications table"),
				"publications form {0} must be refused; offenders were:\n{1}",
				form,
				all
			);
		}

		// Per-method: reading publications elsewhere does not taint a lock on
		// another table, and a correct inventoried method passes.
		_ = all.Should().NotContain("PlantedOtherTable.");
		_ = all.Should().NotContain("PlantedMixedStatements.");
	}

	// Decoder guard: switch (variable-size operand), ldc.i8 and adjacent ldstr
	// must not desynchronise the IL walk before the SKIP LOCKED literal.
	[Fact]
	public void ItShouldDecodeLiteralsAfterSwitchWithWideConstants() {
		var scan = PublishingDispatchArchitectureSpec._ScanSkipLocked(
			typeof(PublishingDispatchArchitectureSpec).Assembly,
			PublishingDispatchArchitectureSpec._PlantedInventory
		);

		_ = scan.Offenders.Should().Contain(o => o.Contains("PlantedDecoder.AfterSwitch "));
	}

	[Fact]
	public void ItShouldSizeEveryKnownOperandTypeAndRejectUnknownOnes() {
		var il = new byte[16];
		foreach (var type in Enum.GetValues<OperandType>()
			.Where(type => type.ToString() != "InlinePhi")) {
			var size = PublishingDispatchArchitectureSpec._OperandSize(type, il, 0);
			_ = size.Should().BeInRange(0, 8, "operand type {0}", type);
		}

		var act = () => PublishingDispatchArchitectureSpec._OperandSize((OperandType)999, il, 0);
		_ = act.Should().Throw<NotSupportedException>();
	}


	// ── Helpers ──────────────────────────────────────────────────────────────

	private IReadOnlyList<RouteEndpoint> _GetRouteEndpoints() {
		using var scope = this._Factory.Services.CreateScope();
		var dataSource = scope.ServiceProvider
			.GetRequiredService<EndpointDataSource>();

		return dataSource.Endpoints
			.OfType<RouteEndpoint>()
			.ToList();
	}

	private static string _NormalizeRoutePath(string path) {
		// ASP.NET Core route templates may or may not carry a trailing slash
		// depending on how they were registered (e.g. .MapPost("/") on a group
		// at /posts yields "/posts/"). Trim trailing slashes so the inventory
		// matches consistently. The root path "/" is preserved as-is.
		if (path.Length > 1) {
			path = path.TrimEnd('/');
		}
		return path;
	}

	private static string _GetHttpMethod(RouteEndpoint endpoint) {
		var httpMethods = endpoint.Metadata
			.OfType<HttpMethodMetadata>()
			.SelectMany(metadata => metadata.HttpMethods)
			.ToList();

		// A route group with multiple verbs collapses to one endpoint per verb
		// in EndpointDataSource, so we expect a single method here. If multiple
		// appear, join them for disambiguation.
		return httpMethods.Count > 0
			? string.Join(",", httpMethods)
			: "ANY";
	}

	/// <summary>
	/// One entry in the explicit /posts/* route inventory. Each entry pairs a
	/// route-template path with its HTTP verb and a classification flag:
	/// <c>isPublishing</c> = true means the route carries scheduling/publication
	/// intent and must bear permission metadata + a rate-limit policy;
	/// <c>false</c> means the route is content CRUD (non-publishing) and is listed
	/// only to keep the guard closed.
	/// </summary>
	private sealed record PublishingRouteInventoryEntry(
		string Path,
		string Method,
		bool IsPublishing
	);

	// Never executed: SQL shapes the guard must see in compiled code. Their
	// bodies exist only so the compiler emits the literals.
	private static class PlantedClaimants {
		public static string Concatenated() {
			return "SELECT id FROM publications " + "WHERE status = 1 FOR UPDATE SKIP " + "LOCKED";
		}

		public static string SplitAroundValue(string value) {
			return "SELECT id FROM publications FOR UPDATE SKIP " + value.Trim() + "LOCKED";
		}

		public static FormattableString Interpolated(Guid id) {
			return $"SELECT id FROM publications WHERE id = {id} FOR UPDATE SKIP LOCKED";
		}

		public static string LowerCase() {
			return "select id from publications for update skip locked";
		}

		public static string NewlineBetween() {
			return "SELECT id FROM publications FOR UPDATE SKIP\n  LOCKED";
		}
	}

	private static class PlantedCrossMethod {
		public static string Query(string status) {
			return $"SELECT id FROM publications WHERE status = {status}" + PlantedCrossMethod._Tail();
		}

		private static string _Tail() {
			return " FOR UPDATE SKIP LOCKED";
		}
	}

	private static class PlantedLockClause {
		public static string Tail() {
			return " FOR UPDATE SKIP LOCKED";
		}
	}

	// A generic helper: the table arrives from the caller, so the helper can
	// never name its own table and can never be inventoried.
	private static class PlantedGenericHelper {
		public static string Lock(string table) {
			return "SELECT id FROM " + table + " WHERE x = 1 FOR UPDATE SKIP LOCKED";
		}
	}

	private static class PlantedHelperCaller {
		public static string Claim() {
			return PlantedGenericHelper.Lock("publications");
		}
	}

	private static class PlantedAsync {
		public static async Task<List<Guid>> ClaimAsync(AppDbContext db) {
			return await db.Database
				.SqlQuery<Guid>($"SELECT id AS \"Value\" FROM publications FOR UPDATE SKIP LOCKED")
				.ToListAsync();
		}
	}

	// Inventoried (job_queue) yet each also names publications in a different
	// SQL form; every form must be refused.
	private static class PlantedPublicationsForms {
		public static string From() {
			return "SELECT id FROM publications p, job_queue FOR UPDATE SKIP LOCKED";
		}

		public static string Only() {
			return "SELECT id FROM job_queue, ONLY publications FOR UPDATE SKIP LOCKED";
		}

		public static FormattableString Schema(string schema) {
			return $"SELECT id FROM {schema}.publications, job_queue FOR UPDATE SKIP LOCKED";
		}

		public static string CommaJoin() {
			return "SELECT j.id FROM job_queue j, publications p FOR UPDATE OF j SKIP LOCKED";
		}

		public static string Update() {
			return "UPDATE publications SET x = 1 WHERE id IN "
				+ "(SELECT id FROM job_queue FOR UPDATE SKIP LOCKED)";
		}

		public static string Join() {
			return "SELECT j.id FROM job_queue j JOIN publications p ON p.id = j.id "
				+ "FOR UPDATE OF j SKIP LOCKED";
		}

		public static string Into() {
			return "INSERT INTO publications SELECT * FROM job_queue FOR UPDATE SKIP LOCKED";
		}
	}

	private static class PlantedOtherTable {
		public static string Sql() {
			return "SELECT id FROM job_queue FOR UPDATE SKIP LOCKED";
		}
	}

	// Publications is read in one method and another queue is locked in a
	// different one: per-method rules must leave both alone.
	private static class PlantedMixedStatements {
		public static string Read(Guid id) {
			return $"SELECT id FROM publications WHERE id = {id}";
		}

		public static string Claim() {
			return "SELECT id FROM job_queue FOR UPDATE SKIP LOCKED";
		}
	}

	private static class PlantedDecoder {
		public static string AfterSwitch(int value) {
			var wide = value switch {
				0 => 10_000_000_000L,
				1 => 20_000_000_000L,
				2 => 30_000_000_000L,
				_ => 40_000_000_000L
			};
			return "first " + wide + " second FOR UPDATE SKIP LOCKED";
		}
	}

	private static string _Key(Type type, string method) {
		return $"{type.FullName}.{method}";
	}

	// Reviewed holders for the fixture scan, so rules 2 and 3 are exercised
	// in isolation. The value is the table the method must name.
	private static readonly IReadOnlyDictionary<string, string?> _PlantedInventory =
		new Dictionary<string, string?>(StringComparer.Ordinal) {
			[PublishingDispatchArchitectureSpec._Key(typeof(PlantedOtherTable), nameof(PlantedOtherTable.Sql))] = "job_queue",
			[PublishingDispatchArchitectureSpec._Key(typeof(PlantedMixedStatements), nameof(PlantedMixedStatements.Claim))] = "job_queue",
			[PublishingDispatchArchitectureSpec._Key(typeof(PlantedGenericHelper), nameof(PlantedGenericHelper.Lock))] = "job_queue",
			[PublishingDispatchArchitectureSpec._Key(typeof(PlantedPublicationsForms), nameof(PlantedPublicationsForms.From))] = "job_queue",
			[PublishingDispatchArchitectureSpec._Key(typeof(PlantedPublicationsForms), nameof(PlantedPublicationsForms.Only))] = "job_queue",
			[PublishingDispatchArchitectureSpec._Key(typeof(PlantedPublicationsForms), nameof(PlantedPublicationsForms.Schema))] = "job_queue",
			[PublishingDispatchArchitectureSpec._Key(typeof(PlantedPublicationsForms), nameof(PlantedPublicationsForms.CommaJoin))] = "job_queue",
			[PublishingDispatchArchitectureSpec._Key(typeof(PlantedPublicationsForms), nameof(PlantedPublicationsForms.Update))] = "job_queue",
			[PublishingDispatchArchitectureSpec._Key(typeof(PlantedPublicationsForms), nameof(PlantedPublicationsForms.Join))] = "job_queue",
			[PublishingDispatchArchitectureSpec._Key(typeof(PlantedPublicationsForms), nameof(PlantedPublicationsForms.Into))] = "job_queue",
		};

	private sealed record SkipLockedScan(
		int TotalHits,
		int SanctionedHits,
		int SanctionedNamingPublications,
		List<string> MissingInventory,
		List<string> Offenders
	);

	private sealed record LiteralSite(
		string Type,
		string Method,
		MethodDefinitionHandle Handle,
		int ILOffset,
		string Text
	);

	// Every opcode by encoded value, so the IL walker can size each instruction.
	private static readonly Dictionary<short, OpCode> _OpCodes = typeof(OpCodes)
		.GetFields(BindingFlags.Public | BindingFlags.Static)
		.Select(field => (OpCode)field.GetValue(null).Required())
		.ToDictionary(opCode => opCode.Value);

	/// <summary>
	/// Method-level closed-inventory scan over the COMPILED API assembly (IL
	/// string literals, not source text). The unit is (declaring type,
	/// declared method) of a method whose literals, alone or joined in order,
	/// contain the lock clause. Rules: (1) a holder that is neither the
	/// sanctioned due-scan job nor in the reviewed inventory fails, however
	/// its SQL is assembled; (2) an inventoried holder must name its table as
	/// a literal in the same method, so a helper whose table comes from a
	/// caller can never be inventoried (null table = a prose/data string that
	/// is not SQL); (3) only the due-scan job may name publications — per
	/// method, not per type. Offenders name type.method and file:line.
	/// </summary>
	private static SkipLockedScan _ScanSkipLocked(
		Assembly assembly,
		IReadOnlyDictionary<string, string?> inventory
	) {
		var sites = PublishingDispatchArchitectureSpec._ReadLiteralSites(assembly, out var pdb);
		using var pdbOwner = pdb;
		var pdbReader = pdb?.GetMetadataReader();
		var offenders = new List<string>();
		var total = 0;
		var sanctioned = 0;
		var sanctionedNaming = 0;
		var seen = new HashSet<string>(StringComparer.Ordinal);
		var sanctionedType = typeof(DispatchDuePostsJob).FullName.Required();

		foreach (var methodGroup in sites.GroupBy(site => (site.Type, site.Method))) {
			var methodSites = methodGroup.ToList();
			var joined = string.Concat(methodSites.Select(site => site.Text));
			var hit = methodSites.FirstOrDefault(site =>
				PublishingDispatchArchitectureSpec._SkipLockedRegex().IsMatch(site.Text)
			);
			if (hit is null && PublishingDispatchArchitectureSpec._SkipLockedRegex().IsMatch(joined)) {
				hit = methodSites[0];
			}

			if (hit is null) {
				continue;
			}

			total++;
			var key = $"{methodGroup.Key.Type}.{methodGroup.Key.Method}";
			_ = seen.Add(key);
			var namesPublications = PublishingDispatchArchitectureSpec._PublicationsRef().IsMatch(joined);

			if (string.Equals(methodGroup.Key.Type, sanctionedType, StringComparison.Ordinal)
				|| methodGroup.Key.Type.StartsWith(sanctionedType + "+", StringComparison.Ordinal)) {
				sanctioned++;
				if (namesPublications) {
					sanctionedNaming++;
				}

				continue;
			}

			var why = PublishingDispatchArchitectureSpec._Judge(
				inventory, key, joined, namesPublications
			);
			if (why is not null) {
				offenders.Add(PublishingDispatchArchitectureSpec._Describe(hit, pdbReader, why));
			}
		}

		var missing = inventory.Keys.Where(key => !seen.Contains(key)).ToList();
		return new SkipLockedScan(total, sanctioned, sanctionedNaming, missing, offenders);
	}

	private static string? _Judge(
		IReadOnlyDictionary<string, string?> inventory,
		string key,
		string joined,
		bool namesPublications
	) {
		if (!inventory.TryGetValue(key, out var table)) {
			return "holds SKIP LOCKED but is not in the reviewed inventory";
		}

		if (namesPublications) {
			return "inventoried SKIP LOCKED holder names the publications table";
		}

		if (table is not null && !PublishingDispatchArchitectureSpec._NamesTable(joined, table)) {
			return $"inventoried SKIP LOCKED holder does not name its table '{table}' "
				+ "as a literal in the same method (table-parameter helpers cannot be inventoried)";
		}

		return null;
	}

	private static bool _NamesTable(string sql, string table) {
		return new Regex(
			$@"\b(from|update|join|into|only)\s+\S*\b{Regex.Escape(table)}\b",
			RegexOptions.IgnoreCase
		).IsMatch(sql);
	}

	private static string _Describe(LiteralSite site, MetadataReader? pdb, string why) {
		var location = PublishingDispatchArchitectureSpec._Location(pdb, site.Handle, site.ILOffset);
		return $"{site.Type}.{site.Method} {location}: {why}: "
			+ PublishingDispatchArchitectureSpec._Flatten(site.Text);
	}


	// Reads every string literal of every method body with its IL offset.
	// Compiler-generated nested types (async state machines, closures) are
	// folded into the type that declared them, and their methods are named by
	// the declared method (<ClaimAsync>d__3.MoveNext -> ClaimAsync).
	private static List<LiteralSite> _ReadLiteralSites(
		Assembly assembly,
		out MetadataReaderProvider? pdb
	) {
		var sites = new List<LiteralSite>();
		using var stream = File.OpenRead(assembly.Location);
		using var peReader = new PEReader(stream);
		var reader = peReader.GetMetadataReader();
		pdb = peReader.TryOpenAssociatedPortablePdb(
			assembly.Location,
			path => File.OpenRead(path),
			out var provider,
			out _
		)
			? provider
			: null;

		foreach (var typeHandle in reader.TypeDefinitions) {
			var type = reader.GetTypeDefinition(typeHandle);
			var typeName = PublishingDispatchArchitectureSpec._DeclaringTypeName(reader, type);
			// The OpenAPI source generator embeds the XML doc comments as
			// string data; prose is not SQL.
			if (typeName.StartsWith(
				"Microsoft.AspNetCore.OpenApi.Generated",
				StringComparison.Ordinal
			)) {
				continue;
			}

			foreach (var methodHandle in type.GetMethods()) {
				var method = reader.GetMethodDefinition(methodHandle);
				if (method.RelativeVirtualAddress == 0) {
					continue;
				}

				var il = peReader.GetMethodBody(method.RelativeVirtualAddress)
					.GetILBytes().Required();
				var rawType = reader.GetString(type.Name);
				var methodName = PublishingDispatchArchitectureSpec._DeclaredMethodName(
					rawType, reader.GetString(method.Name)
				);
				foreach (var (offset, text) in
					PublishingDispatchArchitectureSpec._StringLiterals(reader, il)) {
					sites.Add(new LiteralSite(typeName, methodName, methodHandle, offset, text));
				}
			}
		}

		return sites;
	}

	// Full name of the nearest enclosing type that is not compiler-generated.
	private static string _DeclaringTypeName(MetadataReader reader, TypeDefinition type) {
		var chain = new List<string>();
		var current = type;
		while (true) {
			var name = reader.GetString(current.Name);
			if (!name.StartsWith('<')) {
				chain.Insert(0, name);
			}

			var parent = current.GetDeclaringType();
			if (parent.IsNil) {
				break;
			}

			current = reader.GetTypeDefinition(parent);
		}

		var ns = reader.GetString(current.Namespace);
		var joined = string.Join('+', chain);
		return ns.Length == 0 ? joined : $"{ns}.{joined}";
	}

	private static string _DeclaredMethodName(string typeName, string methodName) {
		var name = methodName == "MoveNext" && typeName.StartsWith('<') ? typeName : methodName;
		if (name.StartsWith('<')) {
			var end = name.IndexOf('>');
			return end > 1 ? name[1..end] : name;
		}

		return name;
	}

	private static string _Location(MetadataReader? pdb, MethodDefinitionHandle method, int ilOffset) {
		if (pdb is null) {
			return "(no portable PDB: file:line unavailable)";
		}

		var points = pdb.GetMethodDebugInformation(method.ToDebugInformationHandle())
			.GetSequencePoints()
			.Where(point => !point.IsHidden && point.Offset <= ilOffset)
			.ToList();
		if (points.Count == 0) {
			return "(no sequence point)";
		}

		var point = points[^1];
		var blob = pdb.GetBlobReader(pdb.GetDocument(point.Document).Name);
		var separator = (char)blob.ReadByte();
		var path = new System.Text.StringBuilder();
		var first = true;
		while (blob.RemainingBytes > 0) {
			var handle = MetadataTokens.BlobHandle(blob.ReadCompressedInteger());
			if (!first) {
				_ = path.Append(separator);
			}

			first = false;
			if (!handle.IsNil) {
				var part = pdb.GetBlobReader(handle);
				_ = path.Append(part.ReadUTF8(part.Length));
			}
		}

		var full = path.ToString().Replace('\\', '/');
		var cut = full.IndexOf("apps/api/", StringComparison.Ordinal);
		return $"{(cut >= 0 ? full[(cut + "apps/api/".Length)..] : full)}:{point.StartLine}";
	}

	private static int _OperandSize(OperandType type, byte[] il, int position) {
		if (type == OperandType.InlineNone) {
			return 0;
		}

		if (type is OperandType.ShortInlineBrTarget or OperandType.ShortInlineI
			or OperandType.ShortInlineVar) {
			return 1;
		}

		if (type == OperandType.InlineVar) {
			return 2;
		}

		if (type is OperandType.InlineI8 or OperandType.InlineR) {
			return 8;
		}

		if (type == OperandType.InlineSwitch) {
			// a count then that many 4-byte branch targets
			return 4 + (4 * BitConverter.ToInt32(il, position));
		}

		if (type is OperandType.InlineBrTarget or OperandType.InlineField
			or OperandType.InlineI or OperandType.InlineMethod
			or OperandType.InlineSig or OperandType.InlineString
			or OperandType.InlineTok or OperandType.InlineType
			or OperandType.ShortInlineR) {
			return 4;
		}

		throw new NotSupportedException(
			$"Unsupported IL operand type {type}; extend the decoder instead of guessing"
		);
	}

	private static List<(int Offset, string Text)> _StringLiterals(MetadataReader reader, byte[] il) {
		var literals = new List<(int, string)>();
		var position = 0;
		while (position < il.Length) {
			var start = position;
			var code = il[position++];
			var value = code == 0xFE ? (short)(0xFE00 | il[position++]) : code;
			var opCode = PublishingDispatchArchitectureSpec._OpCodes[value];

			if (opCode == OpCodes.Ldstr) {
				var token = BitConverter.ToInt32(il, position);
				literals.Add((start, reader.GetUserString(
					MetadataTokens.UserStringHandle(token & 0x00FFFFFF)
				)));
			}

			position += PublishingDispatchArchitectureSpec._OperandSize(
				opCode.OperandType,
				il,
				position
			);
		}

		return literals;
	}


	private static string _Flatten(string snippet) {
		var flattened = PublishingDispatchArchitectureSpec._WhitespaceRun().Replace(snippet, " ").Trim();
		return flattened.Length <= 140 ? flattened : flattened[..140] + "…";
	}

	[GeneratedRegex(@"\bSKIP\s+LOCKED\b", RegexOptions.IgnoreCase)]
	private static partial Regex _SkipLockedRegex();

	// FROM/UPDATE/JOIN/INTO/ONLY, then any comma-joined tables, then an optional
	// (possibly interpolated) schema, then publications.
	[GeneratedRegex(
		@"\b(from|update|join|into|only)\s+(?:[^\s,;]+(?:\s+(?:as\s+)?\w+)?\s*,\s*)*\S*publications\b",
		RegexOptions.IgnoreCase
	)]
	private static partial Regex _PublicationsRef();

	[GeneratedRegex(@"\s+")]
	private static partial Regex _WhitespaceRun();

	/// <summary>
	/// Minimal <see cref="WebApplicationFactory{TEntryPoint}"/> variant that
	/// replaces the EF Core <see cref="DbContext"/> with an unreachable stub so
	/// no real Postgres instance is required (same harness as
	/// EndpointPermissionMetadataGuardSpec).
	/// </summary>
	private sealed class RouteMapFactory : WebApplicationFactory<Program> {
		protected override void ConfigureWebHost(IWebHostBuilder builder) {
			builder.UseEnvironment(EnvironmentNames.Testing);

			builder.ConfigureServices(services => {
				services.RemoveAll<DbContextOptions<AppDbContext>>();
				services.RemoveAll<AppDbContext>();
				services.AddDbContext<AppDbContext>(options =>
					options.UseNpgsql(
						"Host=architecture-guard-stub;Database=stub;Username=stub;Password=stub"
					)
				);

				services.RemoveAll<Infrastructure.Messaging.Email.IEmailSender>();
				services.AddSingleton<FakeEmailSender>();
				services.AddSingleton<Infrastructure.Messaging.Email.IEmailSender>(
					sp => sp.GetRequiredService<FakeEmailSender>()
				);

				ApiFactory.RemoveWorkerHostedServices(services);
			});
		}
	}
}
