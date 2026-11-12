using System.Reflection;
using System.Reflection.Emit;
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
using System.Reflection.PortableExecutable;
using System.Runtime.CompilerServices;
using System.Text;
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
/// COMPILED API assembly (not source text), cuts each method into SQL
/// statements, and for every SKIP LOCKED extracts the table THAT statement locks
/// (FOR UPDATE OF target, else the tables of its innermost select). It fails
/// when the table cannot be extracted (a table-parameter helper, a clause in
/// another method or class: no opt-out), when a statement outside the job locks
/// publications, when a statement of the job locks anything but publications,
/// and when (type, method, full signature, locked table) is not in the reviewed
/// inventory. Reading or updating publications in a statement that locks another
/// table is correct and passes. Non-SQL strings that mention the clause are
/// cleared only by an exact content hash. Failures name type.method and file:line
/// (portable PDB). Not reusing ArchitectureDiscovery: it excludes the Migrations
/// namespace, where SQL lives. Maintenance cost: ~150 lines of IL decoding and
/// SQL reading plus one inventory line per reviewed lock. Retire when the claim
/// sits behind one repository seam or Postgres-side enforcement.</item>
/// </list>
/// Documented residual gaps (static scan of one assembly): only the API
/// assembly is scanned; SQL built at runtime (reflection, a table or clause fed
/// from config/data), stored functions or views that lock internally, a clause
/// split into fragments that spell SKIP LOCKED nowhere, and a comment between
/// SKIP and LOCKED are invisible. A statement whose locked table is not
/// resolvable by this reader fails loudly rather than passing. A caller that
/// passes "publications" to a table-parameter helper is not itself a holder: it
/// is covered only because the helper's statement can never be cleared. An
/// executed check (command interceptor) would only cover paths a test runs, so it
/// is not used. The nested-sanctioned branch cannot be fixtured (the job is
/// sealed).
/// Proven RED by the planted fixtures of this spec (each capability fails
/// without its rule) and by stripping permission metadata from a publishing
/// endpoint.
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

	// Reviewed closed inventory of every locking statement in the API assembly
	// besides the sanctioned due-scan job, keyed by "declaring type.method(full
	// parameter types)|locked table". The table is the one the statement itself
	// locks (extracted from its SQL), never publications.
	private static readonly IReadOnlySet<string> _SkipLockedInventory = new HashSet<string>(
		[
			"PublyApp.Api.Modules.Uploads.Jobs.UploadOrphanReclaimerHandler._ReclaimBatchAsync(System.Threading.CancellationToken)|upload_assets",
			"PublyApp.Api.Modules.Messaging.Jobs.EmailLogRetentionHandler.HandleAsync(PublyApp.Api.Infrastructure.Jobs.JobContext,System.Threading.CancellationToken)|email_log",
			"PublyApp.Api.Modules.Messaging.Jobs.EmailPreparedSendsRetentionHandler.HandleAsync(PublyApp.Api.Infrastructure.Jobs.JobContext,System.Threading.CancellationToken)|email_prepared_sends",
			"PublyApp.Api.Modules.Jobs.Jobs.DeadLetterRetentionHandler.HandleAsync(PublyApp.Api.Infrastructure.Jobs.JobContext,System.Threading.CancellationToken)|job_dead_letter",
			"PublyApp.Api.Modules.Jobs.Jobs.SystemJobOccurrenceRetentionHandler.HandleAsync(PublyApp.Api.Infrastructure.Jobs.JobContext,System.Threading.CancellationToken)|system_job_occurrences",
			"PublyApp.Api.Modules.Auth.Jobs.CleanupExpiredSessionsHandler.HandleAsync(PublyApp.Api.Infrastructure.Jobs.JobContext,System.Threading.CancellationToken)|sessions",
			"PublyApp.Api.Infrastructure.Messaging.Email.InvitationEmailOutboxDispatcher.ClaimBatchAsync(PublyApp.Api.Data.DbContext.AppDbContext,System.Threading.CancellationToken)|invitation_email_outbox",
			"PublyApp.Api.Infrastructure.Jobs.JobQueueProcessor.ClaimBatchAsync(PublyApp.Api.Data.DbContext.AppDbContext,System.String,System.Int32,System.Int32,System.Threading.CancellationToken)|job_queue",
		],
		StringComparer.Ordinal
	);

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
	public void ItShouldRejectUnreviewedLockingStatementsWhenScanningTheApiAssembly() {
		var scan = PublishingDispatchArchitectureSpec._ScanSkipLocked(
			typeof(Program).Assembly,
			PublishingDispatchArchitectureSpec._SkipLockedInventory,
			PublishingDispatchArchitectureSpec._KnownNonSqlStrings,
			typeof(DispatchDuePostsJob).FullName.Required()
		);

		_ = scan.TotalClauses.Should().BeGreaterThanOrEqualTo(
			PublishingDispatchArchitectureSpec._SkipLockedInventory.Count + 1,
			"the sanctioned due-scan claim and every inventoried statement must be "
				+ "visible; a lower count means the compiled-literal scan collapsed "
				+ "and failed open"
		);

		_ = scan.SanctionedLockingPublications.Should().BeGreaterThanOrEqualTo(
			1,
			"{0} must still be seen LOCKING publications (its statement's locked "
				+ "table, not a mere mention); if it moved or changed shape, "
				+ "reconcile this guard",
			typeof(DispatchDuePostsJob).FullName
		);

		_ = scan.MissingInventory.Should().BeEmpty(
			"every inventoried statement must still be seen; a stale entry hides a "
				+ "collapsed scan"
		);

		scan.Offenders.Should().BeEmpty(
			"SKIP LOCKED is closed over a statement-level inventory: only {0} may "
				+ "lock publications; any other locking statement must lock one "
				+ "literal table and be added to _SkipLockedInventory after review. "
				+ "Found {1} offender(s):\n{2}",
			typeof(DispatchDuePostsJob).FullName,
			scan.Offenders.Count,
			string.Join("\n", scan.Offenders.Take(20))
		);
	}

	private static SkipLockedScan _ScanPlanted(string sanctionedType) {
		return PublishingDispatchArchitectureSpec._ScanSkipLocked(
			typeof(PublishingDispatchArchitectureSpec).Assembly,
			PublishingDispatchArchitectureSpec._PlantedInventory,
			PublishingDispatchArchitectureSpec._PlantedNonSql,
			sanctionedType
		);
	}

	private static void _AssertOffender(List<string> offenders, string where, string why) {
		_ = offenders.Should().Contain(
			o => o.Contains(where) && o.Contains(why),
			"'{0}' must be reported with '{1}'; offenders were:\n{2}",
			where,
			why,
			string.Join("\n", offenders)
		);
	}

	private static void _AssertClean(List<string> offenders, string where) {
		_ = offenders.Should().NotContain(
			o => o.Contains(where),
			"'{0}' is correct code and must not be reported; offenders were:\n{1}",
			where,
			string.Join("\n", offenders)
		);
	}

	// Non-vacuity, one assertion per claimed capability. Each fixture is red
	// (missing from the offenders, or wrongly reported) if its rule is removed.
	[Fact]
	public void ItShouldReportEveryPlantedClaimantShapeWhenScanningCompiledCode() {
		var scan = PublishingDispatchArchitectureSpec._ScanPlanted("none");
		var offenders = scan.Offenders;

		// Unknown or publications-locking holders, however the SQL is assembled.
		foreach (var shape in new[] {
			"PlantedClaimants.Concatenated ", // compiler-folded concatenation
			"PlantedClaimants.SplitAroundValue ", // fragments joined per statement
			"PlantedClaimants.Interpolated ", // FormattableString
			"PlantedClaimants.LowerCase ", // case-insensitive
			"PlantedClaimants.NewlineBetween ", // whitespace between the words
			"PlantedAsync.ClaimAsync ", // async method, declared name
		}) {
			PublishingDispatchArchitectureSpec._AssertOffender(offenders, shape, "publications");
		}

		// Clause in another method / class than its query: no table to extract.
		PublishingDispatchArchitectureSpec._AssertOffender(offenders, "PlantedCrossMethod._Tail ", "cannot determine");
		PublishingDispatchArchitectureSpec._AssertOffender(offenders, "PlantedLockClause.Tail ", "cannot determine");
		// Table from a parameter: never clearable, no opt-out.
		PublishingDispatchArchitectureSpec._AssertOffender(offenders, "PlantedGenericHelper.Lock ", "cannot determine");
		// Prose is data only when its exact hash is allowlisted.
		PublishingDispatchArchitectureSpec._AssertOffender(offenders, "PlantedProse.Unlisted ", "cannot determine");
		PublishingDispatchArchitectureSpec._AssertClean(offenders, "PlantedProse.Allowed ");

		// Two claims in one method: the reviewed one does not clear the other.
		PublishingDispatchArchitectureSpec._AssertOffender(offenders, "PlantedTwoClaims.Both ", "cannot determine");
		_ = scan.MissingInventory.Should().NotContain(
			k => k.Contains("PlantedTwoClaims"),
			"the reviewed statement of the method must still be seen"
		);

		// Overloads are different methods: only the reviewed signature is cleared.
		PublishingDispatchArchitectureSpec._AssertOffender(
			offenders, "PlantedOverload.Claim ", "PlantedOverload.Claim(System.Int32)|job_queue");
		_ = scan.MissingInventory.Should().NotContain(
			k => k.Contains("PlantedOverload.Claim()|job_queue"),
			"the reviewed overload must still be seen"
		);

		// Every SQL form that LOCKS publications is understood.
		foreach (var form in new[] {
			"From", "Only", "Schema", "OfAlias", "JoinWithoutOf", "UpdateSubquery", "Into",
		}) {
			PublishingDispatchArchitectureSpec._AssertOffender(
				offenders, $"PlantedLocksPublications.{form} ", "locks the publications table");
		}

		// Correct code stays green: naming or reading publications while locking
		// another table, in the same method or statement.
		PublishingDispatchArchitectureSpec._AssertClean(offenders, "PlantedReadThenOtherLock.");
		PublishingDispatchArchitectureSpec._AssertClean(offenders, "PlantedNamesButDoesNotLock.");
		PublishingDispatchArchitectureSpec._AssertClean(offenders, "PlantedOtherTable.");

		var all = string.Join("\n", offenders);
		_ = all.Should().NotContain("MoveNext");
		var async = offenders.Single(o => o.Contains("PlantedAsync.ClaimAsync "));
		if (!async.Contains("no portable PDB")) {
			_ = async.Should().Contain("PublishingDispatchArchitecture.Spec.cs:");
		}
	}

	// The sanctioned job's statement must LOCK publications, not merely name it.
	[Fact]
	public void ItShouldRequireTheSanctionedStatementToLockPublicationsNotMerelyNameIt() {
		var locking = PublishingDispatchArchitectureSpec._ScanPlanted(
			typeof(PlantedSanctionedLocksPublications).FullName.Required()
		);
		PublishingDispatchArchitectureSpec._AssertClean(locking.Offenders, "PlantedSanctionedLocksPublications.");
		_ = locking.SanctionedLockingPublications.Should().Be(1);

		var mentioning = PublishingDispatchArchitectureSpec._ScanPlanted(
			typeof(PlantedSanctionedOnlyMentions).FullName.Required()
		);
		PublishingDispatchArchitectureSpec._AssertOffender(
			mentioning.Offenders,
			"PlantedSanctionedOnlyMentions.Claim ",
			"instead of exactly publications"
		);
		_ = mentioning.SanctionedLockingPublications.Should().Be(0);
	}

	// Decoder guard: switch (variable-size operand), ldc.i8 and adjacent ldstr
	// must not desynchronise the IL walk before the SKIP LOCKED literal.
	[Fact]
	public void ItShouldDecodeLiteralsAfterSwitchWithWideConstants() {
		PublishingDispatchArchitectureSpec._AssertOffender(
			PublishingDispatchArchitectureSpec._ScanPlanted("none").Offenders,
			"PlantedDecoder.AfterSwitch ",
			"cannot determine"
		);
	}

	[Fact]
	public void ItShouldSizeEveryKnownOperandTypeExactlyAndRejectUnknownOnes() {
		var il = new byte[16];
		var expected = new Dictionary<OperandType, int> {
			[OperandType.InlineNone] = 0,
			[OperandType.ShortInlineBrTarget] = 1,
			[OperandType.ShortInlineI] = 1,
			[OperandType.ShortInlineVar] = 1,
			[OperandType.InlineVar] = 2,
			[OperandType.InlineI8] = 8,
			[OperandType.InlineR] = 8,
			[OperandType.InlineSwitch] = 4,
			[OperandType.InlineBrTarget] = 4,
			[OperandType.InlineField] = 4,
			[OperandType.InlineI] = 4,
			[OperandType.InlineMethod] = 4,
			[OperandType.InlineSig] = 4,
			[OperandType.InlineString] = 4,
			[OperandType.InlineTok] = 4,
			[OperandType.InlineType] = 4,
			[OperandType.ShortInlineR] = 4,
		};
		foreach (var (type, size) in expected) {
			_ = PublishingDispatchArchitectureSpec._OperandSize(type, il, 0)
				.Should().Be(size, "operand type {0}", type);
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

	// The table arrives from the caller: the locked table cannot be extracted,
	// so no inventory entry can ever clear this method.
	private static class PlantedGenericHelper {
		public static string Lock(string table) {
			return "SELECT id FROM " + table + " WHERE x = 1 FOR UPDATE SKIP LOCKED";
		}
	}

	private static class PlantedAsync {
		public static async Task<List<Guid>> ClaimAsync(AppDbContext db) {
			return await db.Database
				.SqlQuery<Guid>($"SELECT id AS \"Value\" FROM publications FOR UPDATE SKIP LOCKED")
				.ToListAsync();
		}
	}

	// Two claims in ONE method: the first is a reviewed job_queue claim, the
	// second takes its table from a variable. The reviewed statement must not
	// clear the second.
	private static class PlantedTwoClaims {
		public static string Both(string table) {
			var reviewed = "SELECT id FROM job_queue FOR UPDATE SKIP LOCKED";
			var rogue = "SELECT id FROM " + table + " WHERE status = 0 FOR UPDATE SKIP LOCKED";
			return reviewed + rogue;
		}
	}

	// An overload shares the name but not the signature: only the first is
	// reviewed.
	private static class PlantedOverload {
		public static string Claim() {
			return "SELECT id FROM job_queue FOR UPDATE SKIP LOCKED";
		}

		public static string Claim(int limit) {
			return "SELECT id FROM job_queue LIMIT " + limit + " FOR UPDATE SKIP LOCKED";
		}
	}

	// Reading publications and locking another table in the SAME method is
	// correct code and must be green once the lock is reviewed.
	private static class PlantedReadThenOtherLock {
		public static string Both(Guid id) {
			var read = $"SELECT id FROM publications WHERE id = {id}";
			var claim = "SELECT id FROM job_queue FOR UPDATE SKIP LOCKED";
			return read + claim;
		}
	}

	// Publications is named but not locked (FOR UPDATE OF targets the other
	// alias, or the lock is in a subquery over job_queue): green once reviewed.
	private static class PlantedNamesButDoesNotLock {
		public static string OfAlias() {
			return "SELECT j.id FROM job_queue j, publications p FOR UPDATE OF j SKIP LOCKED";
		}

		public static string UpdateTarget() {
			return "UPDATE publications SET x = 1 WHERE id IN "
				+ "(SELECT id FROM job_queue FOR UPDATE SKIP LOCKED)";
		}

		public static string JoinOf() {
			return "SELECT j.id FROM job_queue j JOIN publications p ON p.id = j.id "
				+ "FOR UPDATE OF j SKIP LOCKED";
		}
	}

	// Every one of these LOCKS publications: each SQL form must be understood.
	private static class PlantedLocksPublications {
		public static string From() {
			return "SELECT id FROM publications p, job_queue FOR UPDATE SKIP LOCKED";
		}

		public static string Only() {
			return "SELECT id FROM job_queue, ONLY publications FOR UPDATE SKIP LOCKED";
		}

		public static FormattableString Schema(string schema) {
			return $"SELECT id FROM {schema}.publications, job_queue FOR UPDATE SKIP LOCKED";
		}

		public static string OfAlias() {
			return "SELECT p.id FROM publications p, job_queue j FOR UPDATE OF p SKIP LOCKED";
		}

		public static string JoinWithoutOf() {
			return "SELECT j.id FROM job_queue j JOIN publications p ON p.id = j.id "
				+ "FOR UPDATE SKIP LOCKED";
		}

		public static string UpdateSubquery() {
			return "UPDATE publications SET x = 1 WHERE id IN "
				+ "(SELECT id FROM publications FOR UPDATE SKIP LOCKED)";
		}

		public static string Into() {
			return "INSERT INTO job_queue SELECT id FROM publications FOR UPDATE SKIP LOCKED";
		}
	}

	private static class PlantedOtherTable {
		public static string Sql() {
			return "SELECT id FROM job_queue FOR UPDATE SKIP LOCKED";
		}
	}

	// Stands in for the sanctioned job in the fixture scan.
	private static class PlantedSanctionedLocksPublications {
		public static string Claim() {
			return "SELECT id FROM publications FOR UPDATE SKIP LOCKED";
		}
	}

	private static class PlantedSanctionedOnlyMentions {
		public static string Claim() {
			return "SELECT j.id FROM job_queue j, publications p FOR UPDATE OF j SKIP LOCKED";
		}
	}

	// Prose that mentions the clause: only an exact, hashed allowlist entry is
	// treated as data.
	private const string _PlantedAllowedProse = "Claims rows politely (SKIP LOCKED, keyed).";

	private static class PlantedProse {
		public static string Allowed() {
			return PublishingDispatchArchitectureSpec._PlantedAllowedProse;
		}

		public static string Unlisted() {
			return "Another description that says SKIP LOCKED somewhere.";
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

	// "Type.Method(param types)|locked table", exactly as the scan reports it.
	private static string _Key(Type type, string method, Type[] parameters, string table) {
		var signature = string.Join(",", parameters.Select(p => p.FullName ?? p.Name));
		return $"{type.FullName}.{method}({signature})|{table}";
	}

	// Reviewed holders for the fixture scan. A statement is cleared only by an
	// entry for its exact (type, method, signature, locked table).
	private static readonly IReadOnlySet<string> _PlantedInventory = new HashSet<string>(
		[
			PublishingDispatchArchitectureSpec._Key(typeof(PlantedOtherTable), nameof(PlantedOtherTable.Sql), [], "job_queue"),
			PublishingDispatchArchitectureSpec._Key(typeof(PlantedTwoClaims), nameof(PlantedTwoClaims.Both), [typeof(string)], "job_queue"),
			PublishingDispatchArchitectureSpec._Key(typeof(PlantedOverload), nameof(PlantedOverload.Claim), [], "job_queue"),
			PublishingDispatchArchitectureSpec._Key(typeof(PlantedReadThenOtherLock), nameof(PlantedReadThenOtherLock.Both), [typeof(Guid)], "job_queue"),
			PublishingDispatchArchitectureSpec._Key(typeof(PlantedNamesButDoesNotLock), nameof(PlantedNamesButDoesNotLock.OfAlias), [], "job_queue"),
			PublishingDispatchArchitectureSpec._Key(typeof(PlantedNamesButDoesNotLock), nameof(PlantedNamesButDoesNotLock.UpdateTarget), [], "job_queue"),
			PublishingDispatchArchitectureSpec._Key(typeof(PlantedNamesButDoesNotLock), nameof(PlantedNamesButDoesNotLock.JoinOf), [], "job_queue"),
		],
		StringComparer.Ordinal
	);

	private static readonly IReadOnlySet<string> _PlantedNonSql = new HashSet<string>(
		[PublishingDispatchArchitectureSpec._Hash(PublishingDispatchArchitectureSpec._PlantedAllowedProse)],
		StringComparer.Ordinal
	);

	// Known non-SQL strings that mention the clause, by SHA-256 prefix of the
	// exact literal (so a copy edit is reviewed instead of silently allowed).
	private static readonly IReadOnlySet<string> _KnownNonSqlStrings = new HashSet<string>(
		[
			// SystemJobDefinitionSeeder job description (display text, not SQL).
			"F87DC41B8A6E8903",
		],
		StringComparer.Ordinal
	);

	private static string _Hash(string text) {
		return Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
			System.Text.Encoding.UTF8.GetBytes(text)
		))[..16];
	}

	private sealed record SkipLockedScan(
		int TotalClauses,
		int SanctionedLockingPublications,
		List<string> MissingInventory,
		List<string> Offenders
	);

	private sealed record LiteralSite(
		string Type,
		string Method,
		string Signature,
		MethodDefinitionHandle Handle,
		int ILOffset,
		string Text
	);

	// One SQL statement of a method: consecutive literals, cut where a literal
	// starts a new statement (SELECT/UPDATE/DELETE/WITH/INSERT) or at ';'.
	private sealed class Statement {
		public StringBuilder Text { get; } = new();
		public List<(int Start, LiteralSite Site)> Parts { get; } = [];
	}

	// Every opcode by encoded value, so the IL walker can size each instruction.
	private static readonly Dictionary<short, OpCode> _OpCodes = typeof(OpCodes)
		.GetFields(BindingFlags.Public | BindingFlags.Static)
		.Select(field => (OpCode)field.GetValue(null).Required())
		.ToDictionary(opCode => opCode.Value);

	/// <summary>
	/// Statement-level closed-inventory scan over the COMPILED API assembly (IL
	/// string literals, not source text). Each method's literals are cut into
	/// SQL statements; for every <c>SKIP LOCKED</c> in a statement the guard
	/// extracts the table THAT statement locks (the <c>FOR UPDATE OF</c> alias
	/// target, otherwise every table of the innermost select). It fails when the
	/// table cannot be extracted (a table-parameter helper — no opt-out), when
	/// the statement locks publications outside the sanctioned job, and when
	/// (type, method, full signature, locked table) is not in the reviewed
	/// inventory. Inside the sanctioned job every locking statement must lock
	/// publications. Reading or updating publications in a statement that locks
	/// another table is fine. Non-SQL strings that merely mention the clause are
	/// cleared only by an exact content hash. Offenders name type.method and
	/// file:line.
	/// </summary>
	private static SkipLockedScan _ScanSkipLocked(
		Assembly assembly,
		IReadOnlySet<string> inventory,
		IReadOnlySet<string> nonSql,
		string sanctionedType
	) {
		var sites = PublishingDispatchArchitectureSpec._ReadLiteralSites(assembly, out var pdb);
		using var pdbOwner = pdb;
		var pdbReader = pdb?.GetMetadataReader();
		var offenders = new List<string>();
		var total = 0;
		var sanctionedLocking = 0;
		var seen = new HashSet<string>(StringComparer.Ordinal);

		foreach (var methodGroup in sites.GroupBy(site => (site.Type, site.Signature))) {
			var isSanctioned = string.Equals(methodGroup.Key.Type, sanctionedType, StringComparison.Ordinal)
				|| methodGroup.Key.Type.StartsWith(sanctionedType + "+", StringComparison.Ordinal);

			foreach (var statement in PublishingDispatchArchitectureSpec._Statements(methodGroup.ToList())) {
				var text = statement.Text.ToString();
				foreach (Match clause in PublishingDispatchArchitectureSpec._SkipLockedRegex().Matches(text)) {
					var part = statement.Parts.Last(p => p.Start <= clause.Index);
					if (clause.Index + clause.Length <= part.Start + part.Site.Text.Length
						&& nonSql.Contains(PublishingDispatchArchitectureSpec._Hash(part.Site.Text))) {
						continue;
					}

					total++;
					var where = PublishingDispatchArchitectureSpec._Describe(part.Site, pdbReader);
					var locked = PublishingDispatchArchitectureSpec._LockedTables(text[..clause.Index]);

					if (locked is null) {
						offenders.Add($"{where}: cannot determine the table locked by this statement "
							+ "(table-parameter helper? build the SQL with a literal table name; "
							+ $"if this literal is data, allowlist its hash {PublishingDispatchArchitectureSpec._Hash(part.Site.Text)})");
						continue;
					}

					var lockedPublications = locked.Contains("publications", StringComparer.OrdinalIgnoreCase);
					if (isSanctioned) {
						if (lockedPublications && locked.Count == 1) {
							sanctionedLocking++;
						} else {
							offenders.Add($"{where}: a statement of the sanctioned due-scan job locks "
								+ $"[{string.Join(", ", locked)}] instead of exactly publications");
						}

						continue;
					}

					if (lockedPublications) {
						offenders.Add($"{where}: locks the publications table with SKIP LOCKED "
							+ $"outside the sanctioned job [{string.Join(", ", locked)}]");
						continue;
					}

					if (locked.Count != 1) {
						offenders.Add($"{where}: locks several tables [{string.Join(", ", locked)}]; "
							+ "lock one table per statement");
						continue;
					}

					var key = $"{methodGroup.Key.Type}.{methodGroup.Key.Signature}|{locked[0]}";
					_ = seen.Add(key);
					if (!inventory.Contains(key)) {
						offenders.Add($"{where}: not in the reviewed inventory; add \"{key}\"");
					}
				}
			}
		}

		var missing = inventory.Where(key => !seen.Contains(key)).ToList();
		return new SkipLockedScan(total, sanctionedLocking, missing, offenders);
	}

	private static List<Statement> _Statements(List<LiteralSite> sites) {
		var statements = new List<Statement>();
		var current = new Statement();
		foreach (var site in sites) {
			var chunks = site.Text.Split(';');
			for (var i = 0; i < chunks.Length; i++) {
				var chunk = chunks[i];
				if (PublishingDispatchArchitectureSpec._StatementStart().IsMatch(chunk)
					&& current.Text.Length > 0) {
					statements.Add(current);
					current = new Statement();
				}

				current.Parts.Add((current.Text.Length, site));
				_ = current.Text.Append(chunk);
				if (i < chunks.Length - 1) {
					statements.Add(current);
					current = new Statement();
				}
			}
		}

		if (current.Text.Length > 0) {
			statements.Add(current);
		}

		return statements;
	}

	// Words that cannot be a table name or an alias.
	private static readonly HashSet<string> _SqlWords = new(StringComparer.OrdinalIgnoreCase) {
		"where", "set", "select", "as", "on", "order", "group", "limit", "values", "for",
		"using", "returning", "left", "right", "inner", "outer", "cross", "full", "natural",
		"lateral", "join", "from", "update", "into", "only", "having", "union", "offset",
		"fetch", "window", "and", "or", "not", "nowait", "skip", "with", "delete", "insert",
	};

	// The tables locked by the clause that follows `prefix`, or null when they
	// cannot be extracted.
	private static List<string>? _LockedTables(string prefix) {
		var forClause = PublishingDispatchArchitectureSpec._ForClause().Match(prefix);
		if (!forClause.Success) {
			return null;
		}

		if (forClause.Groups["al"].Success) {
			var refs = PublishingDispatchArchitectureSpec._TableRefs(prefix);
			if (refs is null) {
				return null;
			}

			var tables = new List<string>();
			foreach (var alias in forClause.Groups["al"].Value.Split(',', StringSplitOptions.TrimEntries)) {
				var target = refs.FirstOrDefault(r =>
					string.Equals(r.Alias, alias.Trim('"'), StringComparison.OrdinalIgnoreCase)
					|| string.Equals(r.Table, alias.Trim('"'), StringComparison.OrdinalIgnoreCase));
				if (target is null) {
					return null;
				}

				tables.Add(target.Table);
			}

			return tables;
		}

		var lastSelect = prefix.LastIndexOf("select", StringComparison.OrdinalIgnoreCase);
		var segment = lastSelect >= 0 ? prefix[lastSelect..] : prefix;
		var segmentRefs = PublishingDispatchArchitectureSpec._TableRefs(segment);
		return segmentRefs is null || segmentRefs.Count == 0
			? null
			: segmentRefs.Select(r => r.Table).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
	}

	private sealed record TableRef(string Table, string? Alias);

	// Every FROM/JOIN table reference (comma lists, ONLY, schema
	// prefixes and aliases included); null when any reference is unparseable,
	// which includes a table that is a placeholder or missing.
	private static List<TableRef>? _TableRefs(string sql) {
		var refs = new List<TableRef>();
		foreach (Match keyword in PublishingDispatchArchitectureSpec._TableKeyword().Matches(sql)) {
			var position = keyword.Index + keyword.Length;
			while (true) {
				var table = PublishingDispatchArchitectureSpec._TableToken().Match(sql, position);
				if (!table.Success) {
					return null;
				}

				var name = table.Groups["n"].Value;
				if (PublishingDispatchArchitectureSpec._SqlWords.Contains(name)) {
					return null;
				}

				position = table.Index + table.Length;
				string? alias = null;
				var aliasMatch = PublishingDispatchArchitectureSpec._AliasToken().Match(sql, position);
				if (aliasMatch.Success
					&& !PublishingDispatchArchitectureSpec._SqlWords.Contains(aliasMatch.Groups["a"].Value)) {
					alias = aliasMatch.Groups["a"].Value;
					position = aliasMatch.Index + aliasMatch.Length;
				}

				refs.Add(new TableRef(name, alias));
				var comma = PublishingDispatchArchitectureSpec._Comma().Match(sql, position);
				if (!comma.Success) {
					break;
				}

				position = comma.Index + comma.Length;
			}
		}

		return refs;
	}

	private static string _Describe(LiteralSite site, MetadataReader? pdb) {
		var location = PublishingDispatchArchitectureSpec._Location(pdb, site.Handle, site.ILOffset);
		return $"{site.Type}.{site.Method} {location}";
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
				var signature = PublishingDispatchArchitectureSpec._DeclaredSignature(
					assembly.ManifestModule, MetadataTokens.GetToken(methodHandle), methodName
				);
				foreach (var (offset, text) in
					PublishingDispatchArchitectureSpec._StringLiterals(reader, il)) {
					sites.Add(new LiteralSite(
						typeName, methodName, signature, methodHandle, offset, text
					));
				}
			}
		}

		return sites;
	}

	private static string _Signature(MethodBase method) {
		var parameters = string.Join(
			",",
			method.GetParameters().Select(p => p.ParameterType.FullName ?? p.ParameterType.Name)
		);
		return $"{method.Name}({parameters})";
	}

	// The signature of the method the author declared: for a state machine the
	// async/iterator method that owns it; for a lambda or closure the single
	// declared method of that name (several overloads: unresolvable, flagged).
	private static string _DeclaredSignature(Module module, int token, string declaredName) {
		MethodBase method;
		try {
			method = module.ResolveMethod(token).Required();
		} catch (ArgumentException) {
			return $"{declaredName}(?)";
		}

		var owner = method.DeclaringType;
		if (owner is null || !owner.Name.StartsWith('<')) {
			return PublishingDispatchArchitectureSpec._Signature(method);
		}

		var outer = owner;
		while (outer is not null && outer.Name.StartsWith('<')) {
			outer = outer.DeclaringType;
		}

		if (outer is null) {
			return $"{declaredName}(?)";
		}

		const BindingFlags all = BindingFlags.Public | BindingFlags.NonPublic
			| BindingFlags.Static | BindingFlags.Instance | BindingFlags.DeclaredOnly;
		var named = outer.GetMethods(all).Cast<MethodBase>()
			.Concat(outer.GetConstructors(all))
			.Where(m => m.Name == declaredName)
			.ToList();
		var stateMachineOwner = named.FirstOrDefault(m =>
			m.GetCustomAttribute<StateMachineAttribute>()?.StateMachineType == owner);
		if (stateMachineOwner is not null) {
			return PublishingDispatchArchitectureSpec._Signature(stateMachineOwner);
		}

		return named.Count == 1
			? PublishingDispatchArchitectureSpec._Signature(named[0])
			: $"{declaredName}(ambiguous lambda or closure)";
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

	[GeneratedRegex(@"^\s*(select|update|delete|with|insert)\b", RegexOptions.IgnoreCase)]
	private static partial Regex _StatementStart();

	// FOR UPDATE / NO KEY UPDATE / SHARE / KEY SHARE [OF alias, ...] at the end
	// of the text before SKIP LOCKED.
	[GeneratedRegex(
		@"\bfor\s+(?:no\s+key\s+|key\s+)?(?:update|share)(?:\s+of\s+(?<al>""?\w+""?(?:\s*,\s*""?\w+""?)*))?\s*$",
		RegexOptions.IgnoreCase
	)]
	private static partial Regex _ForClause();

	// FROM / JOIN: the table references a lock can apply to.
	[GeneratedRegex(@"\b(?:from|join)\b", RegexOptions.IgnoreCase)]
	private static partial Regex _TableKeyword();

	[GeneratedRegex(@"\G\s*(?:only\s+)?(?:[\w""{}]+\.)?""?(?<n>[A-Za-z_]\w*)""?", RegexOptions.IgnoreCase)]
	private static partial Regex _TableToken();

	[GeneratedRegex(@"\G\s+(?:as\s+)?(?<a>[A-Za-z_]\w*)", RegexOptions.IgnoreCase)]
	private static partial Regex _AliasToken();

	[GeneratedRegex(@"\G\s*,")]
	private static partial Regex _Comma();

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
