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

			// A5 (#636): staff jobs dashboard. Sibling root — does NOT replace
			// K-1's /dead-letter. The new DLQ list/get reads live at
			// /staff/jobs/dead-letter/* (joined with JobsRoot); the requeue POST
			// lives in the EXISTING K-1 MapGroup at /staff/dead-letter/{id}/requeue.
			public const string JobsRoot = "/jobs";

			public static class Queue {
				public const string Root = "/queue";
				public const string GetById = "/{queueItemId}";
				public static string GetByIdFn(string queueItemId) {
					return $"/{queueItemId}";
				}
			}

			// A5 DLQ READS (list, get-by-id). The K-1 requeue POST lives in the
			// EXISTING MapGroup at /dead-letter; this constant block only names
			// the sibling read surfaces and the requeue segment used by the K-1
			// group's extension.
			public static class DeadLetter {
				public const string Root = "/dead-letter";
				public const string GetById = "/{deadLetterId}";
				public static string GetByIdFn(string deadLetterId) {
					return $"/{deadLetterId}";
				}
				public const string Requeue = "/{deadLetterId}/requeue";
				public static string RequeueFn(string deadLetterId) {
					return $"/{deadLetterId}/requeue";
				}
			}

			public static class SystemJobs {
				public const string Root = "/system-jobs";
				public const string GetById = "/{systemJobId}";
				public static string GetByIdFn(string systemJobId) {
					return $"/{systemJobId}";
				}
				public const string UpdateEnabled = "/{systemJobId}/enabled";
				public const string UpdateCron = "/{systemJobId}/cron";
				public const string Trigger = "/{systemJobId}/trigger";
			}
		}
	}
}
