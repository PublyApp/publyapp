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
			public const string RetryPublication = "/publications/{publicationId}/retry";
			public const string MarkPublicationPublished = "/publications/{publicationId}/mark-published";
			// #2172: per-destination content overrides of one publication.
			public const string PublicationRendition = "/publications/{publicationId}/rendition";
			// #2208: one post's own publications (every live status, no window).
			public const string PostPublications = "/{postId}/publications";
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

			// Per-image routes (#2170): DELETE/PATCH one image by asset id, and
			// the order endpoint (static segment wins over the {assetId} one).
			public const string ImageById = "/{postId}/images/{assetId}";
			public static string ImageByIdFn(string postId, string assetId) {
				return $"/{postId}/images/{assetId}";
			}

			// Images of one follow-up segment (#2181).
			public const string SegmentImages = "/{postId}/segments/{segmentId}/images";
			public static string SegmentImagesFn(string postId, string segmentId) {
				return $"/{postId}/segments/{segmentId}/images";
			}

			public const string SegmentImageById = "/{postId}/segments/{segmentId}/images/{assetId}";
			public static string SegmentImageByIdFn(string postId, string segmentId, string assetId) {
				return $"/{postId}/segments/{segmentId}/images/{assetId}";
			}

			public const string SegmentImageAlt = "/{postId}/segments/{segmentId}/images/{assetId}";

			public const string SegmentImagesOrder = "/{postId}/segments/{segmentId}/images/order";
			public static string SegmentImagesOrderFn(string postId, string segmentId) {
				return $"/{postId}/segments/{segmentId}/images/order";
			}

			public const string ImagesOrder = "/{postId}/images/order";
			public static string ImagesOrderFn(string postId) {
				return $"/{postId}/images/order";
			}
		}
	}
}
