#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Tenant account routes (tenant self-service, root scope)
	/// </summary>
	public static class Account {
		/// <summary>Tenant-scoped account routes (tenant user's own account)</summary>
		public static class ForTenant {
			public const string Root = "/account";
			public const string Profile = "/profile";
			public const string UpdateProfile = "/profile";
		}
	}
}
