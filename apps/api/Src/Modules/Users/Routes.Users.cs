#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace MainApi.Src.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// User routes
	/// </summary>
	public static class Users {
		/// <summary>Base path for users under staff scope - used for MapGroup</summary>
		public const string Base = "/staff/users";

		/// <summary>Staff user routes (managed by staff)</summary>
		public static class ForStaff {
			public const string Root = $"{Base}/staff";
			public const string Create = $"{Root}/";
			public const string Find = $"{Root}/";
			public const string GetById = $"{Root}/{{userId}}";
			public static string GetByIdFn(string userId) => $"{Root}/{userId}";
			public const string Update = $"{Root}/{{userId}}";
			public static string UpdateFn(string userId) => $"{Root}/{userId}";
			public const string Delete = $"{Root}/{{userId}}";
			public static string DeleteFn(string userId) => $"{Root}/{userId}";
		}

		/// <summary>Tenant user routes (managed by staff)</summary>
		public static class ForTenant {
			public const string Root = $"{Base}/tenant/{{tenantId}}";
			public static string RootFn(string tenantId) => $"{Base}/tenant/{tenantId}";
			public const string Create = $"{Root}/";
			public static string CreateFn(string tenantId) => $"{RootFn(tenantId)}/";
			public const string Find = $"{Root}/";
			public static string FindFn(string tenantId) => $"{RootFn(tenantId)}/";
			public const string GetById = $"{Root}/{{userId}}";
			public static string GetByIdFn(string tenantId, string userId) => $"{RootFn(tenantId)}/{userId}";
			public const string Update = $"{Root}/{{userId}}";
			public static string UpdateFn(string tenantId, string userId) => $"{RootFn(tenantId)}/{userId}";
			public const string Delete = $"{Root}/{{userId}}";
			public static string DeleteFn(string tenantId, string userId) => $"{RootFn(tenantId)}/{userId}";
		}
	}
}
