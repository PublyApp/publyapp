#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Publishing routes (tenant-scoped, root scope) — publications history and
	/// composer targets (Epic D). The D3 schedule lifecycle lives under
	/// <see cref="Posts"/> (Posts/{postId}/schedule) — see
	/// <c>apps/api/Modules/Publishing/Endpoints/PublishingEndpointsForTenant.cs</c>
	/// for what stays here, and the schedule module for the rest.
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
