#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace MainApi.Src.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Tenant routes
	/// </summary>
	public static class Tenants {
		/// <summary>Staff tenant management routes</summary>
		public static class ForStaff {
			public const string Root = "/tenants";
			public const string Create = "/";
			public const string Find = "/";
			public const string GetById = "/{tenantId}";
			public static string GetByIdFn(string tenantId) => $"/{tenantId}";
		}
	}
}
