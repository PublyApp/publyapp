#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Role routes
	/// </summary>
	public static class Roles {
		/// <summary>Staff role routes (staff managing staff roles)</summary>
		public static class ForStaff {
			public const string Root = "/roles";
			public const string Create = "/";
			public const string Find = "/";
			// Single endpoint that accepts a roleId array and deletes matching staff
			// roles in one request.
			public const string BulkDelete = "/bulk-delete";
			public const string Get = "/{roleId}";
			public static string GetFn(string roleId) {
				return $"/{roleId}";
			}

			// PATCH semantics: role details are updated via a partial update (name/description).
			public const string Update = "/{roleId}";
			public static string UpdateFn(string roleId) {
				return $"/{roleId}";
			}

			public const string Delete = "/{roleId}";
			public static string DeleteFn(string roleId) {
				return $"/{roleId}";
			}

			/// <summary>Staff role permissions routes</summary>
			public static class Permissions {
				// NOTE: This is relative to "/staff" and "/roles" route grouping.
				// We expose permission assignment as an idempotent "upsert" endpoint per key:
				// POST assigns, DELETE unassigns.
				public const string Root = "/{roleId}/permissions";
				public static string RootFn(string roleId) {
					return $"/{roleId}/permissions";
				}

				/// <summary>List permission keys assigned to a staff role</summary>
				public const string Find = Routes.Roles.ForStaff.Permissions.Root;
				public static string FindFn(string roleId) {
					return Routes.Roles.ForStaff.Permissions.RootFn(roleId);
				}

				/// <summary>Assign or unassign a permission key on a staff role</summary>
				public const string Upsert = Routes.Roles.ForStaff.Permissions.Root + "/{permissionKey}";
				public static string UpsertFn(string roleId, string permissionKey) {
					return $"{Routes.Roles.ForStaff.Permissions.RootFn(roleId)}/{permissionKey}";
				}
			}

			/// <summary>
			/// Staff role users routes (staff viewing users assigned to a staff
			/// role).
			/// </summary>
			public static class Users {
				// NOTE: This is relative to "/staff" and "/roles" route grouping.
				public const string Root = "/{roleId}/users";
				public static string RootFn(string roleId) {
					return $"/{roleId}/users";
				}

				/// <summary>Find users assigned to a staff role</summary>
				public const string Find = Routes.Roles.ForStaff.Users.Root;
				public static string FindFn(string roleId) {
					return Routes.Roles.ForStaff.Users.RootFn(roleId);
				}

				/// <summary>
				/// Batch-resolve whether a set of staff users is assigned to a staff role.
				/// This exists to avoid N+1 per-row role requests in list UIs (assignment drawers).
				/// </summary>
				public const string ResolveAssignment = Routes.Roles.ForStaff.Users.Root + "/assignment-resolution";
				public static string ResolveAssignmentFn(string roleId) {
					return $"{Routes.Roles.ForStaff.Users.RootFn(roleId)}/assignment-resolution";
				}

				/// <summary>
				/// Bulk-unassign staff users from a staff role.
				/// </summary>
				public const string Unassign = Routes.Roles.ForStaff.Users.Root + "/unassign";
				public static string UnassignFn(string roleId) {
					return $"{Routes.Roles.ForStaff.Users.RootFn(roleId)}/unassign";
				}
			}
		}

		/// <summary>Tenant role routes (staff viewing tenant roles)</summary>
		public static class ForTenantAsStaff {
			public const string Root = "/tenants/{tenantId}/roles";
			public static string RootFn(string tenantId) {
				return $"/tenants/{tenantId}/roles";
			}

			public const string Find = "/";
			public static string FindFn(string tenantId) {
				return $"{Routes.Roles.ForTenantAsStaff.RootFn(tenantId)}/";
			}

			/// <summary>
			/// Batch-resolve tenant role NAMES to role ids for bulk entry (the invite
			/// drawer's CSV/Excel import). Case-insensitive over live scope-1 non-deleted
			/// rows; a name matching several live rows reports ambiguous because
			/// ux_roles_tenant_name is case-sensitive.
			/// </summary>
			public const string ResolveNames = "/resolve-names";
			public static string ResolveNamesFn(string tenantId) {
				return $"{Routes.Roles.ForTenantAsStaff.RootFn(tenantId)}/resolve-names";
			}

			// Bulk tenant role deletion is scoped by tenantId route and uses one
			// request body containing multiple role IDs.
			public const string BulkDelete = "/bulk-delete";
			public const string Get = "/{roleId}";
			public static string GetFn(string roleId) {
				return $"/{roleId}";
			}

			public const string Create = "/";
			public const string Update = "/{roleId}";
			public static string UpdateFn(string roleId) {
				return $"/{roleId}";
			}

			public const string Delete = "/{roleId}";
			public static string DeleteFn(string roleId) {
				return $"/{roleId}";
			}

			/// <summary>Tenant role permissions routes</summary>
			public static class Permissions {
				public const string Root = "/{roleId}/permissions";
				public static string RootFn(string roleId) {
					return $"/{roleId}/permissions";
				}

				public const string Find = Routes.Roles.ForTenantAsStaff.Permissions.Root;
				public static string FindFn(string roleId) {
					return Routes.Roles.ForTenantAsStaff.Permissions.RootFn(roleId);
				}

				public const string Upsert = Routes.Roles.ForTenantAsStaff.Permissions.Root + "/{permissionKey}";
				public static string UpsertFn(string roleId, string permissionKey) {
					return $"{Routes.Roles.ForTenantAsStaff.Permissions.RootFn(roleId)}/{permissionKey}";
				}
			}

			/// <summary>
			/// Tenant role users routes (staff managing the members assigned to a
			/// tenant role).
			/// </summary>
			public static class Users {
				// NOTE: This is relative to "/staff" and "/tenants/{tenantId}/roles"
				// route grouping.
				public const string Root = "/{roleId}/users";
				public static string RootFn(string roleId) {
					return $"/{roleId}/users";
				}

				/// <summary>Find tenant members assigned to a tenant role</summary>
				public const string Find = Routes.Roles.ForTenantAsStaff.Users.Root;
				public static string FindFn(string roleId) {
					return Routes.Roles.ForTenantAsStaff.Users.RootFn(roleId);
				}

				/// <summary>
				/// Batch-resolve whether a set of tenant member accounts is assigned to a
				/// tenant role. Mirrors Users.ResolveAssignment on the staff-roles axis;
				/// this exists to avoid N+1 per-row role requests in list UIs (assignment
				/// drawers).
				/// </summary>
				public const string ResolveAssignment = Routes.Roles.ForTenantAsStaff.Users.Root + "/assignment-resolution";
				public static string ResolveAssignmentFn(string roleId) {
					return $"{Routes.Roles.ForTenantAsStaff.Users.RootFn(roleId)}/assignment-resolution";
				}

				// Membership is exposed as an idempotent per-member "upsert" toggle keyed by
				// the member's account id, mirroring Permissions.Upsert in this same group:
				// POST assigns, DELETE unassigns. This is what lets the members UI toggle a
				// single row without a batch confirm step.
				// The placeholder is snake_case per the URL-parameter convention; handlers bind
				// it explicitly to an idiomatic C# `userAccountId`.
				public const string Upsert = Routes.Roles.ForTenantAsStaff.Users.Root + "/{user_account_id}";
				public static string UpsertFn(string roleId, string userAccountId) {
					return $"{Routes.Roles.ForTenantAsStaff.Users.RootFn(roleId)}/{userAccountId}";
				}
			}
		}
	}
}
