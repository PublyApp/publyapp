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
			public const string Delete = "/{userId}";
			public static string DeleteFn(string userId) => $"/{userId}";
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
