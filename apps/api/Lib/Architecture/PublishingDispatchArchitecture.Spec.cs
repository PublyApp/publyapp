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
/// DispatchDuePostsConcurrencySpec. Detection is lexical but statement-scoped:
/// each <c>SKIP LOCKED</c> occurrence is attributed to its enclosing SQL
/// statement, which must reference the publications table.</item>
/// </list>
/// Documented residual gap: SQL assembled dynamically from pieces can evade the
/// statement window — same stance as the sibling guards (CanaryProbeContainment,
/// PublicationArchitecture reflection gap).
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
	private static readonly string[] PublishingRouteEndpointNames = [
		"SchedulePostForTenant",
		"EditPostScheduleForTenant",
		"CancelPostScheduleForTenant",
		"FindScheduledPublicationsForTenant",
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
	private static readonly PublishingRouteInventoryEntry[] PublishingRouteInventory = [
		// ── Publishing routes (must carry permission + rate limit) ─────────────
		new("/posts/publications", "GET", IsPublishing: true),
		new("/posts/{postId}/schedule", "POST", IsPublishing: true),
		new("/posts/{postId}/schedule", "PATCH", IsPublishing: true),
		new("/posts/{postId}/schedule", "DELETE", IsPublishing: true),
		// ── Non-publishing routes (listed to keep the set closed) ──────────────
		new("/posts", "POST", IsPublishing: false),
		new("/posts", "GET", IsPublishing: false),
		new("/posts/{postId}", "GET", IsPublishing: false),
		new("/posts/{postId}", "PATCH", IsPublishing: false),
		new("/posts/{postId}", "DELETE", IsPublishing: false),
		new("/posts/{postId}/image", "POST", IsPublishing: false),
		new("/posts/{postId}/image", "DELETE", IsPublishing: false),
	];

	// ── (b) Single SKIP LOCKED claimant on publications ─────────────────────

	private const string DueScanJobRelativePath =
		"Modules/Publishing/Jobs/DispatchDuePostsJob.cs";

	// The scan must see AT LEAST the sanctioned claim itself; zero means the
	// lexical pass collapsed and failed open — never trust a silent empty scan.
	private const int MinimumTotalSkipLockedMatches = 1;

	private const string SkipLockedToken = "SKIP LOCKED";
	private const string PublicationsTableToken = "publications";

	private readonly RouteMapFactory _factory = new();

	public void Dispose() {
		_factory.Dispose();
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
		var endpoints = GetRouteEndpoints();

		// (a1) Every publishing route by name still carries permission + rate limit.
		foreach (var name in PublishingRouteEndpointNames) {
			var endpoint = endpoints.SingleOrDefault(route =>
				route.Metadata.GetMetadata<IEndpointNameMetadata>()?.EndpointName
					== name
			);
			_ = endpoint.Should().NotBeNull(
				"publishing tenant route '{0}' must exist on the live route map; "
					+ "if it was renamed, reconcile this closed-set guard",
				name
			);

			_ = endpoint!.Metadata.OfType<HasPermissionMetadata>()
				.Should().NotBeEmpty(
					"'{0}' must declare .WithTenantPermission(...) so the scheduling "
						+ "surface can never ship without explicit permission metadata",
					name
				);

			var ratePolicy = endpoint.Metadata
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
				Path = NormalizeRoutePath(
					endpoint.RoutePattern.RawText ?? string.Empty),
				Method = GetHttpMethod(endpoint),
				Endpoint = endpoint
			})
			.ToList();

		_ = postsRoutesOnMap.Should().NotBeEmpty(
			"the closed-set guard enumerates /posts/* routes from the live route "
			+ "map; an empty enumeration would silently pass every assertion"
		);

		var unknownRoutes = new List<string>();
		foreach (var entry in postsRoutesOnMap) {
			var match = PublishingRouteInventory.FirstOrDefault(inv =>
				string.Equals(
					NormalizeRoutePath(inv.Path),
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
					&& !PublishingRouteEndpointNames.Contains(
						endpointName, StringComparer.Ordinal)) {
					unknownRoutes.Add(
						$"{entry.Method} {entry.Path} (endpoint '{endpointName}' "
						+ "classified as publishing but absent from "
						+ "PublishingRouteEndpointNames)"
					);
				}
			}
		}

		_ = unknownRoutes.Should().BeEmpty(
			"every /posts/* route must be explicitly inventoried as publishing or "
			+ "non-publishing — an unlisted route silently bypasses permission + "
			+ "rate-limit enforcement; add it to PublishingRouteInventory with its "
			+ "classification (isPublishing flag):\n{0}",
			string.Join("\n", unknownRoutes)
		);

		// (a3) The inventory count matches the route map — the closed set is
		// complete. If a route was removed from the API, this fails, forcing the
		// inventory to ratchet down.
		_ = postsRoutesOnMap.Should().HaveCount(
			PublishingRouteInventory.Length,
			"the /posts/* route count on the live map must equal the explicit "
			+ "inventory length; adding or removing a route requires reconciling "
			+ "this closed set"
		);
	}

	// ── (b) Only the due-scan job SKIP LOCKs publications rows ──────────────

	[Fact]
	public void ItShouldLetOnlyTheDueScanJobLockPublicationRowsWithSkipLocked() {
		var apiRoot = FindApiRoot();
		var sources = EnumerateApiSources(apiRoot);

		_ = sources.Should().NotBeEmpty(
			"an empty enumeration would silently drop the single-claimant "
				+ "guarantee"
		);

		// Specs are excluded (same precedent as PublicationArchitectureSpec):
		// they quote SQL corpora and host this detector's own doc comments.
		var scan = ScanForUpdateSkipLockedOnPublications(
			sources.Where(entry => !entry.RelativePath.EndsWith(
					".Spec.cs",
					StringComparison.Ordinal
				))
				.ToList()
		);

		_ = scan.TotalMatches.Should().BeGreaterThanOrEqualTo(
			MinimumTotalSkipLockedMatches,
			"the sanctioned due-scan claim alone must be visible; a near-zero "
				+ "count means the lexical scan collapsed and failed open"
		);

		_ = scan.SanctionedByFile.GetValueOrDefault(DueScanJobRelativePath)
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
			DueScanJobRelativePath,
			scan.Offenders.Count,
			string.Join("\n", scan.Offenders.Take(20))
		);
	}

	// ── Helpers ──────────────────────────────────────────────────────────────

	private IReadOnlyList<RouteEndpoint> GetRouteEndpoints() {
		using var scope = _factory.Services.CreateScope();
		var dataSource = scope.ServiceProvider
			.GetRequiredService<EndpointDataSource>();

		return dataSource.Endpoints
			.OfType<RouteEndpoint>()
			.ToList();
	}

	private static string NormalizeRoutePath(string path) {
		// ASP.NET Core route templates may or may not carry a trailing slash
		// depending on how they were registered (e.g. .MapPost("/") on a group
		// at /posts yields "/posts/"). Trim trailing slashes so the inventory
		// matches consistently. The root path "/" is preserved as-is.
		if (path.Length > 1) {
			path = path.TrimEnd('/');
		}
		return path;
	}

	private static string GetHttpMethod(RouteEndpoint endpoint) {
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

	private sealed record ForUpdateScan(
		int TotalMatches,
		Dictionary<string, int> SanctionedByFile,
		List<string> Offenders
	);

	private static ForUpdateScan ScanForUpdateSkipLockedOnPublications(
		IReadOnlyList<(string RelativePath, string Source)> sources
	) {
		var offenders = new List<string>();
		var sanctionedByFile = new Dictionary<string, int>(StringComparer.Ordinal);
		var total = 0;

		foreach (var (relativePath, rawSource) in sources) {
			// Comments legitimately DISCUSS locking strategies (seeder docs, job
			// docs); only executable code can claim rows. Ordinary string literals
			// carry DESCRIPTIONS (data), so their contents are blanked too — raw
			// string literals ("""…"""), where executable SQL lives, stay
			// scannable. Both passes preserve length for line attribution.
			var source = BlankCommentsAndDataStrings(rawSource);
			var index = 0;
			while ((index = source.IndexOf(
						SkipLockedToken,
						index,
						StringComparison.OrdinalIgnoreCase
					)) >= 0) {
				// Attribute the occurrence to its enclosing SQL statement:
				// everything from the previous statement terminator to the token.
				// A statement window (not a whole-file search) keeps co-located
				// claims on OTHER tables (job_queue, email_prepared_sends, …)
				// clean while still flagging any publications-row claimant.
				var statementStart =
					source.LastIndexOf(';', Math.Max(index - 1, 0)) + 1;
				var statement = source[statementStart..index];

				if (statement.Contains(
						PublicationsTableToken,
						StringComparison.OrdinalIgnoreCase
					)) {
					total++;

					if (string.Equals(
							relativePath,
							DueScanJobRelativePath,
							StringComparison.Ordinal
						)) {
						sanctionedByFile[relativePath] =
							sanctionedByFile.GetValueOrDefault(relativePath) + 1;
					} else {
						offenders.Add(
							$"{relativePath}:{LineOfOffset(source, index)}: "
								+ $"{Flatten(statement + SkipLockedToken)}"
						);
					}
				}

				index += SkipLockedToken.Length;
			}
		}

		return new ForUpdateScan(total, sanctionedByFile, offenders);
	}

	private static IReadOnlyList<(string RelativePath, string Source)>
		EnumerateApiSources(string apiRoot) {
		return Directory
			.EnumerateFiles(apiRoot, "*.cs", SearchOption.AllDirectories)
			.Select(path => (
				FullPath: path,
				RelativePath: Path.GetRelativePath(apiRoot, path)
					.Replace('\\', '/')
			))
			.Where(entry => !IsGeneratedOutput(entry.RelativePath))
			.OrderBy(entry => entry.RelativePath, StringComparer.Ordinal)
			.Select(entry => (entry.RelativePath, File.ReadAllText(entry.FullPath)))
			.ToList();
	}

	private static bool IsGeneratedOutput(string relativePath) {
		return relativePath.StartsWith("bin/", StringComparison.Ordinal)
			|| relativePath.StartsWith("obj/", StringComparison.Ordinal)
			|| relativePath.StartsWith(".artifacts/", StringComparison.Ordinal)
			|| relativePath.Contains("/bin/", StringComparison.Ordinal)
			|| relativePath.Contains("/obj/", StringComparison.Ordinal)
			|| relativePath.Contains("/.artifacts/", StringComparison.Ordinal);
	}

	// The test assembly runs from apps/api/.artifacts/bin/...; walk up until the
	// directory containing PublyApp.Api.csproj (the apps/api root).
	private static string FindApiRoot() {
		var directory = new DirectoryInfo(AppContext.BaseDirectory);
		while (directory is not null) {
			if (File.Exists(
					Path.Combine(directory.FullName, "PublyApp.Api.csproj")
				)) {
				return directory.FullName;
			}

			directory = directory.Parent;
		}

		throw new InvalidOperationException(
			"Could not locate the apps/api root (PublyApp.Api.csproj) above "
				+ AppContext.BaseDirectory
		);
	}

	private static string BlankCommentsAndDataStrings(string source) {
		var chars = source.ToCharArray();
		var i = 0;
		while (i < chars.Length) {
			if (i + 1 < chars.Length && chars[i] == '/' && chars[i + 1] == '/') {
				while (i < chars.Length && chars[i] != '\n') {
					chars[i++] = ' ';
				}
			} else if (i + 1 < chars.Length && chars[i] == '/'
				&& chars[i + 1] == '*') {
				chars[i] = ' ';
				chars[i + 1] = ' ';
				i += 2;
				while (i + 1 < chars.Length
					&& !(chars[i] == '*' && chars[i + 1] == '/')) {
					if (chars[i] != '\n') {
						chars[i] = ' ';
					}

					i++;
				}

				if (i + 1 < chars.Length) {
					chars[i] = ' ';
					chars[i + 1] = ' ';
					i += 2;
				}
			} else if (IsRawStringDelimiter(chars, i)) {
				// Raw string literal: EXECUTABLE SQL territory — keep contents.
				i += RawStringLength(chars, i);
			} else if (chars[i] == '"') {
				// Ordinary/interpolated single-line string: data (descriptions,
				// log text). Blank the contents but keep the delimiters so
				// offsets — and therefore line numbers — stay valid.
				i++;
				while (i < chars.Length && chars[i] != '"' && chars[i] != '\n') {
					if (chars[i] != '\\') {
						chars[i] = ' ';
					}

					i += chars[i] == '\\' ? 2 : 1;
				}

				i++;
			} else if (chars[i] == '\'') {
				i++;
				while (i < chars.Length && chars[i] != '\'' && chars[i] != '\n') {
					i += chars[i] == '\\' ? 2 : 1;
				}

				i++;
			} else {
				i++;
			}
		}

		return new string(chars);
	}

	// Detects the start of a raw string literal: optional '$', then three or
	// more quotes (C# 11 raw strings — the shape every ExecuteSqlInterpolated
	// claim in this repo uses).
	private static bool IsRawStringDelimiter(char[] chars, int i) {
		if (chars[i] == '$') {
			i++;
		}

		return i + 2 < chars.Length && chars[i] == '"'
			&& chars[i + 1] == '"' && chars[i + 2] == '"';
	}

	// Walks a raw string literal starting at its delimiter and returns how far
	// to jump: past the closing quote run of equal length.
	private static int RawStringLength(char[] chars, int start) {
		var i = start;
		var dollar = chars[i] == '$';
		if (dollar) {
			i++;
		}

		var quotes = 0;
		while (i < chars.Length && chars[i] == '"') {
			quotes++;
			i++;
		}

		while (i < chars.Length) {
			if (chars[i] == '"') {
				var run = 0;
				while (i < chars.Length && chars[i] == '"') {
					run++;
					i++;
				}

				if (run == quotes) {
					return i - start;
				}
			} else {
				i++;
			}
		}

		return i - start;
	}

	private static int LineOfOffset(string source, int offset) {
		var line = 1;
		for (var i = 0; i < offset && i < source.Length; i++) {
			if (source[i] == '\n') {
				line++;
			}
		}

		return line;
	}

	private static string Flatten(string snippet) {
		var flattened = WhitespaceRun().Replace(snippet, " ").Trim();
		return flattened.Length <= 140 ? flattened : flattened[..140] + "…";
	}

	[GeneratedRegex(@"\s+")]
	private static partial Regex WhitespaceRun();

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
