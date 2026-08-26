#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Publishing routes (tenant-scoped, root scope) — publications history,
	/// composer targets (Epic D), and schedule lifecycle (D3).
	/// </summary>
	public static class Publishing {
		/// <summary>Tenant-scoped publishing routes</summary>
		public static class ForTenant {
			public const string Root = "/posts";
			public const string FindPublications = "/publications";
			public const string PublishTargets = "/publish-targets";
			public const string Schedule = "/{postId}/schedule";
			public const string Find = "/publications";

			public static string ScheduleFn(string postId) {
				return $"/{postId}/schedule";
			}
		}
	}
}
