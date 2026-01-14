#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace MainApi.Src.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Tenant routes
	/// </summary>
	public static class Tenants {
		/// <summary>Staff tenant routes</summary>
		public static class ForStaff {
			public const string Root = "/staff/tenants";
			public const string Create = $"{Root}/";
			public const string Find = $"{Root}/";
			public const string GetById = $"{Root}/{{tenantId}}";
			public static string GetByIdFn(string tenantId) => $"{Root}/{tenantId}";
		}
	}
}
