#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace MainApi.Src.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Profile routes
	/// </summary>
	public static class Profiles {
		/// <summary>Base path for profiles under staff scope - used for MapGroup</summary>
		public const string Base = "/staff/profiles";

		/// <summary>Staff profile routes</summary>
		public static class ForStaff {
			public const string Root = Base;
			public const string Create = $"{Root}/";
			public const string Find = $"{Root}/";
		}

		/// <summary>Tenant profile routes (managed by staff)</summary>
		public static class ForTenant {
			public const string Find = $"{Base}/tenant/{{tenantId}}";
			public static string FindFn(string tenantId) => $"{Base}/tenant/{tenantId}";
		}
	}
}
