#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Publishing routes (tenant-scoped, root scope) — publications history and
	/// composer targets (Epic D).
	/// </summary>
	public static class Publishing {
		/// <summary>Tenant-scoped publishing routes</summary>
		public static class ForTenant {
			public const string Root = "/publishing";
			public const string FindPublications = "/publications";
			public const string PublishTargets = "/publish-targets";
		}
	}
}
