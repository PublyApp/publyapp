#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Tenant routes
	/// </summary>
	public static class Tenants {
		/// <summary>Staff tenant management routes</summary>
		public static class ForStaff {
			public const string Root = "/tenants";
			public const string Create = "/";
			public const string Find = "/";
			public const string GetById = "/{tenantId}";
			public static string GetByIdFn(string tenantId) {
				return $"/{tenantId}";
			}

			public const string Activity = "/{tenantId}/activity";
			public static string ActivityFn(string tenantId) {
				return $"/{tenantId}/activity";
			}

			public const string Suspend = "/{tenantId}/suspend";
			public static string SuspendFn(string tenantId) {
				return $"/{tenantId}/suspend";
			}

			public const string Reactivate = "/{tenantId}/reactivate";
			public static string ReactivateFn(string tenantId) {
				return $"/{tenantId}/reactivate";
			}

			public const string Update = "/{tenantId}";
			public static string UpdateFn(string tenantId) {
				return $"/{tenantId}";
			}

			public const string Delete = "/{tenantId}";
			public static string DeleteFn(string tenantId) {
				return $"/{tenantId}";
			}

			public const string BulkSuspend = "/bulk-suspend";
			public const string BulkReactivate = "/bulk-reactivate";
			public const string BulkDelete = "/bulk-delete";

			// Per-tenant usage metrics read by staff (#168).
			public const string Usage = "/{tenantId}/usage";
			public static string UsageFn(string tenantId) {
				return $"/{tenantId}/usage";
			}
		}
	}
}
