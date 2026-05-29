
using System.Collections.Immutable;
using System.Reflection;

namespace MainApi.Modules.AuditLogs.Entities;

public static class AuditActionsRegistry {
	// Audit action constants are the source of truth for
	// filter validation and the staff action-picker endpoint.
	// Reflection keeps new AuditActions constants from needing
	// a second manual registration step.
	private static readonly ImmutableArray<string> CachedAll =
		[.. typeof(AuditActions)
			.GetFields(
				BindingFlags.Public
				| BindingFlags.Static
				| BindingFlags.FlattenHierarchy
			)
			.Where(f =>
				f.IsLiteral
				&& !f.IsInitOnly
				&& f.FieldType == typeof(string))
			.Select(f => f.GetRawConstantValue() as string)
			.OfType<string>()
			.Distinct()
			.Order()];

	private static readonly ImmutableHashSet<string> CachedKnownSet =
		[.. CachedAll];

	public static IReadOnlyList<string> All {
		get {
			return CachedAll;
		}
	}

	// Audit action keys are canonical persisted values; keep
	// validation case-sensitive rather than accepting case
	// variants.
	public static bool IsKnown(string action) {
		return CachedKnownSet.Contains(action);
	}
}
