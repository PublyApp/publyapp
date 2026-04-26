#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace MainApi.Src.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// User routes
	/// </summary>
	public static class Users {
		/// <summary>Staff member routes (staff managing staff)</summary>
		public static class ForStaff {
			public const string Root = "/users";
			public const string Create = "/";
			public const string Find = "/";
			public const string GetById = "/{userId}";
			public static string GetByIdFn(string userId) => $"/{userId}";
			public const string Update = "/{userId}";
			public static string UpdateFn(string userId) => $"/{userId}";

			// High-impact operations are intentionally explicit routes:
			// - Email changes are identity-sensitive.
			// - Suspend/Reactivate are lifecycle operations.
			// Keeping them separate avoids accidental updates via the generic PATCH.
			public const string UpdateEmail = "/{userId}/email";
			public static string UpdateEmailFn(string userId) => $"/{userId}/email";
			public const string Suspend = "/{userId}/suspend";
			public static string SuspendFn(string userId) => $"/{userId}/suspend";
			public const string Reactivate = "/{userId}/reactivate";
			public static string ReactivateFn(string userId) => $"/{userId}/reactivate";
			public const string BulkSuspend = "/bulk-suspend";
			public const string BulkReactivate = "/bulk-reactivate";
			public const string Delete = "/{userId}";
			public static string DeleteFn(string userId) => $"/{userId}";

			/// <summary>Staff user profile assignment routes</summary>
			public static class Profiles {
				public const string Root = "/{userId}/profiles";
				public static string RootFn(string userId) => $"/{userId}/profiles";

				public const string Get = Root;
				public static string GetFn(string userId) => RootFn(userId);

				/// <summary>Replace the full assigned profile set for the staff user</summary>
				public const string Update = Root;
				public static string UpdateFn(string userId) => RootFn(userId);
			}
		}

		/// <summary>Tenant user routes (staff managing tenant users)</summary>
		public static class ForTenantAsStaff {
			public const string Root = "/tenants/{tenantId}/users";
			public static string RootFn(string tenantId) => $"/tenants/{tenantId}/users";
			public const string Create = "/";
			public static string CreateFn(string tenantId) => $"{RootFn(tenantId)}/";
			public const string Find = "/";
			public static string FindFn(string tenantId) => $"{RootFn(tenantId)}/";
			public const string GetById = "/{userId}";
			public static string GetByIdFn(string tenantId, string userId) =>
				$"{RootFn(tenantId)}/{userId}";
			public const string Update = "/{userId}";
			public static string UpdateFn(string tenantId, string userId) =>
				$"{RootFn(tenantId)}/{userId}";
			public const string Delete = "/{userId}";
			public static string DeleteFn(string tenantId, string userId) =>
				$"{RootFn(tenantId)}/{userId}";
			public const string Invite = "/invitations";
			public static string InviteFn(string tenantId) => $"{RootFn(tenantId)}/invitations";
			public const string Suspend = "/{userId}/suspend";
			public static string SuspendFn(string tenantId, string userId) =>
				$"{RootFn(tenantId)}/{userId}/suspend";
			public const string Reactivate = "/{userId}/reactivate";
			public static string ReactivateFn(string tenantId, string userId) =>
				$"{RootFn(tenantId)}/{userId}/reactivate";
		}

		/// <summary>Tenant API routes (tenant self-service)</summary>
		public static class ForTenant {
			public const string Root = "/users";
			public const string Find = "/";
			public const string GetById = "/{userId}";
			public const string Invite = "/invite";
		}
	}
}
