#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Projects routes (tenant-scoped, root scope)
	/// </summary>
	public static class Projects {
		/// <summary>Tenant-scoped projects routes</summary>
		public static class ForTenant {
			public const string Root = "/projects";
			public const string Find = "/";
		}
	}
}
