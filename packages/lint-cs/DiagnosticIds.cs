namespace PublyApp.Analyzers;

/// <summary>
/// String constants for every PUBLY* diagnostic ID. Keeping IDs here (rather than inlined in
/// <see cref="DiagnosticCatalog"/>) lets suppression attributes and tests reference the ID without
/// depending on the full descriptor object.
/// </summary>
public static class DiagnosticIds {
	public const string PUBLY0001 = "PUBLY0001";
	public const string PUBLY0002 = "PUBLY0002";
	public const string PUBLY0003 = "PUBLY0003";
}
