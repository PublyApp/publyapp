namespace MainApi.Src.Modules.AuditLogs.Entities;

using System.Collections.Immutable;
using System.Reflection;

public static class AuditActionsRegistry {
	private static readonly ImmutableArray<string> _all =
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
			.Select(f => (string)f.GetRawConstantValue()!)
			.Distinct()
			.Order()];

	private static readonly ImmutableHashSet<string> _knownSet =
		[.. _all];

	public static IReadOnlyList<string> All => _all;

	public static bool IsKnown(string action) {
		return _knownSet.Contains(action);
	}
}
