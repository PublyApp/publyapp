#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Tenant settings routes (tenant self-service, root scope)
	/// </summary>
	public static class Settings {
		/// <summary>Tenant-scoped settings routes</summary>
		public static class ForTenant {
			public const string Root = "/settings";
			public const string General = "/general";
			public const string UpdateGeneral = "/general";
		}
	}
}
