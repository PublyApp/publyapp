namespace MainApi.Src.Modules.AuditLogs.Entities;

using System.Collections.Immutable;
using System.Reflection;

public static class AuditActionsRegistry {
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

	public static IReadOnlyList<string> All => CachedAll;

	public static bool IsKnown(string action) {
		return CachedKnownSet.Contains(action);
	}
}
