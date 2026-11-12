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
/// COMPILED API assembly and is closed over an explicit inventory: any type
/// holding a <c>SKIP LOCKED</c> literal (or fragments that join to it inside
/// one method) that is neither the job nor a reviewed inventory entry fails,
/// however its SQL is assembled (concatenation, interpolation, helper method or
/// class, async method, table name or clause split across methods). An
/// inventoried holder must not reference publications. Failures name
/// type.method and file:line from the portable PDB. It does not reuse
/// ArchitectureDiscovery because that excludes the Migrations namespace, where
/// SQL lives. Retire when the claim sits behind one repository seam or
/// Postgres-side enforcement.</item>
/// </list>
/// Documented residual gap: a clause hidden behind a runtime-built string
/// (reflection, a stored function that locks internally, or a clause split
/// into fragments that never share a method and never spell SKIP LOCKED
/// contiguously) is invisible to any static scan.
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

	// Reviewed closed inventory of every API type that may hold a SKIP LOCKED
	// clause besides the sanctioned due-scan job. Adding a type here is the
	// review checkpoint: it must not touch the publications table.
	private static readonly IReadOnlySet<string> _SkipLockedInventory = new HashSet<string>(
		[
			"PublyApp.Api.Modules.Uploads.Jobs.UploadOrphanReclaimerHandler",
			"PublyApp.Api.Modules.Messaging.Jobs.EmailLogRetentionHandler",
			"PublyApp.Api.Modules.Messaging.Jobs.EmailPreparedSendsRetentionHandler",
			"PublyApp.Api.Modules.Jobs.Seeders.SystemJobDefinitionSeeder",
			"PublyApp.Api.Modules.Jobs.Jobs.DeadLetterRetentionHandler",
			"PublyApp.Api.Modules.Jobs.Jobs.SystemJobOccurrenceRetentionHandler",
			"PublyApp.Api.Modules.Auth.Jobs.CleanupExpiredSessionsHandler",
			"PublyApp.Api.Infrastructure.Jobs.JobQueueProcessor",
			"PublyApp.Api.Infrastructure.Messaging.Email.InvitationEmailOutboxDispatcher",
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
	public void ItShouldLetOnlyTheDueScanJobLockPublicationRowsWithSkipLocked() {
		var scan = PublishingDispatchArchitectureSpec._ScanSkipLocked(
			typeof(Program).Assembly,
			PublishingDispatchArchitectureSpec._SkipLockedInventory
		);

		_ = scan.TotalHits.Should().BeGreaterThanOrEqualTo(
			PublishingDispatchArchitectureSpec._SkipLockedInventory.Count + 1,
			"the sanctioned due-scan claim and every inventoried holder must be "
				+ "visible; a lower count means the compiled-literal scan collapsed "
				+ "and failed open"
		);

		_ = scan.SanctionedHits.Should().BeGreaterThanOrEqualTo(
			1,
			"the D3 due scan must still be seen claiming publications rows with "
				+ "SKIP LOCKED; if the job moved or changed shape, reconcile this "
				+ "guard instead of trusting an empty result"
		);

		_ = scan.MissingInventoryTypes.Should().BeEmpty(
			"every inventoried SKIP LOCKED holder must still be seen; a stale "
				+ "entry hides a collapsed scan"
		);

		scan.Offenders.Should().BeEmpty(
			"SKIP LOCKED is closed over an explicit inventory: only {0} may lock "
				+ "publications rows, and any other type holding the clause must be "
				+ "added to _SkipLockedInventory after review (and must not touch "
				+ "publications). Found {1} offender(s):\n{2}",
			typeof(DispatchDuePostsJob).FullName,
			scan.Offenders.Count,
			string.Join("\n", scan.Offenders.Take(20))
		);
	}

	// Non-vacuity, one assertion per claimed capability. Each fixture is red
	// (missing from the offenders) if its capability is removed from the scan.
	[Fact]
	public void ItShouldSeeEveryPlantedClaimantShapeInCompiledCode() {
		var scan = PublishingDispatchArchitectureSpec._ScanSkipLocked(
			typeof(PublishingDispatchArchitectureSpec).Assembly,
			PublishingDispatchArchitectureSpec._PlantedInventory
		);
		var offenders = scan.Offenders;

		// Concatenation folded by the compiler into one literal.
		_ = offenders.Should().Contain(o => o.Contains("PlantedClaimants.Concatenated "));
		// Fragments around a runtime value: only the per-method join sees them.
		_ = offenders.Should().Contain(o => o.Contains("PlantedClaimants.SplitAroundValue "));
		// FormattableString interpolation.
		_ = offenders.Should().Contain(o => o.Contains("PlantedClaimants.Interpolated "));
		// Lock clause in another method of the same type, table elsewhere.
		_ = offenders.Should().Contain(o => o.Contains("PlantedCrossMethod._Tail "));
		// Lock clause in another class than the query.
		_ = offenders.Should().Contain(o => o.Contains("PlantedLockClause.Tail "));
		// Async method: named by its declared name with file:line, not MoveNext.
		_ = offenders.Should().Contain(o =>
			o.Contains("PlantedAsync.ClaimAsync ")
				&& o.Contains("PublishingDispatchArchitecture.Spec.cs:")
		);
		_ = offenders.Should().NotContain(o => o.Contains("MoveNext"));

		// Inventoried types still may not touch publications (any form).
		_ = offenders.Should().Contain(o => o.Contains("PlantedOnlyForm."));
		_ = offenders.Should().Contain(o => o.Contains("PlantedSchemaForm."));
		_ = offenders.Should().NotContain(o => o.Contains("PlantedOtherTable."));
		// A type reading publications elsewhere but locking another table only
		// fails when it is NOT inventoried (no per-statement guessing).
		_ = offenders.Should().Contain(o => o.Contains("PlantedMixedStatements."));
	}

	// Decoder guard: switch (variable-size operand), ldc.i8 and adjacent ldstr
	// must not desynchronise the IL walk before the SKIP LOCKED literal.
	[Fact]
	public void ItShouldKeepDecodingLiteralsAfterSwitchAndWideConstants() {
		var scan = PublishingDispatchArchitectureSpec._ScanSkipLocked(
			typeof(PublishingDispatchArchitectureSpec).Assembly,
			PublishingDispatchArchitectureSpec._PlantedInventory
		);

		_ = scan.Offenders.Should().Contain(o => o.Contains("PlantedDecoder.AfterSwitch "));
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

	private static class PlantedLockClauseUser {
		public static string Query(string table) {
			return "SELECT id FROM " + table + PlantedLockClause.Tail();
		}
	}

	private static class PlantedAsync {
		public static async Task<List<Guid>> ClaimAsync(AppDbContext db) {
			return await db.Database
				.SqlQuery<Guid>($"SELECT id AS \"Value\" FROM publications FOR UPDATE SKIP LOCKED")
				.ToListAsync();
		}
	}

	private static class PlantedOnlyForm {
		public static string Sql() {
			return "SELECT id FROM ONLY publications FOR UPDATE SKIP LOCKED";
		}
	}

	private static class PlantedSchemaForm {
		public static FormattableString Sql(string schema) {
			return $"SELECT id FROM {schema}.publications FOR UPDATE SKIP LOCKED";
		}
	}

	private static class PlantedOtherTable {
		public static string Sql() {
			return "SELECT id FROM job_queue FOR UPDATE SKIP LOCKED";
		}
	}

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

	// Types that are allowed to hold SKIP LOCKED in this fixture scan, so the
	// remaining rule (an inventoried type must not touch publications) is
	// exercised in isolation. Everything else planted must surface as unknown.
	private static readonly IReadOnlySet<string> _PlantedInventory = new HashSet<string>(
		[
			typeof(PlantedOnlyForm).FullName.Required(),
			typeof(PlantedSchemaForm).FullName.Required(),
			typeof(PlantedOtherTable).FullName.Required(),
		],
		StringComparer.Ordinal
	);

	private sealed record SkipLockedScan(
		int TotalHits,
		int SanctionedHits,
		List<string> MissingInventoryTypes,
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
	/// Closed-inventory scan over the COMPILED API assembly (IL string
	/// literals, not source text). Rules: (1) any type holding a SKIP LOCKED
	/// literal, or fragments that join to it within one method, must be the
	/// sanctioned due-scan job or be in the reviewed inventory — an unknown
	/// holder fails loudly however its SQL is assembled (concatenation,
	/// interpolation, helper method or class, async method); (2) an
	/// inventoried holder must not reference the publications table anywhere
	/// in the type. Because the clause itself is the trigger, splitting the
	/// table name from the clause across methods no longer hides a claimant.
	/// Offenders name type.method and file:line from the portable PDB.
	/// </summary>
	private static SkipLockedScan _ScanSkipLocked(
		Assembly assembly,
		IReadOnlySet<string> inventory
	) {
		var sites = PublishingDispatchArchitectureSpec._ReadLiteralSites(assembly, out var pdb);
		using var pdbOwner = pdb;
		var pdbReader = pdb?.GetMetadataReader();
		var offenders = new List<string>();
		var total = 0;
		var sanctioned = 0;
		var seen = new HashSet<string>(StringComparer.Ordinal);
		var sanctionedType = typeof(DispatchDuePostsJob).FullName.Required();

		foreach (var typeGroup in sites.GroupBy(site => site.Type, StringComparer.Ordinal)) {
			var typeSites = typeGroup.ToList();
			var hits = new List<LiteralSite>();
			foreach (var site in typeSites) {
				if (PublishingDispatchArchitectureSpec._SkipLockedRegex().IsMatch(site.Text)) {
					hits.Add(site);
				}
			}

			foreach (var methodGroup in typeSites.GroupBy(site => site.Handle)) {
				var joined = string.Concat(methodGroup.Select(site => site.Text));
				if (hits.All(hit => hit.Handle != methodGroup.Key)
					&& PublishingDispatchArchitectureSpec._SkipLockedRegex().IsMatch(joined)) {
					hits.Add(methodGroup.First());
				}
			}

			if (hits.Count == 0) {
				continue;
			}

			total += hits.Count;
			_ = seen.Add(typeGroup.Key);

			if (string.Equals(typeGroup.Key, sanctionedType, StringComparison.Ordinal)) {
				sanctioned += hits.Count;
				continue;
			}

			if (!inventory.Contains(typeGroup.Key)) {
				offenders.AddRange(hits.Select(hit => PublishingDispatchArchitectureSpec._Describe(
					hit, pdbReader, "holds SKIP LOCKED but is not in the reviewed inventory"
				)));
			} else if (PublishingDispatchArchitectureSpec._PublicationsRef().IsMatch(
				string.Concat(typeSites.Select(site => site.Text)))) {
				offenders.AddRange(hits.Select(hit => PublishingDispatchArchitectureSpec._Describe(
					hit, pdbReader, "inventoried SKIP LOCKED holder references the publications table"
				)));
			}
		}

		var missing = inventory.Where(type => !seen.Contains(type)).ToList();
		return new SkipLockedScan(total, sanctioned, missing, offenders);
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

		// switch: a uint count then that many 4-byte targets; every other
		// operand kind (tokens, branch targets, int32, float32) is 4 bytes.
		return type == OperandType.InlineSwitch
			? 4 + (4 * BitConverter.ToInt32(il, position))
			: 4;
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

	// FROM/UPDATE/JOIN/INTO/ONLY, then an optional (possibly interpolated)
	// schema, then publications.
	[GeneratedRegex(@"\b(from|update|join|into|only)\s+\S*publications\b", RegexOptions.IgnoreCase)]
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
