using System.Linq.Expressions;
using System.Reflection;

using Microsoft.EntityFrameworkCore;

namespace PublyApp.Api.Lib;

/// <summary>
/// Builds a <see cref="CursorSortFieldHandler{TEntity}"/> from one key selector and one id
/// selector, replacing the hand-rolled dictionary entries every cursor-paginated Find* service
/// carried inline before #220.
///
/// Every derived delegate reproduces the exact shapes those inline entries used, so the generated
/// SQL stays equivalent:
/// - getCursorValue projects { Key, Id } for the cursor row off the caller's cursor-lookup query
///   and returns null when the row is gone (the CursorNotFound signal);
/// - applyFilter is the keyset predicate: ascending <c>key &gt; cursor || (key == cursor
///   &amp;&amp; id &gt; cursorId)</c>, descending the mirror. A null cursor value returns the query
///   untouched (first page);
/// - applyOrdering orders by key then id with the tie-breaker ALWAYS in the same direction as the
///   key, so page walks are deterministic on exact ties.
///
/// Comparison shapes are chosen per key type to match what the C# compiler emitted for the inline
/// lambdas, so the translated SQL does not drift:
/// - strings: ordering through <c>CompareTo(cursor) &gt; 0</c> / <c>&lt; 0</c>, equality through
///   the plain <c>==</c> operator (never <c>CompareTo(...) == 0</c>, which Postgres would render
///   as a CASE expression instead of a simple equality);
/// - enums: both ordering and equality over the enum's underlying integral type, which is exactly
///   what <c>t.Status &gt; cursorStatus</c> compiled to (<c>Expression.GreaterThan</c> is not
///   defined for enum operands at all, so the conversion is required, not cosmetic);
/// - every other key type (DateTime, int, Guid): the operators directly.
///
/// Unit-level behavior is pinned by the unit spec next to this file; end-to-end behavior (real
/// SQL, real cursors, real page walks) is pinned by the *CursorBehaviorSpec integration anchors.
/// </summary>
public static class CursorSortFieldHandlerFactory {
	private static readonly MethodInfo StringCompareToMethod = ResolveStringCompareTo();

	private static readonly Expression Zero = Expression.Constant(0, typeof(int));

	/// <summary>
	/// Cursor projection target. Settable properties keep this a shape EF Core translates in a
	/// top-level Select for every provider, without depending on constructor-binding support.
	/// Both values are always assigned by the generated member-init projection, so the nullable
	/// backing fields are an artefact of that two-step construction, never an observable state.
	/// </summary>
	private sealed class CursorProjection<TKey, TId> {
		public TKey? Key { get; set; }

		public TId? Id { get; set; }
	}

	private sealed class ReplaceParameter(Expression from, Expression to) : ExpressionVisitor {
		protected override Expression VisitParameter(ParameterExpression node) {
			if (node == from) {
				return to;
			}

			return base.VisitParameter(node);
		}
	}

	/// <summary>
	/// Derives the three delegates of a cursor sort-field handler from the selectors describing one
	/// sortable field. <paramref name="cursorLookupQuery"/> must already carry the service's
	/// visibility filters (scope, soft deletes, tenant) — the cursor lookup runs against it, so a
	/// cursor row outside the list's visibility is reported as not found, exactly like the inline
	/// handlers did.
	/// </summary>
	public static CursorSortFieldHandler<TEntity> Create<TEntity, TKey, TId>(
		Func<IQueryable<TEntity>> cursorLookupQuery,
		Expression<Func<TEntity, TKey>> keySelector,
		Expression<Func<TEntity, TId>> idSelector,
		CancellationToken cancellationToken
	)
		where TKey : notnull {
		var parameter = Expression.Parameter(typeof(TEntity), "entity");
		var keyBody = RequireVisited(
			new ReplaceParameter(keySelector.Parameters[0], parameter),
			keySelector.Body
		);
		var idBody = RequireVisited(
			new ReplaceParameter(idSelector.Parameters[0], parameter),
			idSelector.Body
		);
		var unifiedKey = Expression.Lambda<Func<TEntity, TKey>>(keyBody, parameter);
		var unifiedId = Expression.Lambda<Func<TEntity, TId>>(idBody, parameter);

		var projectionType = typeof(CursorProjection<TKey, TId>);
		var keyProperty = projectionType.GetProperty(nameof(CursorProjection<TKey, TId>.Key));
		var idProperty = projectionType.GetProperty(nameof(CursorProjection<TKey, TId>.Id));
		if (keyProperty is null || idProperty is null) {
			throw new InvalidOperationException(
				"CursorProjection must expose settable Key and Id properties."
			);
		}

		var projection = Expression.Lambda<Func<TEntity, CursorProjection<TKey, TId>>>(
			Expression.MemberInit(
				Expression.New(projectionType),
				Expression.Bind(keyProperty, keyBody),
				Expression.Bind(idProperty, idBody)
			),
			parameter
		);

		Func<Guid, Task<object?>> getCursorValue = async guid => {
			var idEqualsCursor = Expression.Lambda<Func<TEntity, bool>>(
				Compare(idBody, Expression.Constant(guid, typeof(TId)), Expression.Equal),
				parameter
			);
			var item = await cursorLookupQuery()
				.Where(idEqualsCursor)
				.Select(projection)
				.FirstOrDefaultAsync(cancellationToken);
			if (item is null || item.Key is null || item.Id is null) {
				return null;
			}

			return (item.Key, item.Id);
		};

		Func<IQueryable<TEntity>, object?, bool, IQueryable<TEntity>> applyFilter =
			(query, cursorValue, isAsc) => {
				if (cursorValue is null) {
					return query;
				}

				var (cursorKeyValue, cursorIdValue) = ((TKey, TId))cursorValue;
				var keyValue = Expression.Constant(cursorKeyValue, typeof(TKey));
				var idValue = Expression.Constant(cursorIdValue, typeof(TId));
				Func<Expression, Expression, BinaryExpression> beyondCursor = isAsc
					? Expression.GreaterThan
					: Expression.LessThan;

				var keyset = Expression.Lambda<Func<TEntity, bool>>(
					Expression.OrElse(
						Compare(keyBody, keyValue, beyondCursor),
						Expression.AndAlso(
							Compare(keyBody, keyValue, Expression.Equal),
							Compare(idBody, idValue, beyondCursor)
						)
					),
					parameter
				);
				return query.Where(keyset);
			};

		Func<IQueryable<TEntity>, bool, IQueryable<TEntity>> applyOrdering = (query, isAsc) => isAsc
			? query.OrderBy(unifiedKey).ThenBy(unifiedId)
			: query.OrderByDescending(unifiedKey).ThenByDescending(unifiedId);

		return new CursorSortFieldHandler<TEntity>(
			getCursorValue,
			applyFilter,
			applyOrdering
		);
	}

	/// <summary>
	/// Applies one comparison to a key/id operand pair in the shape the inline lambdas compiled to.
	/// </summary>
	private static Expression Compare(
		Expression operand,
		Expression cursorValue,
		Func<Expression, Expression, BinaryExpression> op
	) {
		var isEquality = op == Expression.Equal;

		// Enum operands have no comparison operators of their own: `t.Status > cursorStatus`
		// compiled to a comparison over the underlying integral type, so reproduce that. Equality
		// followed the same conversion, which keeps both branches of the keyset predicate aligned.
		var underlying = ResolveEnumComparisonType(operand.Type);
		if (underlying is not null) {
			return op(
				Expression.Convert(operand, underlying),
				Expression.Convert(cursorValue, underlying)
			);
		}

		// Strings order through CompareTo (the form the inline handlers used, which Postgres
		// renders as a plain ordering comparison) but stay on `==` for equality: routing equality
		// through CompareTo(...) == 0 would emit a CASE expression instead of a simple equality.
		if (operand.Type == typeof(string) && !isEquality) {
			return op(Expression.Call(operand, StringCompareToMethod, cursorValue), Zero);
		}

		return op(operand, cursorValue);
	}

	/// <summary>
	/// Returns the type an enum (or nullable enum) operand must be converted to before comparison,
	/// or null when the operand is not an enum and needs no conversion.
	/// </summary>
	private static Type? ResolveEnumComparisonType(Type operandType) {
		var nonNullable = Nullable.GetUnderlyingType(operandType);
		var isNullable = nonNullable is not null;
		var effective = nonNullable ?? operandType;
		if (!effective.IsEnum) {
			return null;
		}

		var underlying = Enum.GetUnderlyingType(effective);
		return isNullable
			? typeof(Nullable<>).MakeGenericType(underlying)
			: underlying;
	}

	private static T RequireVisited<T>(ExpressionVisitor visitor, T node)
		where T : Expression {
		if (visitor.Visit(node) is not T visited) {
			throw new InvalidOperationException(
				$"Expected {typeof(T).Name} back from the parameter replacer."
			);
		}

		return visited;
	}

	private static MethodInfo ResolveStringCompareTo() {
		var method = typeof(string).GetMethod(nameof(string.CompareTo), [typeof(string)]);
		if (method is null) {
			throw new InvalidOperationException("string.CompareTo(string) must exist.");
		}

		return method;
	}
}
