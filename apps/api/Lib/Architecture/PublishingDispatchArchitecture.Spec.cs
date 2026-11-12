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
/// DispatchDuePostsConcurrencySpec. The guard is an EXACT inventory over the
/// string literals of the COMPILED API assembly (not source text): each method's
/// literals are cut into statements and every statement whose raw OR
/// comment-stripped text contains <c>SKIP LOCKED</c> (detection never depends
/// on stripping) must be listed as (declaring type, method, full parameter
/// types, SHA-256 of the normalised statement, an entry per occurrence). The
/// identity is the statement from its start through the literal that holds the
/// clause; comments are stripped and whitespace/case folded. Nothing about the
/// SQL is interpreted, so any edit to a reviewed statement, the same text in
/// another method, overload or nested type, a duplicate occurrence, and any
/// unlisted statement fail until a reviewer updates the inventory. A statement
/// in a method that also assembles strings at runtime (string concatenation,
/// interpolation, Format, Join, Replace, Insert, Remove, Create, StringBuilder)
/// is ALWAYS an offender and no inventory entry can clear it, so a
/// table-parameter helper can never be reviewed in (a deny-list of calls made
/// by methods that hold literals; a call inside a literal-less lambda is not
/// seen). A blunt counter, independent of any comment syntax, backs this up:
/// in a method whose literals contain both "skip" and "locked", every "locked"
/// must belong to a detected statement, otherwise the method is an offender no
/// entry can clear (prose that says "locked" there is inventoried like the
/// seeder). The failure prints method, file:line (portable PDB) and the
/// normalised statement. The job's statement is in the same inventory and
/// is additionally pinned in full (<c>_SanctionedDueScanSql</c>). Not reusing
/// ArchitectureDiscovery: it excludes the Migrations namespace, where SQL
/// lives. Maintenance cost: ~150 lines of IL decoding plus one hash per
/// reviewed statement. Retire when the claim sits behind one repository seam or
/// Postgres-side enforcement.</item>
/// </list>
/// Documented residual gaps (static scan of one assembly): only the API
/// assembly is scanned; SQL built at runtime in another method and handed in,
/// stored functions or views that lock internally, and a clause split into
/// fragments that never spell SKIP LOCKED are invisible; a method that merely
/// logs with string interpolation AND holds a lock statement is flagged and must
/// move the logging out. A caller that passes "publications" to a helper is
/// covered only because the helper's statement cannot be cleared. The one
/// non-SQL entry, the seeder's job description, is a prose run: its identity
/// also covers every literal from the run's start (the leading "Delete…"
/// description of the dead-letter job; the dead-letter JobKey and cron that
/// precede it are not covered, the dispatch job's JobKey and cron are) through
/// the clause, so editing any of those needs a reviewer. The guard never decides
/// what a statement locks, a reviewer does. An executed check (command
/// interceptor) would only cover paths a test runs, so it is not used.
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

	private static readonly string _SanctionedKey =
		$"{typeof(DispatchDuePostsJob).FullName}.HandleAsync("
		+ "PublyApp.Api.Infrastructure.Jobs.JobContext,"
		+ "System.Threading.CancellationToken)|"
		+ PublishingDispatchArchitectureSpec._Hash(
			PublishingDispatchArchitectureSpec._SanctionedDueScanSql
		);

	// Reviewed closed inventory of EVERY SKIP LOCKED statement in the API assembly,
	// including the sanctioned due-scan job's and the seeder's description, keyed
	// by "declaring type.method(full parameter types)|SHA-256 prefix of the
	// normalised statement". Adding or changing an entry needs a reviewer.
	private static readonly IReadOnlySet<string> _SkipLockedInventory = new HashSet<string>(
		[
			PublishingDispatchArchitectureSpec._SanctionedKey,
			"PublyApp.Api.Modules.Jobs.Seeders.SystemJobDefinitionSeeder."
				+ "_GetDefinitions()|2B3CD83AB48CC2CE",
			"PublyApp.Api.Modules.Uploads.Jobs.UploadOrphanReclaimerHandler."
				+ "_ReclaimBatchAsync(System.Threading.CancellationToken)|"
				+ "E5C5D2B5AC362B8A",
			"PublyApp.Api.Modules.Uploads.Jobs.UploadOrphanReclaimerHandler."
				+ "_ReclaimBatchAsync(System.Threading.CancellationToken)|"
				+ "AF1D432419123381",
			"PublyApp.Api.Modules.Messaging.Jobs.EmailLogRetentionHandler."
				+ "HandleAsync(PublyApp.Api.Infrastructure.Jobs.JobContext,System."
				+ "Threading.CancellationToken)|A88C03982BF29A56",
			"PublyApp.Api.Modules.Messaging.Jobs."
				+ "EmailPreparedSendsRetentionHandler.HandleAsync(PublyApp.Api."
				+ "Infrastructure.Jobs.JobContext,System.Threading.CancellationToken)|"
				+ "CEDECD613F5AE471",
			"PublyApp.Api.Modules.Jobs.Jobs.DeadLetterRetentionHandler.HandleAsync("
				+ "PublyApp.Api.Infrastructure.Jobs.JobContext,System.Threading."
				+ "CancellationToken)|0C77FF9D7F1B1A92",
			"PublyApp.Api.Modules.Jobs.Jobs.SystemJobOccurrenceRetentionHandler."
				+ "HandleAsync(PublyApp.Api.Infrastructure.Jobs.JobContext,System."
				+ "Threading.CancellationToken)|44CDD5E187F4EA67",
			"PublyApp.Api.Modules.Auth.Jobs.CleanupExpiredSessionsHandler."
				+ "HandleAsync(PublyApp.Api.Infrastructure.Jobs.JobContext,System."
				+ "Threading.CancellationToken)|5C9A22733B508CE6",
			"PublyApp.Api.Infrastructure.Messaging.Email."
				+ "InvitationEmailOutboxDispatcher.ClaimBatchAsync(PublyApp.Api.Data."
				+ "DbContext.AppDbContext,System.Threading.CancellationToken)|"
				+ "BE6B6FC8AE38196E",
			"PublyApp.Api.Infrastructure.Jobs.JobQueueProcessor.ClaimBatchAsync("
				+ "PublyApp.Api.Data.DbContext.AppDbContext,System.String,System.Int32,"
				+ "System.Int32,System.Threading.CancellationToken)|CD66D70379262523",
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
	/// suffix fallback that could silently admit an unreviewed publishing route.
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

	// ── (b) SKIP LOCKED statements are an exact, reviewed inventory ─────────

	[Fact]
	public void ItShouldRejectUnreviewedSkipLockedStatementsWhenScanningTheApiAssembly() {
		var scan = PublishingDispatchArchitectureSpec._ScanSkipLocked(
			typeof(Program).Assembly,
			PublishingDispatchArchitectureSpec._SkipLockedInventory
		);

		_ = scan.TotalStatements.Should().BeGreaterThanOrEqualTo(
			PublishingDispatchArchitectureSpec._SkipLockedInventory.Count,
			"every reviewed statement must be visible; a lower count means the "
				+ "compiled-literal scan collapsed and failed open"
		);

		scan.Offenders.Should().BeEmpty(
			"every SKIP LOCKED statement must be in _SkipLockedInventory exactly as "
				+ "reviewed (method, signature, normalised text). Inventory changes "
				+ "need a reviewer. Found {0} offender(s):\n{1}",
			scan.Offenders.Count,
			string.Join("\n", scan.Offenders.Take(40))
		);

		_ = scan.MissingInventory.Should().BeEmpty(
			"every inventoried statement must still be seen unchanged; an entry "
				+ "that no longer matches means its statement was edited or removed "
				+ "and the inventory needs a reviewer"
		);
	}

	// The one statement that may lock publications is pinned in full: it must be
	// the job's statement, exactly, and it must lock only publications.
	[Fact]
	public void ItShouldPinTheDueScanStatementForPublicationsOnly() {
		var key = PublishingDispatchArchitectureSpec._SanctionedKey;
		var scan = PublishingDispatchArchitectureSpec._ScanSkipLocked(
			typeof(Program).Assembly,
			PublishingDispatchArchitectureSpec._SkipLockedInventory
		);

		_ = scan.SeenText.Should().ContainKey(
			key,
			"{0} must still hold exactly the pinned due-scan statement",
			typeof(DispatchDuePostsJob).FullName
		);
		_ = scan.SeenText[key].Should().Be(
			PublishingDispatchArchitectureSpec._SanctionedDueScanSql
		);

		_ = PublishingDispatchArchitectureSpec._SanctionedDueScanSql.Should()
			.Contain("FROM PUBLICATIONS WHERE ")
			.And.NotContain(" JOIN ")
			.And.NotContain("PUBLICATIONS,")
			.And.NotContain("(SELECT");
		_ = PublishingDispatchArchitectureSpec._SanctionedDueScanSql
			.Should().EndWith("FOR UPDATE SKIP LOCKED");
	}

	private static SkipLockedScan _ScanPlanted() {
		return PublishingDispatchArchitectureSpec._ScanSkipLocked(
			typeof(PublishingDispatchArchitectureSpec).Assembly,
			PublishingDispatchArchitectureSpec._PlantedInventory
		);
	}

	private static void _AssertOffender(SkipLockedScan scan, string where) {
		_ = scan.Offenders.Should().Contain(
			o => o.Contains(where),
			"'{0}' must be reported; offenders were:\n{1}",
			where,
			string.Join("\n", scan.Offenders)
		);
	}

	private static void _AssertClean(SkipLockedScan scan, string where) {
		_ = scan.Offenders.Should().NotContain(
			o => o.Contains(where),
			"'{0}' is reviewed and must not be reported; offenders were:\n{1}",
			where,
			string.Join("\n", scan.Offenders)
		);
	}

	// Each fixture is red (wrongly cleared, or wrongly reported) if its rule is
	// removed from the scan.
	[Fact]
	public void ItShouldReportEveryUnlistedStatementShapeWhenScanningCompiledCode() {
		var scan = PublishingDispatchArchitectureSpec._ScanPlanted();

		foreach (var shape in new[] {
			"PlantedUnlisted.Concatenated ", // compiler-folded concatenation
			"PlantedUnlisted.SplitAroundValue ", // fragments joined per statement
			"PlantedUnlisted.Interpolated ", // FormattableString
			"PlantedUnlisted.LowerCaseNewline ", // case + whitespace
			"PlantedUnlisted.CommentBetween ", // comment inside the clause
			"PlantedUnlisted.Tail ", // clause alone in another method
			"PlantedUnlisted.ClauseThenLiteral ", // letters glued right after the clause
			"PlantedUnlisted.NestedBlockComment ", // nested comment hides the clause
			"PlantedUnlisted.SemicolonInBlockComment ", // ';' inside a comment
			"PlantedUnlisted.SemicolonInLineComment ",
			"PlantedUnlisted.QuotedLineMarker ", // '--' in a quoted value
			"PlantedUnlisted.QuotedBlockMarker ", // '/*' in a quoted value
			"PlantedUnlisted.TableParameter ", // table from a parameter
			"PlantedUnlisted.OuterLockOverSubquery ", // outer lock, subquery names another table
			"PlantedUnlisted.OuterLockOverComment ",
			"PlantedUnlisted.OuterLockOverString ",
			"PlantedUnlisted.ProseMentioningTheClause ", // prose is not exempt
			"PlantedUnlisted.ClaimAsync ", // async method, declared name
			"PlantedHolder+Nested.Sql ", // nesting sanctions nothing
		}) {
			PublishingDispatchArchitectureSpec._AssertOffender(scan, shape);
		}

		var async = scan.Offenders.Single(o => o.Contains("PlantedUnlisted.ClaimAsync "));
		if (!async.Contains("no portable PDB")) {
			_ = async.Should().Contain("PublishingDispatchArchitecture.Spec.cs:");
		}

		_ = string.Join("\n", scan.Offenders).Should().NotContain("MoveNext");

		foreach (var shape in new[] {
			"NestedBlockComment ", "SemicolonInBlockComment ", "SemicolonInLineComment ",
		}) {
			_ = scan.Offenders.Should().Contain(o =>
				o.Contains($"PlantedUnlisted.{shape}") && o.Contains("cannot be attributed"));
		}

		foreach (var shape in new[] {
			"ViaFormat", "ViaJoin", "ViaReplace", "ViaInsert", "ViaRemove",
			"ViaBuilder", "ViaInterpolation",
		}) {
			_ = scan.Offenders.Should().Contain(
				o => o.Contains($"PlantedAssemblers.{shape} ")
					&& o.Contains("assembled with non-literal pieces"),
				"{0} must be refused as runtime-assembled",
				shape
			);
		}

		// A statement assembled at runtime is never clearable, even when a
		// reviewer inventoried it: its pieces (and its callers) are invisible.
		_ = scan.Offenders.Should().Contain(o =>
			o.Contains("PlantedInventoriedHelper.Lock ")
				&& o.Contains("assembled with non-literal pieces"));
		_ = scan.Offenders.Should().Contain(o =>
			o.Contains("PlantedUnlisted.TableParameter ")
				&& o.Contains("assembled with non-literal pieces"));
		_ = scan.Offenders.Should().Contain(o =>
			o.Contains("PlantedUnlisted.SplitAroundValue ")
				&& o.Contains("assembled with non-literal pieces"));
	}

	[Fact]
	public void ItShouldClearOnlyTheExactReviewedStatementWhenMethodsAndTextMatch() {
		var scan = PublishingDispatchArchitectureSpec._ScanPlanted();

		// Reviewed, unedited, in the reviewed method: passes.
		PublishingDispatchArchitectureSpec._AssertClean(scan, "PlantedReviewed.Sql ");
		_ = scan.Offenders.Should().NotContain(o => o.Contains("PlantedOverload.Claim()|"));

		// The same text in another overload / another class: fails.
		PublishingDispatchArchitectureSpec._AssertOffender(scan, "PlantedOverload.Claim ");
		_ = scan.Offenders.Should().Contain(o =>
			o.Contains("PlantedOverload.Claim(System.Int32)|"));
		PublishingDispatchArchitectureSpec._AssertOffender(scan, "PlantedCopy.Sql ");

		// An edited reviewed statement fails, and its stale entry is reported.
		PublishingDispatchArchitectureSpec._AssertOffender(scan, "PlantedEdited.Sql ");
		_ = scan.MissingInventory.Should().Contain(k => k.Contains("PlantedEdited.Sql"));
		// Every other reviewed fixture entry must have been seen; only the edited
		// statement and the never-clearable helper leave a stale entry.
		_ = scan.MissingInventory.Should().HaveCount(3)
			.And.Contain(k => k.Contains("PlantedInventoriedHelper.Lock"))
			.And.Contain(k => k.Contains("PlantedQuotedEdited.Sql"));
		PublishingDispatchArchitectureSpec._AssertOffender(scan, "PlantedQuotedEdited.Sql ");
		PublishingDispatchArchitectureSpec._AssertClean(scan, "PlantedQuotedReviewed.Sql ");

		// Comments, whitespace and case are not part of the identity.
		// Two reviewed statements in one method are cut and judged separately.
		PublishingDispatchArchitectureSpec._AssertClean(scan, "PlantedTwoStatements.Both ");
		// An identical statement twice: one occurrence is reviewed, the other not.
		_ = scan.Offenders.Should().ContainSingle(o => o.Contains("PlantedDuplicate.Both "));
		_ = scan.Offenders.Single(o => o.Contains("PlantedDuplicate.Both "))
			.Should().Contain("identical statement already occurs");
		PublishingDispatchArchitectureSpec._AssertClean(scan, "PlantedCommented.Sql ");
		PublishingDispatchArchitectureSpec._AssertClean(scan, "PlantedMessy.Sql ");
		PublishingDispatchArchitectureSpec._AssertClean(scan, "PlantedTrailingLog.Sql ");
		PublishingDispatchArchitectureSpec._AssertClean(scan, "PlantedFallbackTrailingLog.Sql ");
		PublishingDispatchArchitectureSpec._AssertClean(scan, "PlantedSanctionedLike.Claim ");
	}

	// Decoder guard: switch (variable-size operand), ldc.i8 and adjacent ldstr
	// must not desynchronise the IL walk before the SKIP LOCKED literal.
	[Fact]
	public void ItShouldDecodeLiteralsAfterSwitchWithWideConstants() {
		PublishingDispatchArchitectureSpec._AssertOffender(
			PublishingDispatchArchitectureSpec._ScanPlanted(),
			"PlantedDecoder.AfterSwitch "
		);
	}


	[Fact]
	public void ItShouldSizeEveryKnownOperandTypeExactlyWhenDecodingAndRejectUnknownOnes() {
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

	// Never executed: statements the guard must judge in compiled code. Their
	// bodies exist only so the compiler emits the literals.
	private const string _SqlReviewed = "SELECT id FROM job_queue FOR UPDATE SKIP LOCKED";
	private const string _SqlQuotedMarker =
		"SELECT j.id FROM job_queue j, other o WHERE j.note LIKE '%--%' "
		+ "FOR UPDATE OF j SKIP LOCKED";
	private const string _SqlQuotedMarkerEdited =
		"SELECT j.id FROM job_queue j, other o WHERE j.note LIKE '%--%' "
		+ "FOR UPDATE OF o SKIP LOCKED";
	private const string _SqlSecond = "SELECT id FROM email_log FOR UPDATE SKIP LOCKED";
	private const string _SqlReviewedEdited =
		"SELECT id FROM job_queue LIMIT 5 FOR UPDATE SKIP LOCKED";
	private const string _SqlReviewedOriginalOfEdited =
		"SELECT id FROM job_queue LIMIT 4 FOR UPDATE SKIP LOCKED";
	private const string _SqlWithComments =
		"SELECT id FROM job_queue -- keep this note\n /* and this */ FOR UPDATE SKIP LOCKED";
	private const string _SqlWithCommentsCanonical =
		"SELECT ID FROM JOB_QUEUE FOR UPDATE SKIP LOCKED";
	private const string _SqlMessy = "select id\n   from job_queue\n\tfor update   skip locked";
	private const string _SqlSanctionedLike = "SELECT ID FROM PUBLICATIONS FOR UPDATE SKIP LOCKED";

	private static class PlantedReviewed {
		public static string Sql() {
			return PublishingDispatchArchitectureSpec._SqlReviewed;
		}
	}

	// The SAME text in an overload and in another class: only the reviewed
	// (type, method signature) is cleared.
	private static class PlantedOverload {
		public static string Claim() {
			return PublishingDispatchArchitectureSpec._SqlReviewed;
		}

		public static string Claim(int unused) {
			return unused > 0 ? PublishingDispatchArchitectureSpec._SqlReviewed : string.Empty;
		}
	}

	// Two reviewed statements in ONE method: each is judged on its own text.
	private static class PlantedTwoStatements {
		public static string Both() {
			var first = PublishingDispatchArchitectureSpec._SqlReviewed;
			var second = PublishingDispatchArchitectureSpec._SqlSecond;
			return first.Length > second.Length ? first : second;
		}
	}

	// An identical statement twice: an entry matches exactly one occurrence.
	private static class PlantedDuplicate {
		public static string Both() {
			var first = PublishingDispatchArchitectureSpec._SqlReviewed;
			var second = PublishingDispatchArchitectureSpec._SqlReviewed;
			return first.Length > second.Length ? first : second;
		}
	}

	private static class PlantedCopy {
		public static string Sql() {
			return PublishingDispatchArchitectureSpec._SqlReviewed;
		}
	}

	// Reviewed with one text, edited since: red until a reviewer updates the hash.
	private static class PlantedEdited {
		public static string Sql() {
			return PublishingDispatchArchitectureSpec._SqlReviewedEdited;
		}
	}

	// Clause visible only after comment stripping, then a log literal: the
	// identity must stop at the literal holding "locked", not at the last literal.
	private static class PlantedFallbackTrailingLog {
		public static string Sql() {
			return PlantedFallbackTrailingLog._Pick(
				"SELECT id FROM job_queue FOR UPDATE SKIP /* x */ LOCKED",
				"removed rows older than the retention window"
			);
		}

		private static string _Pick(string statement, string log) {
			return log.Length > statement.Length ? log : statement;
		}
	}

	// A log/copy literal after the statement is not part of its identity.
	private static class PlantedTrailingLog {
		public static string Sql() {
			return PlantedTrailingLog._Pick(
				PublishingDispatchArchitectureSpec._SqlReviewed,
				"removed rows older than the retention window"
			);
		}

		private static string _Pick(string statement, string log) {
			return log.Length > statement.Length ? log : statement;
		}
	}

	// Comments and whitespace/case are not part of the reviewed identity.
	private static class PlantedCommented {
		public static string Sql() {
			return PublishingDispatchArchitectureSpec._SqlWithComments;
		}
	}

	private static class PlantedMessy {
		public static string Sql() {
			return PublishingDispatchArchitectureSpec._SqlMessy;
		}
	}

	// A quoted '--' must not truncate the identity: the tail edit (OF j -> OF o)
	// changes the hash.
	private static class PlantedQuotedReviewed {
		public static string Sql() {
			return PublishingDispatchArchitectureSpec._SqlQuotedMarker;
		}
	}

	private static class PlantedQuotedEdited {
		public static string Sql() {
			return PublishingDispatchArchitectureSpec._SqlQuotedMarkerEdited;
		}
	}

	// Every runtime string-assembly API is refused, whatever the inventory says.
	private static class PlantedAssemblers {
		public static string ViaFormat(string t) {
			return string.Format(
				System.Globalization.CultureInfo.InvariantCulture,
				"SELECT id FROM {0} FOR UPDATE SKIP LOCKED",
				t
			);
		}

		public static string ViaJoin() {
			return string.Join(",", ["SELECT id FROM publications FOR UPDATE SKIP LOCKED"]);
		}

		public static string ViaReplace(string t) {
			return "SELECT id FROM x FOR UPDATE SKIP LOCKED".Replace("x", t);
		}

		public static string ViaInsert(string t) {
			return "FOR UPDATE SKIP LOCKED".Insert(0, t);
		}

		public static string ViaRemove(int n) {
			return "SELECT id FROM publications FOR UPDATE SKIP LOCKED".Remove(0, n);
		}

		public static string ViaBuilder(string t) {
			return new StringBuilder("SELECT id FROM ").Append(t)
				.Append(" FOR UPDATE SKIP LOCKED").ToString();
		}

		// A non-string hole makes the compiler use the interpolation handler.
		public static string ViaInterpolation(int n) {
			var sql = $"SELECT id FROM t{n} FOR UPDATE SKIP LOCKED";
			return sql;
		}
	}

	// Reviewed, yet assembled at runtime from a parameter: never clearable.
	private static class PlantedInventoriedHelper {
		public static string Lock(string table) {
			return "SELECT id FROM " + table + " WHERE x = 1 FOR UPDATE SKIP LOCKED";
		}
	}

	// Unlisted: every way of writing a lock that was ever a bypass.
	private static class PlantedUnlisted {
		public static string Concatenated() {
			return "SELECT id FROM publications " + "WHERE status = 1 FOR UPDATE SKIP " + "LOCKED";
		}

		public static string SplitAroundValue(string value) {
			return "SELECT id FROM publications FOR UPDATE SKIP " + value.Trim() + "LOCKED";
		}

		public static FormattableString Interpolated(Guid id) {
			return $"SELECT id FROM publications WHERE id = {id} FOR UPDATE SKIP LOCKED";
		}

		public static string LowerCaseNewline() {
			return "select id from publications for update skip\n  locked";
		}

		public static string CommentBetween() {
			return "SELECT id FROM publications FOR UPDATE SKIP /* hidden */ LOCKED";
		}

		public static string Tail() {
			return " FOR UPDATE SKIP LOCKED";
		}

		// A literal right after the clause must not hide it from detection.
		public static string ClauseThenLiteral() {
			return PlantedUnlisted._Pick(
				"SELECT id FROM publications FOR UPDATE SKIP LOCKED",
				"deleted rows"
			);
		}

		private static string _Pick(string statement, string log) {
			return log.Length > statement.Length ? log : statement;
		}

		// Nested block comments are valid PostgreSQL: no comment parser may be
		// trusted to find the clause, only the blunt "locked" counter.
		public static string NestedBlockComment() {
			return "SELECT id FROM publications FOR UPDATE SKIP /* a /* b */ c */ LOCKED";
		}

		// A ';' inside a comment must not cut the clause in two.
		public static string SemicolonInBlockComment() {
			return "SELECT id FROM publications FOR UPDATE SKIP /* hidden ; */ LOCKED";
		}

		public static string SemicolonInLineComment() {
			return "SELECT id FROM publications FOR UPDATE SKIP -- hidden ;\nLOCKED";
		}

		// Comment markers inside quoted values must not hide the clause.
		public static string QuotedLineMarker() {
			return "SELECT id FROM publications WHERE note LIKE '%--%' FOR UPDATE SKIP LOCKED";
		}

		public static string QuotedBlockMarker() {
			return "SELECT id FROM publications WHERE note = '/*' FOR UPDATE SKIP LOCKED /* c */";
		}

		public static string TableParameter(string table) {
			return "SELECT id FROM " + table + " WHERE x = 1 FOR UPDATE SKIP LOCKED";
		}

		// The outer select locks publications; the subquery names job_queue.
		public static string OuterLockOverSubquery() {
			return "SELECT id FROM publications WHERE id IN (SELECT id FROM job_queue) "
				+ "FOR UPDATE SKIP LOCKED";
		}

		public static string OuterLockOverComment() {
			return "SELECT id FROM publications -- select id from job_queue\n "
				+ "FOR UPDATE SKIP LOCKED";
		}

		public static string OuterLockOverString() {
			return "SELECT id FROM publications WHERE note = 'select id from job_queue' "
				+ "FOR UPDATE SKIP LOCKED";
		}

		public static string ProseMentioningTheClause() {
			return "Another description that says SKIP LOCKED somewhere.";
		}

		public static async Task<List<Guid>> ClaimAsync(AppDbContext db) {
			return await db.Database
				.SqlQuery<Guid>($"SELECT id AS \"Value\" FROM publications FOR UPDATE SKIP LOCKED")
				.ToListAsync();
		}
	}

	// A nested type of an inventoried holder is not sanctioned by nesting.
	private static class PlantedHolder {
		public static class Nested {
			public static string Sql() {
				return "SELECT id FROM publications FOR UPDATE SKIP LOCKED";
			}
		}
	}

	private static class PlantedSanctionedLike {
		public static string Claim() {
			return PublishingDispatchArchitectureSpec._SqlSanctionedLike;
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

	private static string _Hash(string normalisedText) {
		return Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
			Encoding.UTF8.GetBytes(normalisedText)
		))[..16];
	}

	// Comments are dropped (outside quoted text only: '--' inside '…' or "…" is
	// data), whitespace collapsed and case folded: the only differences that do not
	// change a statement's reviewed identity.
	private static string _Normalise(string sql) {
		var kept = new StringBuilder(sql.Length);
		var i = 0;
		while (i < sql.Length) {
			var c = sql[i];
			if (c is '\'' or '"') {
				var end = sql.IndexOf(c, i + 1);
				var stop = end < 0 ? sql.Length : end + 1;
				_ = kept.Append(sql, i, stop - i);
				i = stop;
			} else if (c == '-' && i + 1 < sql.Length && sql[i + 1] == '-') {
				var eol = sql.IndexOf('\n', i);
				_ = kept.Append(' ');
				i = eol < 0 ? sql.Length : eol;
			} else if (c == '/' && i + 1 < sql.Length && sql[i + 1] == '*') {
				var close = sql.IndexOf("*/", i + 2, StringComparison.Ordinal);
				_ = kept.Append(' ');
				i = close < 0 ? sql.Length : close + 2;
			} else {
				_ = kept.Append(c);
				i++;
			}
		}

		return PublishingDispatchArchitectureSpec._WhitespaceRun().Replace(kept.ToString(), " ")
			.Trim().ToUpperInvariant();
	}

	// "Type.Method(param types)|hash of the normalised statement" — the exact
	// identity of one reviewed statement.
	private static string _Key(Type type, string method, Type[] parameters, string sql) {
		var signature = string.Join(",", parameters.Select(p => p.FullName ?? p.Name));
		var hash = PublishingDispatchArchitectureSpec._Hash(
			PublishingDispatchArchitectureSpec._Normalise(sql)
		);
		return $"{type.FullName}.{method}({signature})|{hash}";
	}

	private static readonly IReadOnlySet<string> _PlantedInventory = new HashSet<string>(
		[
			PublishingDispatchArchitectureSpec._Key(
				typeof(PlantedReviewed), nameof(PlantedReviewed.Sql),
				[], PublishingDispatchArchitectureSpec._SqlReviewed),
			PublishingDispatchArchitectureSpec._Key(
				typeof(PlantedOverload), nameof(PlantedOverload.Claim),
				[], PublishingDispatchArchitectureSpec._SqlReviewed),
			PublishingDispatchArchitectureSpec._Key(
				typeof(PlantedTwoStatements), nameof(PlantedTwoStatements.Both),
				[], PublishingDispatchArchitectureSpec._SqlReviewed),
			PublishingDispatchArchitectureSpec._Key(
				typeof(PlantedTwoStatements), nameof(PlantedTwoStatements.Both),
				[], PublishingDispatchArchitectureSpec._SqlSecond),
			PublishingDispatchArchitectureSpec._Key(
				typeof(PlantedDuplicate), nameof(PlantedDuplicate.Both),
				[], PublishingDispatchArchitectureSpec._SqlReviewed),
			// reviewed with an older text than the code now holds
			PublishingDispatchArchitectureSpec._Key(
				typeof(PlantedEdited), nameof(PlantedEdited.Sql),
				[], PublishingDispatchArchitectureSpec._SqlReviewedOriginalOfEdited),
			// reviewed as the comment-free, upper-case canonical text
			PublishingDispatchArchitectureSpec._Key(
				typeof(PlantedCommented), nameof(PlantedCommented.Sql),
				[], PublishingDispatchArchitectureSpec._SqlWithCommentsCanonical),
			PublishingDispatchArchitectureSpec._Key(
				typeof(PlantedTrailingLog), nameof(PlantedTrailingLog.Sql),
				[], PublishingDispatchArchitectureSpec._SqlReviewed),
			PublishingDispatchArchitectureSpec._Key(
				typeof(PlantedQuotedReviewed), nameof(PlantedQuotedReviewed.Sql),
				[], PublishingDispatchArchitectureSpec._SqlQuotedMarker),
			// reviewed before the tail of its statement was edited
			PublishingDispatchArchitectureSpec._Key(
				typeof(PlantedQuotedEdited), nameof(PlantedQuotedEdited.Sql),
				[], PublishingDispatchArchitectureSpec._SqlQuotedMarker),
			PublishingDispatchArchitectureSpec._Key(
				typeof(PlantedFallbackTrailingLog), nameof(PlantedFallbackTrailingLog.Sql),
				[], PublishingDispatchArchitectureSpec._SqlReviewed),
			PublishingDispatchArchitectureSpec._Key(
				typeof(PlantedMessy), nameof(PlantedMessy.Sql),
				[], PublishingDispatchArchitectureSpec._SqlReviewed),
			PublishingDispatchArchitectureSpec._Key(
				typeof(PlantedSanctionedLike), nameof(PlantedSanctionedLike.Claim),
				[], PublishingDispatchArchitectureSpec._SqlSanctionedLike),
			// a reviewer approved this helper, but it is assembled at runtime
			PublishingDispatchArchitectureSpec._Key(
				typeof(PlantedInventoriedHelper), nameof(PlantedInventoriedHelper.Lock),
				[typeof(string)], "SELECT id FROM WHERE x = 1 FOR UPDATE SKIP LOCKED"),
		],
		StringComparer.Ordinal
	);

	// The sanctioned due-scan statement, normalised, pinned in full. Its hash
	// is the inventory entry of DispatchDuePostsJob.HandleAsync; editing the
	// job's SQL (or this text) turns the guard red until a reviewer updates both.
	private const string _SanctionedDueScanSql =
		"SELECT ID AS \"VALUE\" FROM PUBLICATIONS WHERE STATUS = {0} AND "
		+ "IS_DELETED = FALSE AND SCHEDULED_AT_UTC <= NOW() ORDER BY "
		+ "SCHEDULED_AT_UTC, ID LIMIT {1} FOR UPDATE SKIP LOCKED";

	private sealed record SkipLockedScan(
		int TotalStatements,
		Dictionary<string, string> SeenText,
		List<string> MissingInventory,
		List<string> Offenders
	);

	private sealed record LiteralSite(
		string Type,
		string Method,
		string Signature,
		MethodDefinitionHandle Handle,
		int ILOffset,
		string Text,
		bool Assembles
	);

	// One SQL statement of a method: consecutive literals, cut where a literal
	// starts a new statement (SELECT/UPDATE/DELETE/WITH/INSERT) or at ';'. The
	// cut only bounds the text that is hashed; it never interprets it.
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
	/// Exact-inventory scan over the COMPILED API assembly (IL string literals,
	/// not source text). Each method's literals are cut into statements,
	/// comments are stripped and whitespace/case normalised; every statement
	/// containing <c>SKIP LOCKED</c> must be in the reviewed inventory as
	/// (declaring type, method, full parameter types, SHA-256 of the normalised
	/// statement). Nothing about the SQL is interpreted: no table is extracted,
	/// so there is no reader to fool, and any edit to a reviewed statement — or
	/// the same text in another method, overload or nested type — fails until a
	/// reviewer updates the inventory. Offenders name type.method, file:line and
	/// the normalised statement.
	/// </summary>
	private static SkipLockedScan _ScanSkipLocked(
		Assembly assembly,
		IReadOnlySet<string> inventory
	) {
		var sites = PublishingDispatchArchitectureSpec._ReadLiteralSites(assembly, out var pdb);
		using var pdbOwner = pdb;
		var pdbReader = pdb?.GetMetadataReader();
		var offenders = new List<string>();
		var seenText = new Dictionary<string, string>(StringComparer.Ordinal);
		var total = 0;

		foreach (var methodGroup in sites.GroupBy(site => (site.Type, site.Signature))) {
			var assembles = methodGroup.Any(site => site.Assembles);
			var occurrences = new Dictionary<string, int>(StringComparer.Ordinal);

			var statements = PublishingDispatchArchitectureSpec._Statements(methodGroup.ToList());
			var attributedLocked = 0;
			foreach (var statement in statements) {
				var raw = statement.Text.ToString();
				var rawMatches = PublishingDispatchArchitectureSpec._SkipLockedRegex().Matches(raw);
				// Detection looks at the raw text too: comment stripping must never
				// be able to hide a clause (e.g. '--' inside a quoted value).
				if (rawMatches.Count == 0 && !PublishingDispatchArchitectureSpec._SkipLockedRegex()
					.IsMatch(PublishingDispatchArchitectureSpec._Normalise(raw))) {
					continue;
				}

				total++;
				// The literal holding the clause: the last raw match, or (clause only
				// visible after comment stripping) the last literal that holds "locked".
				var holderIndex = rawMatches.Count == 0
					? PublishingDispatchArchitectureSpec._LastLockedPart(statement)
					: statement.Parts.FindLastIndex(part => part.Start <= rawMatches[^1].Index);
				var cut = holderIndex + 1 < statement.Parts.Count
					? raw[..statement.Parts[holderIndex + 1].Start]
					: raw;
				attributedLocked += PublishingDispatchArchitectureSpec._CountLocked(cut);
				var normalised = PublishingDispatchArchitectureSpec._Normalise(cut);
				var where = PublishingDispatchArchitectureSpec._Describe(
					statement.Parts[holderIndex].Site, pdbReader);

				if (assembles) {
					offenders.Add(
						$"{where}: SKIP LOCKED statement is assembled with non-literal pieces "
							+ "(string concatenation, interpolation or Format in this method); "
							+ "write it as one literal with parameter placeholders. No inventory "
							+ "entry can clear it. Normalised statement: "
							+ PublishingDispatchArchitectureSpec._Cap(normalised)
					);
					continue;
				}

				var baseKey = $"{methodGroup.Key.Type}.{methodGroup.Key.Signature}"
					+ $"|{PublishingDispatchArchitectureSpec._Hash(normalised)}";
				var occurrence = occurrences.GetValueOrDefault(baseKey) + 1;
				occurrences[baseKey] = occurrence;
				var key = occurrence == 1 ? baseKey : $"{baseKey}#{occurrence}";
				seenText[key] = normalised;
				if (inventory.Contains(key)) {
					continue;
				}

				offenders.Add(
					$"{where}: SKIP LOCKED statement is not in the reviewed inventory"
						+ (occurrence > 1
							? " (an identical statement already occurs in this method)"
							: "")
						+ $". Inventory changes need a reviewer. Entry: \"{key}\"; normalised "
						+ $"statement: {PublishingDispatchArchitectureSpec._Cap(normalised)}"
				);
			}

			// Blunt, comment-syntax-independent fail-closed counter: in a method whose
			// literals contain both "skip" and "locked" (any distance, any order), every
			// "locked" must belong to a detected statement; the rest is an offender no
			// inventory entry can clear (a clause hidden by comments, split by ';', ...).
			// Prose that merely says "locked" there is inventoried like the seeder.
			var whole = string.Concat(methodGroup.Select(site => site.Text));
			if (whole.Contains("skip", StringComparison.OrdinalIgnoreCase)) {
				var unattributed =
					PublishingDispatchArchitectureSpec._CountLocked(whole) - attributedLocked;
				if (unattributed > 0) {
					total += unattributed;
					offenders.Add(
						PublishingDispatchArchitectureSpec._Describe(methodGroup.First(), pdbReader)
							+ $": {unattributed} occurrence(s) of \"locked\" in a method that also "
							+ "contains \"skip\" cannot be attributed to a reviewed SKIP LOCKED "
							+ "statement (a clause hidden by comment syntax, or split by ';'); no "
							+ "inventory entry can clear it"
					);
				}
			}
		}

		var missing = inventory.Where(key => !seenText.ContainsKey(key)).ToList();
		return new SkipLockedScan(total, seenText, missing, offenders);
	}

	private static string _Cap(string text) {
		return text.Length <= 400 ? text : text[..400] + "…";
	}

	private static int _CountLocked(string text) {
		var count = 0;
		var index = 0;
		while ((index = text.IndexOf("locked", index, StringComparison.OrdinalIgnoreCase)) >= 0) {
			count++;
			index += "locked".Length;
		}

		return count;
	}

	private static int _LastLockedPart(Statement statement) {
		var index = statement.Parts.FindLastIndex(part =>
			part.Site.Text.Contains("locked", StringComparison.OrdinalIgnoreCase));
		return index < 0 ? statement.Parts.Count - 1 : index;
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

	private static string _Describe(LiteralSite site, MetadataReader? pdb) {
		var location = PublishingDispatchArchitectureSpec._Location(
			pdb, site.Handle, site.ILOffset
		);
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
				var (literals, assembles) =
					PublishingDispatchArchitectureSpec._StringLiterals(reader, il);
				foreach (var (offset, text) in literals) {
					sites.Add(new LiteralSite(
						typeName, methodName, signature, methodHandle, offset, text, assembles
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

	private static string _Location(
		MetadataReader? pdb,
		MethodDefinitionHandle method,
		int ilOffset
	) {
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

	// Calls that assemble a string at runtime: a statement built with any of them
	// has non-literal pieces (a table, a clause, a fragment) and cannot be judged.
	private static readonly string[] _StringAssemblyCallees = [
		"System.String.Concat",
		"System.String.Format",
		"System.String.Join",
		"System.String.Replace",
		"System.String.Insert",
		"System.String.Remove",
		"System.String.Create",
		"System.Text.StringBuilder.",
		"System.Runtime.CompilerServices.DefaultInterpolatedStringHandler.Append",
	];

	private static string? _CalleeName(MetadataReader reader, int token) {
		var handle = MetadataTokens.EntityHandle(token);
		if (handle.Kind == HandleKind.MethodSpecification) {
			handle = reader.GetMethodSpecification((MethodSpecificationHandle)handle).Method;
		}

		if (handle.Kind != HandleKind.MemberReference) {
			return null;
		}

		var member = reader.GetMemberReference((MemberReferenceHandle)handle);
		if (member.Parent.Kind != HandleKind.TypeReference) {
			return null;
		}

		var type = reader.GetTypeReference((TypeReferenceHandle)member.Parent);
		return $"{reader.GetString(type.Namespace)}.{reader.GetString(type.Name)}"
			+ $".{reader.GetString(member.Name)}";
	}

	private static (List<(int Offset, string Text)> Literals, bool Assembles) _StringLiterals(
		MetadataReader reader,
		byte[] il
	) {
		var literals = new List<(int, string)>();
		var assembles = false;
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
			} else if (opCode == OpCodes.Call || opCode == OpCodes.Callvirt
				|| opCode == OpCodes.Newobj) {
				var callee = PublishingDispatchArchitectureSpec._CalleeName(
					reader, BitConverter.ToInt32(il, position));
				assembles |= callee is not null
					&& PublishingDispatchArchitectureSpec._StringAssemblyCallees.Any(prefix =>
						callee.StartsWith(prefix, StringComparison.Ordinal));
			}

			position += PublishingDispatchArchitectureSpec._OperandSize(
				opCode.OperandType,
				il,
				position
			);
		}

		return (literals, assembles);
	}


	// No word boundaries: literals are joined without a separator, so a clause
	// followed by the next literal ("…SKIP LOCKED" + "deleted rows") must still match.
	[GeneratedRegex(@"SKIP\s+LOCKED", RegexOptions.IgnoreCase)]
	private static partial Regex _SkipLockedRegex();

	[GeneratedRegex(@"^\s*(select|update|delete|with|insert)\b", RegexOptions.IgnoreCase)]
	private static partial Regex _StatementStart();

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
