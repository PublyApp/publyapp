#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	public static class Jobs {
		public static class ForStaff {
			public const string Root = "/dead-letter";
			// K-1 (#863): operator triage of an Unclassified dead-lettered job.
			public const string ResolveUnclassified = "/{deadLetterId}/resolve-unclassified";
			public static string ResolveUnclassifiedFn(string deadLetterId) {
				return $"/{deadLetterId}/resolve-unclassified";
			}
		}
	}
}
