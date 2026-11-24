namespace PublyApp.Api.Lib.DI;

/// <summary>
/// Restricts which classes may request the decorated interface from DI. A port that several
/// adapters implement is only injected into the registry that owns them, so business code
/// cannot bypass routing. PUBLY0013 enforces the restriction at build time.
/// </summary>
[AttributeUsage(AttributeTargets.Interface, AllowMultiple = false, Inherited = false)]
public sealed class OnlyInjectedIntoAttribute(params Type[] allowed) : Attribute {
	/// <summary>
	/// The only classes allowed to take the decorated interface, directly or in a
	/// DI-resolved collection.
	/// </summary>
	public IReadOnlyList<Type> Allowed { get; } = allowed;
}
