#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace MainApi.Src.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Permission routes
	/// </summary>
	public static class Permissions {
		/// <summary>Staff permission routes</summary>
		public static class ForStaff {
			public const string Root = "/permissions";

			/// <summary>Permission catalogs grouped by permission scope</summary>
			public static class Scopes {
				public const string Root = "/scopes";
				public const string Staff = "/staff";
				public const string Tenant = "/tenant";
			}
		}
	}
}
