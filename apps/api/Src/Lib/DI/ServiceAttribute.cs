namespace MainApi.Src.Lib.DI;

/// <summary>
/// Marks a concrete class for attribute-based DI registration.
/// Only valid on classes under MainApi.Src.Modules.*.Services namespace.
/// Registers the class against its primary interface I{ClassName}.
/// </summary>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
public sealed class ServiceAttribute : Attribute {
	/// <summary>
	/// The service lifetime (Scoped, Transient, or Singleton). Required.
	/// </summary>
	public ServiceLifetime Lifetime { get; }

	/// <summary>
	/// Optional key for keyed service registration.
	/// Must be a constant from a keys class (ProviderKeys, StorageKeys, etc.).
	/// If null, registers as the unkeyed default for the service type.
	/// </summary>
	public string? Key { get; }

	public ServiceAttribute(ServiceLifetime lifetime, string? key = null) {
		Lifetime = lifetime;
		Key = key;
	}
}
