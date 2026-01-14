#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace MainApi.Src.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Invitation routes
	/// </summary>
	public static class Invitations {
		/// <summary>Base path for invitations under staff scope - used for MapGroup</summary>
		public const string Base = "/staff/invitations";

		/// <summary>Anonymous invitation routes (public)</summary>
		public static class Anonymous {
			public const string Root = "/invitations";
			public const string DetailsByToken = $"{Root}/{{token}}/details";
			public static string DetailsByTokenFn(string token) => $"{Root}/{token}/details";
			public const string AcceptByToken = $"{Root}/{{token}}/accept";
			public static string AcceptByTokenFn(string token) => $"{Root}/{token}/accept";
			public const string Check = $"{Root}/check";
		}

		/// <summary>Staff invitation routes (managed by staff)</summary>
		public static class ForStaff {
			public const string Root = $"{Base}/staff";
			public const string Create = $"{Root}/";
			public const string BulkCreate = $"{Root}/bulk";
			public const string Find = $"{Root}/";
			public const string RevokeById = $"{Root}/{{invitationId}}";
			public static string RevokeByIdFn(string invitationId) => $"{Root}/{invitationId}";
		}

		/// <summary>Tenant invitation routes (managed by staff)</summary>
		public static class ForTenant {
			public const string Root = $"{Base}/tenant/{{tenantId}}";
			public static string RootFn(string tenantId) => $"{Base}/tenant/{tenantId}";
			public const string Create = $"{Root}/";
			public static string CreateFn(string tenantId) => $"{RootFn(tenantId)}/";
			public const string BulkCreate = $"{Root}/bulk";
			public static string BulkCreateFn(string tenantId) => $"{RootFn(tenantId)}/bulk";
			public const string Find = $"{Root}/";
			public static string FindFn(string tenantId) => $"{RootFn(tenantId)}/";
			public const string RevokeById = $"{Root}/{{invitationId}}";
			public static string RevokeByIdFn(string tenantId, string invitationId) =>
				$"{RootFn(tenantId)}/{invitationId}/";
		}
	}
}
