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
/// DispatchDuePostsConcurrencySpec. Detection reads the string literals of the COMPILED
/// API assembly (IL <c>ldstr</c>), so concatenated, interpolated and
/// helper-built SQL is seen; each <c>SKIP LOCKED</c> is attributed to its
/// enclosing statement within one method, which must reference the
/// publications table. Retire when the claim moves behind a single repository
/// seam or Postgres-side enforcement.</item>
/// </list>
/// Documented residual gap: SQL whose pieces are assembled across different
/// methods, or runtime-built table names, can still evade the per-method
/// statement window.
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

	private static readonly Type _DueScanJobType = typeof(DispatchDuePostsJob);

	// The scan must see AT LEAST the sanctioned claim itself; zero means the
	// scan collapsed and failed open — never trust a silent empty scan.
	private const int _MinimumTotalSkipLockedMatches = 1;

	private const string _SkipLockedToken = "SKIP LOCKED";

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
		var scan = PublishingDispatchArchitectureSpec._ScanForUpdateSkipLockedOnPublications(
			typeof(Program).Assembly
		);

		_ = scan.TotalMatches.Should().BeGreaterThanOrEqualTo(
			PublishingDispatchArchitectureSpec._MinimumTotalSkipLockedMatches,
			"the sanctioned due-scan claim alone must be visible; a near-zero "
				+ "count means the compiled-literal scan collapsed and failed open"
		);

		_ = scan.SanctionedByType.GetValueOrDefault(
				PublishingDispatchArchitectureSpec._DueScanJobType.FullName.Required()
			)
			.Should().BeGreaterThanOrEqualTo(
				1,
				"the D3 due scan must still be seen claiming publications rows "
					+ "with SKIP LOCKED; if the job moved or changed shape, "
					+ "reconcile this guard instead of trusting an empty result"
			);

		scan.Offenders.Should().BeEmpty(
			"only {0} may SELECT … FOR UPDATE SKIP LOCKED against the "
				+ "publications table — a second claimant forks the "
				+ "exactly-once dispatch guarantee; found {1} offender(s):\n{2}",
			PublishingDispatchArchitectureSpec._DueScanJobType.FullName,
			scan.Offenders.Count,
			string.Join("\n", scan.Offenders.Take(20))
		);
	}

	// Non-vacuity: claimants written the ways a source regex cannot see. These
	// fixtures live in the test assembly, which the scan accepts like any other.
	[Fact]
	public void ItShouldSeeClaimantsBuiltByConcatenationInterpolationOrHelper() {
		var scan = PublishingDispatchArchitectureSpec._ScanForUpdateSkipLockedOnPublications(
			typeof(PublishingDispatchArchitectureSpec).Assembly
		);

		var offenders = string.Join("\n", scan.Offenders);
		_ = offenders.Should().Contain(nameof(PlantedClaimants.Concatenated));
		_ = offenders.Should().Contain(nameof(PlantedClaimants.Interpolated));
		_ = offenders.Should().Contain("_Claim");
		_ = offenders.Should().NotContain(nameof(PlantedClaimants.OtherTable));
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

		public static FormattableString Interpolated(Guid id) {
			return $"SELECT id FROM publications WHERE id = {id} FOR UPDATE SKIP LOCKED";
		}

		public static string HelperClaim() {
			return PlantedClaimants._Claim("");
		}

		public static string OtherTable() {
			return "SELECT id FROM job_queue FOR UPDATE SKIP LOCKED";
		}

		private static string _Claim(string table) {
			return "SELECT id FROM publications WHERE x = 1 FOR UPDATE SKIP LOCKED" + table;
		}
	}

	private sealed record ForUpdateScan(
		int TotalMatches,
		Dictionary<string, int> SanctionedByType,
		List<string> Offenders
	);

	// Every opcode by encoded value, so the IL walker can size each instruction.
	private static readonly Dictionary<short, OpCode> _OpCodes = typeof(OpCodes)
		.GetFields(BindingFlags.Public | BindingFlags.Static)
		.Select(field => (OpCode)field.GetValue(null).Required())
		.ToDictionary(opCode => opCode.Value);

	/// <summary>
	/// Scans the COMPILED API assembly, not its source text: the compiler has
	/// already folded literal concatenation (<c>"a" + "b"</c>) into one
	/// <c>ldstr</c> and split interpolated SQL into literal fragments, so reading
	/// the string literals of each method body sees SQL however the author wrote
	/// it — concatenated, interpolated, or hidden in a helper method. Literals
	/// are joined per method and cut at statement terminators.
	/// </summary>
	private static ForUpdateScan _ScanForUpdateSkipLockedOnPublications(
		Assembly assembly
	) {
		var offenders = new List<string>();
		var sanctionedByType = new Dictionary<string, int>(StringComparer.Ordinal);
		var total = 0;

		foreach (var (typeName, method, literals) in
			PublishingDispatchArchitectureSpec._ReadMethodStringLiterals(assembly)) {
			var text = string.Concat(literals);
			var index = 0;
			while ((index = text.IndexOf(
						PublishingDispatchArchitectureSpec._SkipLockedToken,
						index,
						StringComparison.OrdinalIgnoreCase
					)) >= 0) {
				var statementStart = text.LastIndexOf(';', Math.Max(index - 1, 0)) + 1;
				var statement = text[statementStart..index];

				// A real claim reads the table (FROM/UPDATE/JOIN publications);
				// prose that merely mentions the word (job descriptions, XML
				// docs) is data, not SQL.
				if (PublishingDispatchArchitectureSpec._PublicationsTableRef().IsMatch(statement)) {
					total++;

					if (string.Equals(
							typeName,
							PublishingDispatchArchitectureSpec._DueScanJobType.FullName,
							StringComparison.Ordinal
						)) {
						sanctionedByType[typeName] =
							sanctionedByType.GetValueOrDefault(typeName) + 1;
					} else {
						offenders.Add(
							$"{typeName}.{method}: "
								+ PublishingDispatchArchitectureSpec._Flatten(
									statement + PublishingDispatchArchitectureSpec._SkipLockedToken
								)
						);
					}
				}

				index += PublishingDispatchArchitectureSpec._SkipLockedToken.Length;
			}
		}

		return new ForUpdateScan(total, sanctionedByType, offenders);
	}

	// Yields (top-level declaring type, method, string literals in IL order) for
	// every method body. Nested types (async state machines, closures) are
	// attributed to their top-level type.
	private static IEnumerable<(string TypeName, string Method, List<string> Literals)>
		_ReadMethodStringLiterals(Assembly assembly) {
		using var stream = File.OpenRead(assembly.Location);
		using var peReader = new PEReader(stream);
		var reader = peReader.GetMetadataReader();

		foreach (var typeHandle in reader.TypeDefinitions) {
			var type = reader.GetTypeDefinition(typeHandle);
			var top = type;
			while (!top.GetDeclaringType().IsNil) {
				top = reader.GetTypeDefinition(top.GetDeclaringType());
			}

			var typeName = PublishingDispatchArchitectureSpec._QualifiedName(reader, top);

			foreach (var methodHandle in type.GetMethods()) {
				var method = reader.GetMethodDefinition(methodHandle);
				if (method.RelativeVirtualAddress == 0) {
					continue;
				}

				var il = peReader.GetMethodBody(method.RelativeVirtualAddress)
					.GetILBytes().Required();
				var literals = PublishingDispatchArchitectureSpec._StringLiterals(reader, il);
				if (literals.Count > 0) {
					yield return (typeName, reader.GetString(method.Name), literals);
				}
			}
		}
	}

	private static string _QualifiedName(MetadataReader reader, TypeDefinition type) {
		var name = reader.GetString(type.Name);
		var ns = reader.GetString(type.Namespace);
		return ns.Length == 0 ? name : $"{ns}.{name}";
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

	private static List<string> _StringLiterals(MetadataReader reader, byte[] il) {
		var literals = new List<string>();
		var position = 0;
		while (position < il.Length) {
			var code = il[position++];
			var value = code == 0xFE ? (short)(0xFE00 | il[position++]) : code;
			var opCode = PublishingDispatchArchitectureSpec._OpCodes[value];

			if (opCode == OpCodes.Ldstr) {
				var token = BitConverter.ToInt32(il, position);
				literals.Add(reader.GetUserString(
					MetadataTokens.UserStringHandle(token & 0x00FFFFFF)
				));
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

	[GeneratedRegex(@"\b(from|update|join)\s+([\w""]+\.)?""?publications\b", RegexOptions.IgnoreCase)]
	private static partial Regex _PublicationsTableRef();

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
