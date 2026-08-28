#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Posts routes (tenant-scoped content, root scope)
	/// </summary>
	public static class Posts {
		/// <summary>Tenant-scoped posts routes</summary>
		public static class ForTenant {
			public const string Root = "/posts";
			public const string Create = "/";
			public const string Find = "/";
			// Epic D publish-now: immediate publishing through the job queue,
			// hanging off the existing posts resource (D2 plan reconciliation 2).
			public const string PublishNow = "/{postId}/publish-now";
			public const string GetById = "/{postId}";
			public static string GetByIdFn(string postId) {
				return $"/{postId}";
			}

			public const string Update = "/{postId}";
			public static string UpdateFn(string postId) {
				return $"/{postId}";
			}

			public const string Delete = "/{postId}";
			public static string DeleteFn(string postId) {
				return $"/{postId}";
			}

			public const string AttachImage = "/{postId}/image";
			public static string AttachImageFn(string postId) {
				return $"/{postId}/image";
			}
		}
	}
}
