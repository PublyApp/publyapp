#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace MainApi.Src.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Profile routes
	/// </summary>
	public static class Profiles {
		/// <summary>Staff profile routes (staff managing staff profiles)</summary>
		public static class ForStaff {
			public const string Root = "/profiles";
			public const string Create = "/";
			public const string Find = "/";
		}

		/// <summary>Tenant profile routes (staff viewing tenant profiles)</summary>
		public static class ForTenantAsStaff {
			public const string Root = "/tenants/{tenantId}/profiles";
			public static string RootFn(string tenantId) => $"/tenants/{tenantId}/profiles";
			public const string Find = "/";
			public static string FindFn(string tenantId) => $"{RootFn(tenantId)}/";
		}
	}
}
