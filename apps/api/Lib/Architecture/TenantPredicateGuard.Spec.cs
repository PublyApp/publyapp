using System.Text.RegularExpressions;

using FluentAssertions;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;
using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// #2460 guard: the global tenant query filter (<see cref="AppDbContext.TenantFilterName"/>)
/// scopes every tenant-filtered entity, so service and handler code must not repeat it by
/// hand. A hand-written <c>x.TenantId == ...</c> comparison in a statement that reads a
/// tenant-filtered entity fails here unless it is allow-listed with a reason. The allow-list
/// is exact: file + predicate text + count, so a new occurrence inside an allowed file still
/// fails and an entry that no longer matches anything fails too (it ratchets down).
/// Syntactic scan of <c>Modules/</c> only (not Lib, Infrastructure or Data). It reads <c>==</c>
/// comparisons on a <c>range.TenantId</c> member and resolves the range variable to the
/// collection it iterates (the receiver of the Where/Any call, or the from/join source).
/// Blind spots, named so nobody assumes wider coverage: a predicate on a local query variable
/// (<c>var q = db.Post.AsQueryable(); q.Where(x => x.TenantId == t)</c>, the most common shape
/// of a miss), a navigation (<c>p.Project.TenantId == t</c>), <c>.TenantId.Equals(t)</c>,
/// a pattern (<c>p.TenantId is { } id</c>), and anything outside <c>Modules/</c>.
/// Admission proof, maintenance cost and retirement condition: AGENTS.md, « Admission
/// (tenant predicate guard) ».
/// </summary>
public sealed partial class TenantPredicateGuardSpec {
	private sealed record Allowed(string File, string Predicate, int Count, string Reason);

	private sealed record Hit(string File, string Predicate);

	// Every kept predicate the scan sees carries a one-line comment in the code saying why (#2460), except TenantAsStaffService (its function is over the complexity cap, so it stays untouched): its why is the allow-list reason.
	private static readonly Allowed[] _AllowList = [
		new(
			"Modules/Publishing/Services/PublicationStatusTransitionService.cs",
			"publication.TenantId == tenantId",
			1,
			"DispatchDuePostsJob moves rows across tenants on an unscoped context through this service"
		),
		new(
			"Modules/Tenants/Services/TenantAsStaffService.cs",
			"tenant.Id == project.TenantId",
			1,
			"staff tenant list counts the projects of many tenants at once"
		),
		new(
			"Modules/Permissions/Services/PermissionService.cs",
			"x.TenantId == tenantId",
			2,
			"column is UserAccount.TenantId (UserAccount is not tenant-filtered), projected through a join with UserAccountRole"
		),
	];

	[Fact]
	public void ItShouldFindNoUnlistedHandWrittenTenantPredicateOnAFilteredEntity() {
		var apiRoot = ApiSourceRoot.Find();
		var names = TenantPredicateGuardSpec._FilteredEntityNames();
		var hits = Directory
			.EnumerateFiles(Path.Combine(apiRoot, "Modules"), "*.cs", SearchOption.AllDirectories)
			.Where(file => !file.EndsWith(".Spec.cs", StringComparison.Ordinal))
			.SelectMany(file => TenantPredicateGuardSpec._Scan(
				Path.GetRelativePath(apiRoot, file).Replace('\\', '/'),
				File.ReadAllText(file),
				names
			))
			.ToList();

		string.Join('\n', TenantPredicateGuardSpec._Mismatches(hits, TenantPredicateGuardSpec._AllowList))
			.Should().BeEmpty(
				"the tenant query filter already scopes these entities; drop the predicate, or allow-list it "
				+ "with a reason (and a one-line comment) if it is a justified exception"
			);
	}

	[Fact]
	public void ItShouldCatchAPredicateOnAFilteredEntityAndIgnoreTheRest() {
		var names = TenantPredicateGuardSpec._FilteredEntityNames();
		const string source = """
			class C {
				void M() {
					var a = db.Post.Where(p => p.TenantId == tenantId);
					var b = db.Post.Where(p => tenantId == p.TenantId);
					var c = db.UserAccount.Where(u => u.TenantId == tenantId);
					var d = db.Post.Where(p => p.Id == id);
					var e = db.Post.Where(p => this.TenantId == null || p.TenantId == this.TenantId);
				}
			}
			""";

		var hits = TenantPredicateGuardSpec._Scan("C.cs", source, names);

		hits.Select(hit => hit.Predicate).Should().Equal(
			"p.TenantId == tenantId",
			"tenantId == p.TenantId",
			"p.TenantId == this.TenantId"
		);
	}

	[Fact]
	public void ItShouldFailWhenAnAllowedFileGainsAnOccurrenceOrLosesOne() {
		var allowed = new[] { new Allowed("F.cs", "p.TenantId == tenantId", 1, "reason") };
		var hit = new Hit("F.cs", "p.TenantId == tenantId");

		TenantPredicateGuardSpec._Mismatches([hit], allowed).Should().BeEmpty();
		TenantPredicateGuardSpec._Mismatches([hit, hit], allowed).Should().HaveCount(1);
		TenantPredicateGuardSpec._Mismatches([], allowed).Should().HaveCount(1);
	}

	private static List<string> _Mismatches(IReadOnlyList<Hit> hits, Allowed[] allowList) {
		var found = hits.GroupBy(hit => (hit.File, hit.Predicate)).ToDictionary(g => g.Key, g => g.Count());
		var allowed = allowList.ToDictionary(entry => (entry.File, entry.Predicate), entry => entry.Count);
		var problems = new List<string>();
		foreach (var (key, count) in found) {
			var expected = allowed.GetValueOrDefault(key);
			if (count != expected) {
				problems.Add($"{key.File}: `{key.Predicate}` found {count}x, allow-list says {expected}x");
			}
		}

		problems.AddRange(allowed.Keys
			.Where(key => !found.ContainsKey(key))
			.Select(key => $"{key.File}: allow-listed `{key.Predicate}` no longer exists, remove the entry"));
		return problems;
	}

	private static List<Hit> _Scan(string file, string source, ISet<string> filteredNames) {
		var root = CSharpSyntaxTree.ParseText(source).GetRoot();
		return root.DescendantNodes()
			.OfType<BinaryExpressionSyntax>()
			.Where(binary => binary.IsKind(SyntaxKind.EqualsExpression))
			.Where(binary => TenantPredicateGuardSpec._ComparesAFilteredTenantColumn(binary, filteredNames))
			.Select(binary => new Hit(file, TenantPredicateGuardSpec._Whitespace().Replace(binary.ToString(), " ")))
			.ToList();
	}

	private static bool _ComparesAFilteredTenantColumn(BinaryExpressionSyntax binary, ISet<string> filteredNames) {
		return new[] { binary.Left, binary.Right }
			.Select(side => TenantPredicateGuardSpec._RangeVariableOfTenantId(side))
			.Any(variable => variable is not null
				&& TenantPredicateGuardSpec._SourceOf(variable, binary)
					.DescendantNodesAndSelf().OfType<IdentifierNameSyntax>()
					.Any(identifier => filteredNames.Contains(identifier.Identifier.Text)));
	}

	// `row.TenantId` gives `row`. The context's own `this.TenantId` is not a column.
	private static IdentifierNameSyntax? _RangeVariableOfTenantId(ExpressionSyntax side) {
		return side is MemberAccessExpressionSyntax { Name.Identifier.Text: "TenantId", Expression: IdentifierNameSyntax variable }
			? variable
			: null;
	}

	// The collection a lambda parameter or query range variable iterates: the receiver of the
	// Where/First/Any call, or the `from`/`join` source. Unresolved (a local query variable,
	// a parameter) yields an empty node, so it is not flagged: the stated limit of this scan.
	private static SyntaxNode _SourceOf(IdentifierNameSyntax variable, SyntaxNode from) {
		var name = variable.Identifier.Text;
		foreach (var ancestor in from.Ancestors()) {
			if (ancestor is QueryExpressionSyntax query) {
				var clause = query.FromClause.Identifier.Text == name
					? query.FromClause.Expression
					: query.Body.Clauses.OfType<JoinClauseSyntax>()
						.FirstOrDefault(join => join.Identifier.Text == name)?.InExpression
						?? query.Body.Clauses.OfType<FromClauseSyntax>()
						.FirstOrDefault(fromClause => fromClause.Identifier.Text == name)?.Expression;
				if (clause is not null) {
					return clause;
				}
			}

			if (ancestor is LambdaExpressionSyntax lambda && TenantPredicateGuardSpec._ParametersOf(lambda).Contains(name)) {
				return lambda.Parent?.Parent?.Parent is InvocationExpressionSyntax { Expression: MemberAccessExpressionSyntax access }
					? access.Expression
					: SyntaxFactory.IdentifierName("unresolved");
			}
		}

		return SyntaxFactory.IdentifierName("unresolved");
	}

	private static IEnumerable<string> _ParametersOf(LambdaExpressionSyntax lambda) {
		return lambda switch {
			SimpleLambdaExpressionSyntax simple => [simple.Parameter.Identifier.Text],
			ParenthesizedLambdaExpressionSyntax parenthesized => parenthesized.ParameterList.Parameters.Select(parameter => parameter.Identifier.Text),
			_ => [],
		};
	}

	// DbSet property names and entity type names of every tenant-filtered entity.
	private static HashSet<string> _FilteredEntityNames() {
		var names = new HashSet<string>(StringComparer.Ordinal);
		foreach (var property in typeof(AppDbContext).GetProperties()) {
			var type = property.PropertyType;
			if (!type.IsGenericType || type.GetGenericTypeDefinition() != typeof(DbSet<>)) {
				continue;
			}

			var entity = type.GetGenericArguments()[0];
			if (typeof(ITenantEntity).IsAssignableFrom(entity) || entity == typeof(UserAccountRole)) {
				names.Add(property.Name);
				names.Add(entity.Name);
			}
		}

		return names;
	}

	[GeneratedRegex(@"\s+")]
	private static partial Regex _Whitespace();
}
