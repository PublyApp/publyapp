#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace MainApi.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Invitation routes
	/// </summary>
	public static class Invitations {
		/// <summary>Anonymous invitation routes (public)</summary>
		public static class Anonymous {
			public const string Root = "/invitations";
			public const string DetailsByToken = $"{Root}/{{token}}/details";
			public static string DetailsByTokenFn(string token) {
				return $"{Root}/{token}/details";
			}

			public const string AcceptByToken = $"{Root}/{{token}}/accept";
			public static string AcceptByTokenFn(string token) {
				return $"{Root}/{token}/accept";
			}

			public const string Check = $"{Root}/check";
		}

		/// <summary>Staff invitation routes (staff managing staff invitations)</summary>
		public static class ForStaff {
			public const string Root = "/invitations";
			public const string Create = "/";
			public const string BulkCreate = "/bulk";
			public const string BulkRevoke = "/bulk-revoke";
			public const string Find = "/";
			public const string RevokeById = "/{invitationId}";
			public static string RevokeByIdFn(string invitationId) {
				return $"/{invitationId}";
			}

			// Get single invitation details.
			public const string GetById = "/{invitationId}";
			public static string GetByIdFn(string invitationId) {
				return $"/{invitationId}";
			}

			// Pending-only actions.
			public const string GetLinkById = "/{invitationId}/link";
			public static string GetLinkByIdFn(string invitationId) {
				return $"/{invitationId}/link";
			}

			public const string ResendById = "/{invitationId}/resend";
			public static string ResendByIdFn(string invitationId) {
				return $"/{invitationId}/resend";
			}
		}

		/// <summary>Tenant invitation routes (staff managing tenant invitations)</summary>
		public static class ForTenantAsStaff {
			public const string Root = "/tenants/{tenantId}/invitations";
			public static string RootFn(string tenantId) {
				return $"/tenants/{tenantId}/invitations";
			}

			public const string Create = "/";
			public static string CreateFn(string tenantId) {
				return $"{RootFn(tenantId)}/";
			}

			public const string BulkCreate = "/bulk";
			public static string BulkCreateFn(string tenantId) {
				return $"{RootFn(tenantId)}/bulk";
			}

			public const string Find = "/";
			public static string FindFn(string tenantId) {
				return $"{RootFn(tenantId)}/";
			}

			public const string RevokeById = "/{invitationId}";
			public static string RevokeByIdFn(string tenantId, string invitationId) {
				return $"{RootFn(tenantId)}/{invitationId}";
			}
		}

		/// <summary>Tenant API routes (tenant self-service)</summary>
		public static class ForTenant {
			public const string Root = "/invitations";
			public const string Create = "/";
			public const string Find = "/";
			public const string RevokeById = "/{invitationId}";
		}
	}
}
