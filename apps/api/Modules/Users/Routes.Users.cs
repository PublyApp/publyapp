#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
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
			public static string GetByIdFn(string userId) {
				return $"/{userId}";
			}

			public const string Update = "/{userId}";
			public static string UpdateFn(string userId) {
				return $"/{userId}";
			}

			// High-impact operations are intentionally explicit routes:
			// - Email changes are identity-sensitive.
			// - Suspend/Reactivate are lifecycle operations.
			// Keeping them separate avoids accidental updates via the generic PATCH.
			public const string UpdateEmail = "/{userId}/email";
			public static string UpdateEmailFn(string userId) {
				return $"/{userId}/email";
			}

			public const string Suspend = "/{userId}/suspend";
			public static string SuspendFn(string userId) {
				return $"/{userId}/suspend";
			}

			public const string Reactivate = "/{userId}/reactivate";
			public static string ReactivateFn(string userId) {
				return $"/{userId}/reactivate";
			}

			public const string BulkSuspend = "/bulk-suspend";
			public const string BulkReactivate = "/bulk-reactivate";
			public const string BulkDelete = "/bulk-delete";
			public const string Delete = "/{userId}";
			public static string DeleteFn(string userId) {
				return $"/{userId}";
			}

			/// <summary>Staff user profile assignment routes</summary>
			public static class Profiles {
				public const string Root = "/{userId}/profiles";
				public static string RootFn(string userId) {
					return $"/{userId}/profiles";
				}

				public const string Get = Root;
				public static string GetFn(string userId) {
					return RootFn(userId);
				}

				/// <summary>Replace the full assigned profile set for the staff user</summary>
				public const string Update = Root;
				public static string UpdateFn(string userId) {
					return RootFn(userId);
				}
			}
		}

		/// <summary>Tenant user routes (staff managing tenant users)</summary>
		public static class ForTenantAsStaff {
			public const string Root = "/tenants/{tenantId}/users";
			public static string RootFn(string tenantId) {
				return $"/tenants/{tenantId}/users";
			}

			public const string Create = "/";
			public static string CreateFn(string tenantId) {
				return $"{RootFn(tenantId)}/";
			}

			public const string Find = "/";
			public static string FindFn(string tenantId) {
				return $"{RootFn(tenantId)}/";
			}

			public const string GetById = "/{userId}";
			public static string GetByIdFn(string tenantId, string userId) {
				return $"{RootFn(tenantId)}/{userId}";
			}

			public const string Update = "/{userId}";
			public static string UpdateFn(string tenantId, string userId) {
				return $"{RootFn(tenantId)}/{userId}";
			}

			public const string Delete = "/{userId}";
			public static string DeleteFn(string tenantId, string userId) {
				return $"{RootFn(tenantId)}/{userId}";
			}

			public const string Invite = "/invitations";
			public static string InviteFn(string tenantId) {
				return $"{RootFn(tenantId)}/invitations";
			}

			public const string Suspend = "/{userId}/suspend";
			public static string SuspendFn(string tenantId, string userId) {
				return $"{RootFn(tenantId)}/{userId}/suspend";
			}

			public const string Reactivate = "/{userId}/reactivate";
			public static string ReactivateFn(string tenantId, string userId) {
				return $"{RootFn(tenantId)}/{userId}/reactivate";
			}
		}

		/// <summary>First-class tenant-user routes (staff managing tenant-side identities)</summary>
		public static class ForTenantUsersAsStaff {
			// {userId} is the shared User.Id. Tenant/company memberships remain
			// separate UserAccount rows and are addressed through /companies actions.
			public const string Root = "/tenant-users";
			public const string GetById = "/{userId}";
			public static string GetByIdFn(string userId) {
				return $"/tenant-users/{userId}";
			}

			public const string FindCompanies = "/{userId}/companies";
			public static string FindCompaniesFn(string userId) {
				return $"/tenant-users/{userId}/companies";
			}

			public const string AssignCompanies = "/{userId}/companies";
			public static string AssignCompaniesFn(string userId) {
				return $"/tenant-users/{userId}/companies";
			}

			public const string BulkRemoveCompanies = "/{userId}/companies/bulk-remove";
			public static string BulkRemoveCompaniesFn(string userId) {
				return $"/tenant-users/{userId}/companies/bulk-remove";
			}

			public const string BulkSuspendCompanies = "/{userId}/companies/bulk-suspend";
			public static string BulkSuspendCompaniesFn(string userId) {
				return $"/tenant-users/{userId}/companies/bulk-suspend";
			}

			public const string BulkReactivateCompanies =
				"/{userId}/companies/bulk-reactivate";
			public static string BulkReactivateCompaniesFn(string userId) {
				return $"/tenant-users/{userId}/companies/bulk-reactivate";
			}

			public const string Update = "/{userId}";
			public static string UpdateFn(string userId) {
				return $"/tenant-users/{userId}";
			}

			public const string UpdateEmail = "/{userId}/email";
			public static string UpdateEmailFn(string userId) {
				return $"/tenant-users/{userId}/email";
			}

			public const string Suspend = "/{userId}/suspend";
			public static string SuspendFn(string userId) {
				return $"/tenant-users/{userId}/suspend";
			}

			public const string Reactivate = "/{userId}/reactivate";
			public static string ReactivateFn(string userId) {
				return $"/tenant-users/{userId}/reactivate";
			}
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
