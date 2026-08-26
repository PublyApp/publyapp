#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Social accounts routes (tenant-scoped publishing connections, root scope)
	/// </summary>
	public static class SocialAccounts {
		/// <summary>Tenant-scoped social-accounts routes</summary>
		public static class ForTenant {
			public const string Root = "/social-accounts";
			public const string Find = "/";
			public const string Connect = "/connect";
			public const string FindNeedsReconnect = "/needs-reconnect-accounts";

			public const string Reconnect = "/{socialAccountId}/reconnect";
			public const string Disconnect = "/{socialAccountId}/disconnect";
			public const string SetProjects = "/{socialAccountId}/projects";
		}
	}
}
