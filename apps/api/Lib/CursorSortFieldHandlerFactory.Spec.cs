using System.Linq.Expressions;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib;

/// <summary>
/// Pins #220: <see cref="CursorSortFieldHandlerFactory"/> must derive the three delegates of a
/// <see cref="CursorSortFieldHandler{TEntity}"/> from a single key selector plus an id selector,
/// reproducing the exact shapes every hand-rolled dictionary entry used before the extraction:
///
/// - applyFilter: keyset predicate — asc: <c>key &gt; ck || (key == ck &amp;&amp; id &gt; cid)</c>,
///   desc the mirror; null cursor value returns the query untouched;
/// - applyOrdering: <c>OrderBy(key).ThenBy(id)</c>, descending mirror, tie-breaker ALWAYS in the
///   same direction as the key;
/// - getCursorValue: projects { Key, Id } for exactly one row of the cursor-lookup query and
///   returns null when the row is gone (its SQL translation and projection shape are pinned by
///   <c>CursorSortFieldHandlerFactorySqlSpec</c> against a real Postgres tenant table).
///
/// The comparison-shape tests below are the ones that matter for SQL fidelity, and they are the
/// ones that caught two real defects in the first draft of the factory:
/// - an enum sort key (three services sort by one) threw at handler-construction time, because
///   <c>Expression.GreaterThan</c> is not defined for enum operands;
/// - string equality was routed through <c>CompareTo(...) == 0</c>, which is not the shape the
///   inline lambdas compiled to and which Postgres renders as a CASE expression.
///
/// Evaluated in memory over lists so a failure names the delegate at fault; translation to real
/// SQL is covered by the 15 *CursorBehaviorSpec integration anchors and the factory SQL spec.
/// </summary>
public class CursorSortFieldHandlerFactorySpec {
	private enum Rank {
		Low = 0,
		Mid = 1,
		High = 2
	}

	private sealed class Row {
		public Guid? Id { get; set; }
		public DateTime CreatedAt { get; set; }
		public string Email { get; set; } = string.Empty;
		public Rank Rank { get; set; }
	}

	private static readonly DateTime BaseTime = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

	private static Guid Id(int n) {
		return Guid.Parse($"00000000-0000-0000-0000-00000000000{n}");
	}

	// Deliberately unsorted: every test must observe ordering produced by ApplyOrdering itself.
	private static IQueryable<Row> Rows() {
		var rows = new[] {
			new Row {
				Id = Id(5), CreatedAt = BaseTime.AddDays(2), Email = "eve@example.com",
				Rank = Rank.High
			},
			new Row {
				Id = Id(1), CreatedAt = BaseTime.AddDays(1), Email = "alice@example.com",
				Rank = Rank.Low
			},
			new Row {
				Id = Id(3), CreatedAt = BaseTime.AddDays(2), Email = "carol@example.com",
				Rank = Rank.Mid
			},
			new Row {
				Id = Id(2), CreatedAt = BaseTime.AddDays(1), Email = "bob@example.com",
				Rank = Rank.Mid
			},
			new Row {
				Id = Id(4), CreatedAt = BaseTime.AddDays(3), Email = "dave@example.com",
				Rank = Rank.High
			},
		};
		return rows.AsQueryable();
	}

	private static CursorSortFieldHandler<Row> CreateHandler<TKey>(
		Expression<Func<Row, TKey>> keySelector
	)
		where TKey : notnull {
		return CursorSortFieldHandlerFactory.Create<Row, TKey, Guid?>(
			cursorLookupQuery: Rows,
			keySelector: keySelector,
			idSelector: row => row.Id,
			cancellationToken: CancellationToken.None
		);
	}

	/// <summary>
	/// Reproduces the service pipeline: filter past the cursor, then order. ApplyFilter alone makes
	/// no ordering promise, so a page assertion has to go through ApplyOrdering the way every
	/// Find* method does.
	/// </summary>
	private static List<Guid?> Page(
		CursorSortFieldHandler<Row> handler,
		IQueryable<Row> query,
		object? cursorValue,
		bool isAsc
	) {
		var filtered = handler.ApplyFilter(query, cursorValue, isAsc);
		return handler.ApplyOrdering(filtered, isAsc).Select(r => r.Id).ToList();
	}

	[Fact]
	public void ItShouldOrderAscendingByKeyThenById() {
		var handler = CreateHandler(row => row.CreatedAt);

		var ordered = handler.ApplyOrdering(Rows(), true).ToList();

		ordered.Should().HaveCount(5);
		// Id(4) sorts last despite the lowest-but-one id: the key dominates, the id only splits the
		// day+2 tie between Id(3) and Id(5).
		ordered.Select(r => r.Id).Should().Equal(Id(1), Id(2), Id(3), Id(5), Id(4));
		ordered.Select(r => r.CreatedAt).Should().BeInAscendingOrder();
	}

	[Fact]
	public void ItShouldOrderDescendingByKeyThenByIdWithTieBreakerInSameDirection() {
		// The created_at ties on day+2 (ids ...03 and ...05) make a missing desc tie-breaker
		// observable: without ThenByDescending(Id) their relative order is arbitrary.
		var handler = CreateHandler(row => row.CreatedAt);

		var ordered = handler.ApplyOrdering(Rows(), false).ToList();

		ordered.Select(r => r.CreatedAt).Should().BeInDescendingOrder();
		ordered.Select(r => r.Id).Should().Equal(Id(4), Id(5), Id(3), Id(2), Id(1));
	}

	[Fact]
	public void ItShouldFilterRowsStrictlyAfterTheCursorWhenAscending() {
		var handler = CreateHandler(row => row.CreatedAt);

		// Cursor sits on the earlier of the two day+2 ties, so the page opens on its tied sibling.
		var page = Page(handler, Rows(), (BaseTime.AddDays(2), (Guid?)Id(3)), true);

		page.Should().Equal(Id(5), Id(4));
	}

	[Fact]
	public void ItShouldFilterRowsStrictlyBeforeTheCursorWhenDescending() {
		var handler = CreateHandler(row => row.CreatedAt);

		var page = Page(handler, Rows(), (BaseTime.AddDays(2), (Guid?)Id(5)), false);

		page.Should().Equal(Id(3), Id(2), Id(1));
	}

	[Fact]
	public void ItShouldExcludeTheCursorRowItselfOnAnExactKeyTie() {
		// The `key == ck && id > cid` half of the predicate: rows tied on the key are split by id,
		// and the cursor row itself must never come back (that would duplicate it across pages).
		var handler = CreateHandler(row => row.CreatedAt);

		var page = Page(handler, Rows(), (BaseTime.AddDays(2), (Guid?)Id(3)), true);

		page.Should().NotContain(Id(3));
		page.Should().Equal(Id(5), Id(4));
	}

	[Fact]
	public void ItShouldWalkEveryPageExactlyOnceAcrossKeyTies() {
		// The property that actually matters for a cursor contract: walking page by page visits all
		// five rows once, in the ordering's own sequence, with ties split by the id tie-breaker.
		var handler = CreateHandler(row => row.CreatedAt);
		var visited = new List<Guid?>();
		object? cursor = null;

		for (var page = 0; page < 5; page++) {
			var remaining = handler.ApplyOrdering(
				handler.ApplyFilter(Rows(), cursor, true),
				true
			).ToList();
			if (remaining.Count == 0) {
				break;
			}

			var row = remaining[0];
			visited.Add(row.Id);
			cursor = (row.CreatedAt, row.Id);
		}

		visited.Should().Equal(Id(1), Id(2), Id(3), Id(5), Id(4));
		visited.Should().OnlyHaveUniqueItems();
	}

	[Fact]
	public void ItShouldReturnTheQueryUntouchedWhenCursorValueIsNull() {
		var handler = CreateHandler(row => row.CreatedAt);

		var filtered = handler.ApplyFilter(Rows(), null, true).ToList();

		filtered.Should().HaveCount(5);
	}

	[Fact]
	public void ItShouldUseCompareToSemanticsForStringKeys() {
		// Mirrors the string handlers: CompareTo(...) > 0 / < 0 against the cursor value.
		// The factory infers CompareTo semantics from the key type itself.
		var handler = CreateHandler(row => row.Email);

		var filtered = handler.ApplyOrdering(
			handler.ApplyFilter(Rows(), ("bob@example.com", (Guid?)Id(2)), true),
			true
		).ToList();

		filtered.Select(r => r.Email).Should().Equal(
			"carol@example.com",
			"dave@example.com",
			"eve@example.com"
		);

		var ordered = handler.ApplyOrdering(Rows(), true).ToList();
		ordered.Select(r => r.Email).Should().Equal(
			"alice@example.com",
			"bob@example.com",
			"carol@example.com",
			"dave@example.com",
			"eve@example.com"
		);
	}

	[Fact]
	public void ItShouldCompareStringKeyEqualityWithTheEqualityOperatorNotCompareTo() {
		// Asserts the real emitted predicate, not a comment: the equality half of the keyset must
		// be a plain Equal over the string operands. Routing it through CompareTo(...) == 0 (the
		// first draft's shape) makes Postgres render a CASE expression instead of `=`.
		var handler = CursorSortFieldHandlerFactory.Create<Row, string, Guid?>(
			cursorLookupQuery: Rows,
			keySelector: row => row.Email,
			idSelector: row => row.Id,
			cancellationToken: CancellationToken.None
		);

		var filtered = handler.ApplyFilter(
			Rows().Where(r => r.Email == "bob@example.com"),
			("bob@example.com", (Guid?)Id(2)),
			true
		);

		var predicate = ExtractWherePredicate(filtered);
		var keyset = (BinaryExpression)predicate.Body;
		var equalityHalf = (BinaryExpression)((BinaryExpression)keyset.Right).Left;

		equalityHalf.NodeType.Should().Be(ExpressionType.Equal);
		equalityHalf.Left.Type.Should().Be(typeof(string));
		equalityHalf.Right.Type.Should().Be(typeof(string));
		equalityHalf.ToString().Should().NotContain("CompareTo");

		// And the ordering half still uses CompareTo, so the two halves are not the same shape.
		((BinaryExpression)keyset.Left).Left.ToString().Should().Contain("CompareTo");

		// And it still behaves: the cursor row itself is excluded by the id half of the tie.
		filtered.ToList().Should().BeEmpty();
	}

	[Fact]
	public void ItShouldOrderAndFilterEnumKeysThroughTheirUnderlyingIntegralType() {
		// Regression: Expression.GreaterThan is not defined for enum operands, so a naive factory
		// throws while merely constructing an enum handler. Three services sort by an enum key
		// (tenant status, user status, account level), so this is not a hypothetical shape.
		var handler = CreateHandler(row => row.Rank);

		var ordered = handler.ApplyOrdering(Rows(), true).ToList();
		ordered.Select(r => r.Rank).Should().Equal(
			Rank.Low,
			Rank.Mid,
			Rank.Mid,
			Rank.High,
			Rank.High
		);
		ordered.Select(r => r.Id).Should().Equal(Id(1), Id(2), Id(3), Id(4), Id(5));

		Page(handler, Rows(), (Rank.Mid, (Guid?)Id(2)), true)
			.Should().Equal(Id(3), Id(4), Id(5));
		Page(handler, Rows(), (Rank.Mid, (Guid?)Id(3)), false)
			.Should().Equal(Id(2), Id(1));
	}

	private static Expression<Func<Row, bool>> ExtractWherePredicate(IQueryable<Row> query) {
		if (query.Expression is not MethodCallExpression call) {
			throw new InvalidOperationException("Expected the filtered query to be a Where call.");
		}

		if (call.Arguments[1] is not UnaryExpression quoted) {
			throw new InvalidOperationException("Expected the Where argument to be a quoted lambda.");
		}

		if (quoted.Operand is not Expression<Func<Row, bool>> predicate) {
			throw new InvalidOperationException("Expected a Func<Row, bool> predicate.");
		}

		return predicate;
	}
}
