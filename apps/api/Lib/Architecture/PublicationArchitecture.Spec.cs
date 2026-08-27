using System.Text.RegularExpressions;

using FluentAssertions;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Publishing.Entities;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Publishing-specific architecture ratchet (Epic D §2/D1): exactly ONE type may
/// write <see cref="Publication.Status"/> — PublicationStatusTransitionService.
/// Round-2 hardening (adversarial review of PR #1433): the original line-by-line
/// substring scan was bypassable (multi-line assignments, writes outside Modules,
/// and "pub." heuristics) and was replaced by a Roslyn SEMANTIC walk over every
/// .cs file under apps/api/ — production AND tests (bin/obj/.artifacts excluded).
/// Writes are found syntactically (plain and compound assignments, including those
/// inside object and with initialisers; the EF ExecuteUpdate SetProperty seam; raw
/// SQL updating the publications table) and classified by SYMBOL: the write target
/// must resolve to the declared Publication.Status property, not merely look like
/// it. Formatting, variable naming and file location no longer matter. Test
/// fixture files that SEED publication rows are baselined by explicit path (stale
/// entries fail, so the baseline ratchets down). An unresolved write target is
/// treated as guilty until explained, so a degraded scan fails closed. Fail-loud
/// guarantees: the guard goes RED if the transition service file is missing, if
/// fewer than its six sanctioned writes are seen (collapsed semantic walk), or if
/// a baselined file no longer writes status. Proven RED by planting rogue writers
/// in Modules and Infrastructure (see .dump/guard-r2-red-*.log and
/// .dump/mutation-rogue-writer.md). Former residual gap CLOSED by #1446 and
/// hardened in round 2 of its own review: a reflection writer
/// (<c>GetProperty("Status").SetValue</c>) or SQL assembled from pieces can no
/// longer slip past this scan unseen, because the runtime containment
/// (Modules/Publishing/Lib/PublicationStatusWriteGuard — SaveChanges and command
/// interceptors wired in AppDbContext.OnConfiguring, stamped only by
/// PublicationStatusTransitionService) refuses any unstamped Status write at
/// execution time. Round 2 closed the last runtime holes the round-1 review
/// proved open: the raw-SQL matcher is no longer anchored at start-of-text
/// (a leading WITH CTE or block comment defeated it), runs to semicolon or
/// end-of-text when no clause terminator exists, strips comments before
/// matching (a comment QUOTING an update is not an update), and intercepts
/// raw commands at Execution time — NOT at creation — on both synchronous and
/// asynchronous paths: ExecuteSqlRawAsync / FromSqlAsync drive
/// NonQueryExecutingAsync / ReaderExecutingAsync (via IDbCommandInterceptor),
/// so the async hole round 1 left open is now covered. The round-2 claim of a
/// "CommandCreatedAsync" hook was wrong — that member does not exist on the
/// EF Core 10 interceptor interface (strings grep of
/// Microsoft.EntityFrameworkCore.Relational.dll lists CommandNonQueryExecutingAsync
/// / ReaderExecutingAsync / ScalarExecutingAsync but no CommandCreatedAsync), so
/// a method by that name is unreachable dead code. PublicationStatusWriteGuardSpec
/// pins all of this against real Postgres, including a FromSqlAsync variant.
/// What remains genuinely out of reach, named rather than denied: commands
/// this DbContext never creates — a psql session, another process, another
/// context type.
/// </summary>
public sealed partial class PublicationArchitectureSpec {
	// The single legal writer, relative to apps/api/ with forward slashes.
	private const string TransitionServiceRelativePath =
		"Modules/Publishing/Services/PublicationStatusTransitionService.cs";

	// One status write per Mark*/Reschedule* method (six today). Seeing fewer means
	// the semantic walk collapsed and failed open — never trust an empty scan.
	private const int MinimumSanctionedWrites = 6;

	// Test fixtures that CONSTRUCT publication rows with an initial status (seeding,
	// not lifecycle mutation). Explicit paths, never a glob: planting a fourth file
	// forces reconciliation here, and a file that stops writing leaves the baseline.
	private static readonly HashSet<string> BaselineTestSeedFiles = new(
		StringComparer.Ordinal
	) {
		"Modules/Publishing/Services/PublicationQueueService.Spec.cs",
		"Modules/Publishing/Services/PublicationStatusTransitionService.Spec.cs",
		"Modules/Publishing/Jobs/PublishPublicationJobHandler.Spec.cs",
		"Modules/Publishing/Lib/PostStatusDerivation.Spec.cs",
		"Modules/SocialAccounts/Handlers/Tenant/SocialAccountPublicationLifecycle.Spec.cs",
		// #168 (develop): usage metrics seed publication rows for tenant usage.
		"Modules/Tenants/Services/TenantUsageService.Spec.cs",

		// #1446: this spec seeds rows AND deliberately commits the crimes (a
		// reflection write and a direct write) to prove the runtime containment
		// fires; its writes are arrange-time seeds and guarded-refusal setups.
		"Modules/Publishing/Lib/PublicationStatusWriteGuard.Spec.cs",
	};

	private const string PublicationFullNamespace =
		"PublyApp.Api.Modules.Publishing.Entities";

	// The API project enables ImplicitUsings; parsed files carry their own usings,
	// but global usings are not inherited from references, so the scan replicates
	// the API project's generated set (PublyApp.Api.GlobalUsings.g.cs) verbatim.
	private const string ImplicitUsingsSource = """
		global using Microsoft.AspNetCore.Builder;
		global using Microsoft.AspNetCore.Hosting;
		global using Microsoft.AspNetCore.Http;
		global using Microsoft.AspNetCore.Routing;
		global using Microsoft.Extensions.Configuration;
		global using Microsoft.Extensions.DependencyInjection;
		global using Microsoft.Extensions.Hosting;
		global using Microsoft.Extensions.Logging;
		global using System;
		global using System.Collections.Generic;
		global using System.IO;
		global using System.Linq;
		global using System.Net.Http;
		global using System.Net.Http.Json;
		global using System.Threading;
		global using System.Threading.Tasks;
		""";

	private static readonly CSharpParseOptions ScanParseOptions = new(
		languageVersion: LanguageVersion.Preview,
		documentationMode: DocumentationMode.Parse
	);

	// Framework + package references harvested from the loaded test domain; the API
	// assemblies are EXCLUDED so application types bind to the parsed SOURCE trees
	// (the scan sees exactly what is on disk, never a stale compiled artifact).
	// Duplicate simple names occur in test hosts (same assembly loaded twice), so
	// resolution is a deterministic first-wins dictionary keyed by simple name.
	private static readonly Lazy<IReadOnlyList<PortableExecutableReference>>
		ScanReferences = new(BuildScanReferences);

	private static IReadOnlyList<PortableExecutableReference> BuildScanReferences() {
		var locations = new Dictionary<string, string>(StringComparer.Ordinal);

		// Assemblies already loaded in the test host (packages, framework pieces
		// the host happens to touch).
		foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies()) {
			if (assembly.IsDynamic) {
				continue;
			}

			AddAssemblyLocation(locations, assembly.GetName().Name, assembly.Location);
		}

		// A filtered test run may never have touched the ASP.NET Core stack, yet
		// scanned production code binds against it (HttpContext and friends), so
		// the shared frameworks are enumerated from disk next to the runtime.
		foreach (var (name, path) in SharedFrameworkAssemblies()) {
			AddAssemblyLocation(locations, name, path);
		}

		// A filtered run also misses NuGet dependencies the host never touched
		// (Quartz, Scalar, ...); the API build output carries them all on disk.
		foreach (var (name, path) in ApiOutputAssemblies()) {
			AddAssemblyLocation(locations, name, path);
		}

		return locations.Values
			.Select(path => MetadataReference.CreateFromFile(path))
			.ToList();
	}

	private static void AddAssemblyLocation(
		Dictionary<string, string> locations,
		string? name,
		string location
	) {
		if (name is null || name.Length == 0 || location.Length == 0) {
			return;
		}

		if (name.StartsWith("PublyApp.Api", StringComparison.Ordinal)) {
			// Application types must bind to the parsed SOURCE trees, never a
			// possibly stale compiled artifact.
			return;
		}

		locations.TryAdd(name, location);
	}

	// AppContext.BaseDirectory ends in .artifacts/bin/PublyApp.Api.Tests/<cfg>/<tfm>;
	// three levels up is .artifacts/bin, whose PublyApp.Api subtree holds the API
	// binaries plus every NuGet dependency the filtered run may not have loaded.
	private static IEnumerable<(string Name, string Path)> ApiOutputAssemblies() {
		var binRoot = Path.GetFullPath(
			Path.Combine(AppContext.BaseDirectory, "..", "..", "..")
		);
		if (!Directory.Exists(binRoot)) {
			yield break;
		}

		foreach (var projectDir in Directory.EnumerateDirectories(
				binRoot,
				"PublyApp.Api",
				SearchOption.TopDirectoryOnly
			)) {
			foreach (var dll in Directory.EnumerateFiles(
					projectDir,
					"*.dll",
					SearchOption.AllDirectories
				)) {
				yield return (
					Path.GetFileNameWithoutExtension(dll),
					dll
				);
			}
		}
	}

	private static IEnumerable<(string Name, string Path)> SharedFrameworkAssemblies() {
		var coreLib = typeof(object).Assembly.Location;
		var netCoreDir = Path.GetDirectoryName(coreLib);
		if (netCoreDir is null || !Directory.Exists(netCoreDir)) {
			yield break;
		}

		foreach (var dll in Directory.EnumerateFiles(
				netCoreDir,
				"*.dll",
				SearchOption.TopDirectoryOnly
			)) {
			yield return (
				Path.GetFileNameWithoutExtension(dll),
				dll
			);
		}

		// .../dotnet/shared/Microsoft.NETCore.App/<v>/ -> .../dotnet/shared
		var sharedRoot = Path.GetDirectoryName(
			Path.GetDirectoryName(netCoreDir)
		);
		if (sharedRoot is null || !Directory.Exists(sharedRoot)) {
			yield break;
		}

		var aspnetVersions = Path.Combine(
			sharedRoot,
			"Microsoft.AspNetCore.App"
		);
		if (!Directory.Exists(aspnetVersions)) {
			yield break;
		}

		var newest = Directory
			.EnumerateDirectories(aspnetVersions)
			.OrderBy(path => path, StringComparer.Ordinal)
			.Last();
		foreach (var dll in Directory.EnumerateFiles(
				newest,
				"*.dll",
				SearchOption.TopDirectoryOnly
			)) {
			yield return (
				Path.GetFileNameWithoutExtension(dll),
				dll
			);
		}
	}

	private static readonly HashSet<SyntaxKind> SqlStringTokenKinds = [
		SyntaxKind.StringLiteralToken,
		SyntaxKind.Utf8StringLiteralToken,
		SyntaxKind.SingleLineRawStringLiteralToken,
		SyntaxKind.MultiLineRawStringLiteralToken,
		SyntaxKind.Utf8SingleLineRawStringLiteralToken,
		SyntaxKind.Utf8MultiLineRawStringLiteralToken,
		SyntaxKind.InterpolatedStringTextToken,
	];

	[Fact]
	public void ItShouldConfigureCkPublicationStatusWithExactlyTheEnumValues() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=publication_architecture_guard")
			.Options;

		using var dbContext = new AppDbContext(options);
		var model = dbContext.GetService<IDesignTimeModel>().Model;
		var entity = model.FindEntityType(typeof(Publication));
		entity.Should().NotBeNull();

		var constraint = entity!
			.GetCheckConstraints()
			.SingleOrDefault(c => c.Name == "CK_Publication_Status");
		constraint.Should().NotBeNull(
			"CK_Publication_Status must be configured in PublicationConfiguration"
		);
		constraint!.Sql.Should().Be(
			"status IN (10, 20, 30, 40, 50)",
			"PublicationStatus enum values are 10/Scheduled through 50/Paused"
		);
	}

	[Fact]
	public void ItShouldKeepTheUniquePairPartialAndTheTwoQueryIndexes() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=publication_architecture_guard")
			.Options;

		using var dbContext = new AppDbContext(options);
		var model = dbContext.GetService<IDesignTimeModel>().Model;
		var entity = model.FindEntityType(typeof(Publication));
		entity.Should().NotBeNull();

		var unique = entity!.GetIndexes().SingleOrDefault(i =>
			i.GetDatabaseName() == "ux_publications_post_account"
		);
		unique.Should().NotBeNull("one ACTIVE delivery per (post, account)");
		unique!.IsUnique.Should().BeTrue();
		// Round-2 widening: the partial filter must ALSO exclude terminal Failed
		// rows so a failed publish-now is re-issuable (fresh attempt starts beside
		// the failed history row), while Published rows keep occupying the pair.
		// Proven discriminating by the .dump/guard-r2-filter-*.log mutation pair:
		// reverting the model filter alone turns this RED.
		unique.GetFilter().Should().Be(
			"is_deleted = false AND status <> 40",
			"a cancelled-and-recreated pair must be free again AND a terminal Failed "
				+ "row must release the pair; Published rows stay live"
		);

		var dueScan = entity.GetIndexes().SingleOrDefault(i =>
			i.GetDatabaseName() == "ix_publications_status_scheduled_at"
		);
		dueScan.Should().NotBeNull("the D3 due-scan claims ordered by instant");
		dueScan!.Properties.Select(p => p.Name).Should().Equal(
			nameof(Publication.Status),
			nameof(Publication.ScheduledAtUtc)
		);

		var tenantKeyset = entity.GetIndexes().SingleOrDefault(i =>
			i.GetDatabaseName() == "ix_publications_tenant_scheduled_at_id"
		);
		tenantKeyset.Should().NotBeNull("tenant queue lists paginate keyset");
		tenantKeyset!.Properties.Select(p => p.Name).Should().Equal(
			nameof(Publication.TenantId),
			nameof(Publication.ScheduledAtUtc),
			nameof(Publication.Id)
		);
	}

	[Fact]
	public void ItShouldBoundTheTimeZoneColumnToTheVoLimit() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=publication_architecture_guard")
			.Options;

		using var dbContext = new AppDbContext(options);
		var model = dbContext.GetService<IDesignTimeModel>().Model;
		var entity = model.FindEntityType(typeof(Publication));
		entity.Should().NotBeNull();

		var zone = entity!.FindProperty(nameof(Publication.ScheduledTimeZone));
		zone.Should().NotBeNull();
		zone!.GetMaxLength().Should().Be(
			PublicationSchedule.MaxTimeZoneLength,
			"the column bound mirrors the VO validator"
		);
	}

	[Fact]
	public void ItShouldLetOnlyTheTransitionServiceWritePublicationStatus() {
		var apiRoot = FindApiRoot();
		var sources = EnumerateApiSourceFiles(apiRoot);

		_ = sources.Should().NotBeEmpty(
			"an empty scan must never pass: a vacuous enumeration would silently "
				+ "drop the single-writer guarantee"
		);

		_ = sources.Should().Contain(
			source => source.RelativePath == TransitionServiceRelativePath,
			"the sanctioned single writer {0} must exist; if it moved or was deleted, "
				+ "reconcile this guard instead of letting the scan pass without it",
			TransitionServiceRelativePath
		);

		var scan = ScanForPublicationStatusWriters(sources);

		_ = scan.SanctionedWrites.Should().BeGreaterThanOrEqualTo(
			MinimumSanctionedWrites,
			"the transition service owns one status write per Mark*/Reschedule* "
				+ $"method (six today); a smaller count means the semantic walk "
				+ "collapsed (missing references or usings) and failed open — "
				+ "reconcile the scan harness instead of trusting an empty result"
		);

		var staleBaselines = BaselineTestSeedFiles
			.Where(path => !scan.WritesByFile.ContainsKey(path))
			.OrderBy(path => path, StringComparer.Ordinal)
			.ToList();
		_ = staleBaselines.Should().BeEmpty(
			"every baselined test-seed file must still seed a status; a file that "
				+ "stopped writing status must LEAVE the baseline (ratchet down), "
				+ "not linger as a standing exemption. Stale:\n{0}",
			string.Join("\n", staleBaselines)
		);

		scan.RogueWriters.Should().BeEmpty(
			"only PublicationStatusTransitionService may write Publication.Status; "
				+ "found {0} rogue writer(s):\n{1}",
			scan.RogueWriters.Count,
			string.Join("\n", scan.RogueWriters.Take(20))
		);
	}

	// The detector is only as strong as what it provably discriminates: every rogue
	// shape (including the round-1 bypasses) must offend with a file:line
	// attribution, and reads / foreign-type writes must stay clean.
	[Fact]
	public void ItShouldDiscriminateEveryWriterShapeInTheDetectorItself() {
		var apiRoot = FindApiRoot();
		const string publicationPath = "Modules/Publishing/Entities/Publication.cs";
		var publicationSource = File.ReadAllText(
			Path.Combine(apiRoot, "Modules", "Publishing", "Entities", "Publication.cs")
		);

		static string Wrap(string body) {
			return "using PublyApp.Api.Modules.Publishing.Entities;\n"
				+ "using System;\n"
				+ "using System.Linq;\n\n"
				+ "public static class WriterProbe {\n"
				+ "    private sealed class OtherEntity { public int Status { get; set; } }\n\n"
				+ "    public static void Run(Publication p, PublicationStatus s) {\n"
				+ body
				+ "\n    }\n"
				+ "}\n";
		}

		(string Body, string Shape)[] knownBad = [
			("p.Status = s;", "direct one-line assignment"),
			// The round-1 bypass: assignment token and receiver on different lines.
			("p.Status\n        = s;", "multi-line assignment"),
			(
				"var created = new Publication { TenantId = Guid.NewGuid(), "
					+ "PostId = Guid.NewGuid(), SocialAccountId = Guid.NewGuid(), "
					+ "Status = s, ScheduledAtUtc = DateTime.UtcNow, "
					+ "ScheduledTimeZone = \"Etc/UTC\", IdempotencyKey = \"probe\" };",
				"object initialiser"
			),
			// Illegal against today's class entity (CS8858), but the DETECTOR must
			// still flag the shape should Publication ever become a record.
			("var moved = p with { Status = s };", "with initialiser"),
			("SetProperty(row => row.Status, s);", "SetProperty seam"),
			(
				"Console.WriteLine(\"UPDATE publications SET status = 20\");",
				"raw SQL update"
			),
		];

		foreach (var (body, shape) in knownBad) {
			var sources = new List<(string RelativePath, string Source)> {
				(publicationPath, publicationSource),
				($"Probe/{shape}.cs", Wrap(body)),
			};
			var scan = ScanForPublicationStatusWriters(sources);
			var expectedPrefix = $"Probe/{shape}.cs:";
			scan.RogueWriters.Should().HaveCount(
				1,
				$"detector must flag exactly one offender for the {shape} shape"
			);
			scan.RogueWriters[0].Should().StartWith(
				expectedPrefix,
				$"detector must attribute the {shape} shape to file:line"
			);
		}

		(string Body, string Shape)[] knownGood = [
			("if (p.Status == s) { return; }", "status comparison read"),
			(
				"var label = s switch { PublicationStatus.Failed => \"f\", _ => \"o\" };",
				"switch scrutinee read"
			),
			("_ = new[] { p }.Select(row => row.Status);", "projection read"),
			("_ = nameof(Publication.Status);", "nameof reference"),
			("new OtherEntity().Status = 42;", "write to a foreign Status property"),
		];

		foreach (var (body, shape) in knownGood) {
			var sources = new List<(string RelativePath, string Source)> {
				(publicationPath, publicationSource),
				($"Probe/{shape}.cs", Wrap(body)),
			};
			var scan = ScanForPublicationStatusWriters(sources);
			scan.RogueWriters.Should().BeEmpty(
				$"detector must not flag the {shape} shape; got: "
					+ string.Join(" | ", scan.RogueWriters)
			);
		}
	}

	private sealed record StatusWriterScan(
		int SanctionedWrites,
		IReadOnlyDictionary<string, int> WritesByFile,
		IReadOnlyList<string> RogueWriters
	);

	private static StatusWriterScan ScanForPublicationStatusWriters(
		IReadOnlyList<(string RelativePath, string Source)> sources
	) {
		var compilation = BuildScanCompilation(sources);
		var rogue = new List<string>();
		var writesByFile = new Dictionary<string, int>(StringComparer.Ordinal);

		foreach (var (relativePath, _) in sources) {
			var tree = compilation.SyntaxTrees.Single(candidate =>
				string.Equals(candidate.FilePath, relativePath, StringComparison.Ordinal)
			);
			var model = compilation.GetSemanticModel(tree);
			var root = tree.GetRoot();

			// Every assignment — plain, compound, or inside an object/with
			// initialiser — is an AssignmentExpressionSyntax node in the Roslyn
			// AST, so one pass covers all assignment-shaped writes regardless of
			// how the source is formatted across lines.
			foreach (var assignment in root.DescendantNodes()
						.OfType<AssignmentExpressionSyntax>()) {
				ClassifyAssignment(assignment, model, relativePath, writesByFile, rogue);
			}

			foreach (var invocation in root.DescendantNodes()
						.OfType<InvocationExpressionSyntax>()) {
				ClassifySetPropertyInvocation(
					invocation,
					model,
					relativePath,
					writesByFile,
					rogue
				);
			}

			if (relativePath.EndsWith(".Spec.cs", StringComparison.Ordinal)) {
				// Specs host this very detector's self-test corpora, which legally
				// QUOTE dangerous strings (same precedent as
				// CanaryProbeContainmentSpec skipping its own specs); specs also
				// never execute raw SQL against the live table.
				continue;
			}

			if (relativePath.StartsWith("Migrations/", StringComparison.Ordinal)) {
				// Migrations reshape data at deploy time by design; the invariant
				// guards RUNTIME write paths.
				continue;
			}

			foreach (var token in root.DescendantTokens()) {
				if (!SqlStringTokenKinds.Contains(token.Kind())) {
					continue;
				}

				var match = RawSqlPublicationUpdate().Match(token.ValueText);
				if (!match.Success) {
					continue;
				}

				var line = token.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
				rogue.Add(
					$"{relativePath}:{line}: raw SQL writes publications.status "
						+ $"({match.Value})"
				);
			}
		}

		var sanctioned = writesByFile.TryGetValue(
			TransitionServiceRelativePath,
			out var count
		)
			? count
			: 0;
		return new StatusWriterScan(sanctioned, writesByFile, rogue);
	}

	private static Compilation BuildScanCompilation(
		IReadOnlyList<(string RelativePath, string Source)> sources
	) {
		var trees = new List<SyntaxTree>(sources.Count + 1);
		foreach (var (relativePath, source) in sources) {
			trees.Add(CSharpSyntaxTree.ParseText(
				source,
				ScanParseOptions,
				path: relativePath
			));
		}

		trees.Add(CSharpSyntaxTree.ParseText(
			ImplicitUsingsSource,
			ScanParseOptions,
			path: "<replicated-global-usings>"
		));

		return CSharpCompilation.Create(
			"PublicationStatusWriterScan",
			trees,
			ScanReferences.Value,
			new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary)
		);
	}

	private static void ClassifyAssignment(
		AssignmentExpressionSyntax assignment,
		SemanticModel model,
		string relativePath,
		Dictionary<string, int> writesByFile,
		List<string> rogue
	) {
		var info = model.GetSymbolInfo(assignment.Left);

		if (info.Symbol is IPropertySymbol direct) {
			ClassifyResolvedTarget(
				direct,
				assignment,
				relativePath,
				writesByFile,
				rogue
			);
			return;
		}

		foreach (var candidate in info.CandidateSymbols) {
			if (candidate is IPropertySymbol property) {
				ClassifyResolvedTarget(
					property,
					assignment,
					relativePath,
					writesByFile,
					rogue
				);
				return;
			}
		}

		if (info.Symbol is not null || info.CandidateSymbols.Length > 0) {
			// Resolved, but not to a property: locals, parameters and fields can
			// never be a Publication.Status write.
			return;
		}

		if (assignment.Left is MemberAccessExpressionSyntax) {
			// A member access that refuses to bind is guilty until explained: a
			// degraded scan must fail closed, never silently pass.
			rogue.Add(
				$"{relativePath}:{LineOf(assignment)}: {SnippetOf(assignment)} "
					+ "[unresolved member-access write target — the scan could not "
					+ "bind this assignment, so it is treated as rogue until explained]"
			);
		}
		// Unresolved simple identifiers are plain local/parameter stores; they
		// cannot hide a property write, and a wholesale binding collapse is caught
		// by the MinimumSanctionedWrites floor instead.
	}

	private static void ClassifyResolvedTarget(
		IPropertySymbol property,
		SyntaxNode writeSite,
		string relativePath,
		Dictionary<string, int> writesByFile,
		List<string> rogue,
		string suffixNote = ""
	) {
		if (!IsPublicationStatusProperty(property)) {
			return;
		}

		RecordWrite(
			relativePath,
			LineOf(writeSite),
			SnippetOf(writeSite) + suffixNote,
			writesByFile,
			rogue
		);
	}

	private static void ClassifySetPropertyInvocation(
		InvocationExpressionSyntax invocation,
		SemanticModel model,
		string relativePath,
		Dictionary<string, int> writesByFile,
		List<string> rogue
	) {
		var invokedName = invocation.Expression switch {
			MemberAccessExpressionSyntax { Name: GenericNameSyntax genericMember } =>
				genericMember.Identifier.ValueText,
			MemberAccessExpressionSyntax { Name: IdentifierNameSyntax simpleMember } =>
				simpleMember.Identifier.ValueText,
			GenericNameSyntax generic => generic.Identifier.ValueText,
			IdentifierNameSyntax simple => simple.Identifier.ValueText,
			_ => null,
		};

		if (invokedName is not ("SetProperty" or "SetPropertyAsync")) {
			return;
		}

		foreach (var argument in invocation.ArgumentList.Arguments) {
			if (argument.Expression is not LambdaExpressionSyntax lambda) {
				continue;
			}

			if (lambda.Body is BlockSyntax) {
				continue;
			}

			if (UnwrapNode(lambda.Body)
				is not MemberAccessExpressionSyntax memberAccess) {
				continue;
			}

			var info = model.GetSymbolInfo(memberAccess);
			if (info.Symbol is IPropertySymbol seamTarget) {
				ClassifyResolvedTarget(
					seamTarget,
					invocation,
					relativePath,
					writesByFile,
					rogue,
					" [EF ExecuteUpdate SetProperty seam]"
				);
			} else if (info.Symbol is null
				&& info.CandidateSymbols.Length == 0) {
				rogue.Add(
					$"{relativePath}:{LineOf(invocation)}: "
						+ $"{SnippetOf(invocation)} [unresolved ExecuteUpdate "
						+ "SetProperty seam — treated as rogue until explained]"
				);
			}
		}
	}

	private static void RecordWrite(
		string relativePath,
		int line,
		string snippet,
		Dictionary<string, int> writesByFile,
		List<string> rogue
	) {
		writesByFile[relativePath] = writesByFile.GetValueOrDefault(relativePath) + 1;

		if (string.Equals(
				relativePath,
				TransitionServiceRelativePath,
				StringComparison.Ordinal
			)) {
			return;
		}

		if (BaselineTestSeedFiles.Contains(relativePath)) {
			return;
		}

		rogue.Add($"{relativePath}:{line}: {snippet}");
	}

	private static bool IsPublicationStatusProperty(IPropertySymbol property) {
		return property.Name == "Status"
			&& property.ContainingType.Name == "Publication"
			&& property.ContainingType.OriginalDefinition.ContainingNamespace
				.ToDisplayString() == PublicationFullNamespace;
	}

	private static CSharpSyntaxNode UnwrapNode(CSharpSyntaxNode node) {
		var current = node;
		while (current is ParenthesizedExpressionSyntax parenthesised) {
			current = parenthesised.Expression;
		}

		while (current is CastExpressionSyntax cast) {
			current = cast.Expression;
		}

		return current;
	}

	private static int LineOf(SyntaxNode node) {
		return node.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
	}

	private static string SnippetOf(SyntaxNode node) {
		var flattened = WhitespaceRun().Replace(node.ToString(), " ").Trim();
		return flattened.Length <= 140 ? flattened : flattened[..140] + "…";
	}

	private static IReadOnlyList<(string RelativePath, string Source)>
		EnumerateApiSourceFiles(string apiRoot) {
		var sources = Directory
			.EnumerateFiles(apiRoot, "*.cs", SearchOption.AllDirectories)
			.Select(path => (
				FullPath: path,
				RelativePath: Path.GetRelativePath(apiRoot, path).Replace('\\', '/')
			))
			.Where(entry => !IsGeneratedOutput(entry.RelativePath))
			.OrderBy(entry => entry.RelativePath, StringComparer.Ordinal)
			.Select(entry => (entry.RelativePath, File.ReadAllText(entry.FullPath)))
			.ToList();
		return sources;
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

	// ── D2 (Task 5): publishing surface ratchet extensions ─────────────

	// Every route mapped inside Modules/Publishing/Endpoints/** must carry BOTH a
	// rate-limit policy and tenant-permission metadata ON ITS OWN CHAIN. Group-level
	// middleware alone does not satisfy this fact: the ratchet wants each endpoint's
	// contract readable at the mapping site (plan D2 Task 5 fact a).
	[Fact]
	public void ItShouldKeepEveryPublishingEndpointPermissionedAndRateLimited() {
		var apiRoot = FindApiRoot();
		var endpointsRoot = Path.Combine(
			apiRoot, "Modules", "Publishing", "Endpoints"
		);

		_ = Directory.Exists(endpointsRoot).Should().BeTrue(
			"the publishing endpoints directory must exist; if it moved, reconcile "
				+ "this guard"
		);

		var offenders = new List<string>();
		var scannedAny = false;

		foreach (var file in EnumerateSourceFiles(endpointsRoot)) {
			scannedAny = true;
			var relative = Path.GetRelativePath(apiRoot, file).Replace('\\', '/');
			var text = File.ReadAllText(file);
			var segments = SplitIntoMappingSegments(text);

			foreach (var (startLine, segment) in segments) {
				if (!segment.Contains(
						".RequireRateLimiting(",
						StringComparison.Ordinal
					)) {
					offenders.Add(
						$"{relative}:{startLine}: mapping without an explicit "
							+ "RequireRateLimiting policy"
					);
				}

				if (!segment.Contains(
						".WithTenantPermission(",
						StringComparison.Ordinal
					)) {
					offenders.Add(
						$"{relative}:{startLine}: mapping without "
							+ "WithTenantPermission metadata"
					);
				}
			}
		}

		// Round-2 widening: publishing surfaces may be mapped OUTSIDE the Publishing
		// module — POST /posts/{postId}/publish-now is handled by
		// PublishNowForTenant but mapped under Modules/Posts/Endpoints, where the
		// walk above never looked. Follow the HANDLER type: every *.cs outside the
		// Publishing module that maps a handler from the Publishing namespace must
		// carry the same on-chain rate-limit + tenant-permission metadata.
		foreach (var (relative, startLine, segment) in
			PublishingMappingsOutsideTheModule(apiRoot)) {
			scannedAny = true;

			if (!segment.Contains(
					".RequireRateLimiting(",
					StringComparison.Ordinal
				)) {
				offenders.Add(
					$"{relative}:{startLine}: publishing mapping outside "
						+ "Modules/Publishing without an explicit RequireRateLimiting "
						+ "policy"
				);
			}

			if (!segment.Contains(
					".WithTenantPermission(",
					StringComparison.Ordinal
				)) {
				offenders.Add(
					$"{relative}:{startLine}: publishing mapping outside "
						+ "Modules/Publishing without WithTenantPermission metadata"
				);
			}
		}

		_ = scannedAny.Should().BeTrue(
			"an empty endpoint enumeration must never pass vacuously"
		);
		offenders.Should().BeEmpty(
			"every publishing endpoint must be individually rate-limited and "
				+ "permission-gated; found {0} offender(s):\n{1}",
			offenders.Count,
			string.Join("\n", offenders)
		);
	}

	// Handlers orchestrate; services own queries. No PRODUCTION file under
	// Modules/Publishing/Handlers/** may mention AppDbContext. Co-located *.Spec.cs
	// files are exempt (they drive real HTTP round-trips against the hosted app and
	// follow the PostTenantCrud.Spec precedent).
	[Fact]
	public void ItShouldKeepDbContextOutOfPublishingHandlers() {
		var apiRoot = FindApiRoot();
		var handlersRoot = Path.Combine(
			apiRoot, "Modules", "Publishing", "Handlers"
		);

		_ = Directory.Exists(handlersRoot).Should().BeTrue(
			"the publishing handlers directory must exist; if it moved, reconcile "
				+ "this guard"
		);

		var offenders = EnumerateSourceFiles(handlersRoot)
			.Where(file => !file.EndsWith(".Spec.cs", StringComparison.Ordinal))
			.Select(file => (
				Relative: Path.GetRelativePath(apiRoot, file).Replace('\\', '/'),
				Text: File.ReadAllText(file)
			))
			.Where(entry => entry.Text.Contains(
				"AppDbContext",
				StringComparison.Ordinal
			))
			.Select(entry => entry.Relative)
			.ToList();

		offenders.Should().BeEmpty(
			"publishing handlers orchestrate results; DbContext access belongs to "
				+ "services. Files mentioning AppDbContext:\n{0}",
			string.Join("\n", offenders)
		);
	}

	// PublishNowService stays on infrastructure dependencies ONLY: AppDbContext +
	// IJobEnqueuer. A third dependency would mean domain-service chaining, which the
	// slice forbids (plan D2 Task 5 fact c).
	[Fact]
	public void ItShouldKeepPublishNowServiceOnInfrastructureDependenciesOnly() {
		var apiRoot = FindApiRoot();
		var serviceFile = Path.Combine(
			apiRoot,
			"Modules",
			"Publishing",
			"Services",
			"PublishNowService.cs"
		);
		var text = File.ReadAllText(serviceFile);

		var match = CtorParameterList().Match(text);
		_ = match.Success.Should().BeTrue(
			"PublishNowService must declare an explicit constructor"
		);

		var parameters = match.Groups[1].Value
			.Split(',', StringSplitOptions.TrimEntries)
			.Where(parameter => parameter.Length > 0)
			.Select(parameter => parameter.Split(' ')[0])
			.ToList();

		parameters.Should().BeEquivalentTo([
			"AppDbContext",
			"IJobEnqueuer",
		], because: "the publish-now service depends on infrastructure only "
			+ "(DbContext + job enqueuer), never another domain service");
	}


	// Enumerates endpoint mappings OUTSIDE Modules/Publishing whose handler type
	// resolves to the Publishing.Handlers namespace. Lexical containment of the
	// namespace-qualified handler reference inside one Map* segment keeps this
	// dependency-free; the segment boundaries come from the same splitter the
	// in-module walk uses.
	private static IEnumerable<(string RelativePath, int StartLine, string Segment)>
		PublishingMappingsOutsideTheModule(string apiRoot) {
		var modulesRoot = Path.Combine(apiRoot, "Modules");
		foreach (var file in EnumerateSourceFiles(modulesRoot)) {
			var relative = Path.GetRelativePath(apiRoot, file).Replace('\\', '/');
			if (relative.StartsWith("Modules/Publishing/", StringComparison.Ordinal)) {
				continue;
			}

			if (!file.Replace(Path.DirectorySeparatorChar, '/')
					.Contains("/Endpoints/", StringComparison.Ordinal)) {
				continue;
			}

			var text = File.ReadAllText(file);
			foreach (var (startLine, segment) in SplitIntoMappingSegments(text)) {
				if (segment.Contains(
						"PublyApp.Api.Modules.Publishing.Handlers",
						StringComparison.Ordinal
					)) {
					yield return (relative, startLine, segment);
				}
			}
		}
	}

	private static IEnumerable<string> EnumerateSourceFiles(string root) {
		return Directory
			.EnumerateFiles(root, "*.cs", SearchOption.AllDirectories)
			.Where(file => !file.Contains(
				$"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}",
				StringComparison.Ordinal
			) && !file.Contains(
				$"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}",
				StringComparison.Ordinal
			))
			.OrderBy(file => file, StringComparer.Ordinal);
	}

	private static IReadOnlyList<(int StartLine, string Segment)>
		SplitIntoMappingSegments(string text) {
		var pattern = EndpointMapping();
		var segments = new List<(int StartLine, string Segment)>();
		var matches = pattern.Matches(text);
		for (var index = 0; index < matches.Count; index++) {
			var start = matches[index].Index;
			var end = index + 1 < matches.Count
				? matches[index + 1].Index
				: text.Length;
			var line = text[..start].Count(character => character == '\n') + 1;
			segments.Add((line, text[start..end]));
		}

		return segments;
	}

	[GeneratedRegex(@"\bMap(?:Get|Post|Patch|Delete|Put)\s*\(")]
	private static partial Regex EndpointMapping();

	[GeneratedRegex(
		@"public\s+PublishNowService\s*\(([^)]*)\)",
		RegexOptions.Singleline
	)]
	private static partial Regex CtorParameterList();

	[GeneratedRegex(
		@"\bUPDATE\s+(?:ONLY\s+)?""?publications""?\b",
		RegexOptions.IgnoreCase
	)]
	private static partial Regex RawSqlPublicationUpdate();

	[GeneratedRegex(@"\s+")]
	private static partial Regex WhitespaceRun();
}
