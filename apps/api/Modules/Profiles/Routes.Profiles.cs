#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Profile routes
	/// </summary>
	public static class Profiles {
		/// <summary>Staff profile routes (staff managing staff profiles)</summary>
		public static class ForStaff {
			public const string Root = "/profiles";
			public const string Create = "/";
			public const string Find = "/";
			// Single endpoint that accepts a profileId array and deletes matching staff
			// profiles in one request.
			public const string BulkDelete = "/bulk-delete";
			public const string Get = "/{profileId}";
			public static string GetFn(string profileId) {
				return $"/{profileId}";
			}

			// PATCH semantics: profile details are updated via a partial update (name/description).
			public const string Update = "/{profileId}";
			public static string UpdateFn(string profileId) {
				return $"/{profileId}";
			}

			public const string Delete = "/{profileId}";
			public static string DeleteFn(string profileId) {
				return $"/{profileId}";
			}

			/// <summary>Staff profile permissions routes</summary>
			public static class Permissions {
				// NOTE: This is relative to "/staff" and "/profiles" route grouping.
				// We expose permission assignment as an idempotent "upsert" endpoint per key:
				// POST assigns, DELETE unassigns.
				public const string Root = "/{profileId}/permissions";
				public static string RootFn(string profileId) {
					return $"/{profileId}/permissions";
				}

				/// <summary>List permission keys assigned to a staff profile</summary>
				public const string Find = Root;
				public static string FindFn(string profileId) {
					return RootFn(profileId);
				}

				/// <summary>Assign or unassign a permission key on a staff profile</summary>
				public const string Upsert = Root + "/{permissionKey}";
				public static string UpsertFn(string profileId, string permissionKey) {
					return $"{RootFn(profileId)}/{permissionKey}";
				}
			}

			/// <summary>
			/// Staff profile users routes (staff viewing users assigned to a staff
			/// profile).
			/// </summary>
			public static class Users {
				// NOTE: This is relative to "/staff" and "/profiles" route grouping.
				public const string Root = "/{profileId}/users";
				public static string RootFn(string profileId) {
					return $"/{profileId}/users";
				}

				/// <summary>Find users assigned to a staff profile</summary>
				public const string Find = Root;
				public static string FindFn(string profileId) {
					return RootFn(profileId);
				}

				/// <summary>
				/// Batch-resolve whether a set of staff users is assigned to a staff profile.
				/// This exists to avoid N+1 per-row profile requests in list UIs (assignment drawers).
				/// </summary>
				public const string ResolveAssignment = Root + "/assignment-resolution";
				public static string ResolveAssignmentFn(string profileId) {
					return $"{RootFn(profileId)}/assignment-resolution";
				}

				/// <summary>
				/// Bulk-unassign staff users from a staff profile.
				/// </summary>
				public const string Unassign = Root + "/unassign";
				public static string UnassignFn(string profileId) {
					return $"{RootFn(profileId)}/unassign";
				}
			}
		}

		/// <summary>Tenant profile routes (staff viewing tenant profiles)</summary>
		public static class ForTenantAsStaff {
			public const string Root = "/tenants/{tenantId}/profiles";
			public static string RootFn(string tenantId) {
				return $"/tenants/{tenantId}/profiles";
			}

			public const string Find = "/";
			public static string FindFn(string tenantId) {
				return $"{RootFn(tenantId)}/";
			}

			/// <summary>
			/// Batch-resolve tenant profile NAMES to profile ids for bulk entry (the invite
			/// drawer's CSV/Excel import). Case-insensitive over live scope-1 non-deleted
			/// rows; a name matching several live rows reports ambiguous because
			/// ux_profiles_tenant_name is case-sensitive.
			/// </summary>
			public const string ResolveNames = "/resolve-names";
			public static string ResolveNamesFn(string tenantId) {
				return $"{RootFn(tenantId)}/resolve-names";
			}

			// Bulk tenant profile deletion is scoped by tenantId route and uses one
			// request body containing multiple profile IDs.
			public const string BulkDelete = "/bulk-delete";
			public const string Get = "/{profileId}";
			public static string GetFn(string profileId) {
				return $"/{profileId}";
			}

			public const string Create = "/";
			public const string Update = "/{profileId}";
			public static string UpdateFn(string profileId) {
				return $"/{profileId}";
			}

			public const string Delete = "/{profileId}";
			public static string DeleteFn(string profileId) {
				return $"/{profileId}";
			}

			/// <summary>Tenant profile permissions routes</summary>
			public static class Permissions {
				public const string Root = "/{profileId}/permissions";
				public static string RootFn(string profileId) {
					return $"/{profileId}/permissions";
				}

				public const string Find = Root;
				public static string FindFn(string profileId) {
					return RootFn(profileId);
				}

				public const string Upsert = Root + "/{permissionKey}";
				public static string UpsertFn(string profileId, string permissionKey) {
					return $"{RootFn(profileId)}/{permissionKey}";
				}
			}

			/// <summary>
			/// Tenant profile users routes (staff managing the members assigned to a
			/// tenant profile).
			/// </summary>
			public static class Users {
				// NOTE: This is relative to "/staff" and "/tenants/{tenantId}/profiles"
				// route grouping.
				public const string Root = "/{profileId}/users";
				public static string RootFn(string profileId) {
					return $"/{profileId}/users";
				}

				/// <summary>Find tenant members assigned to a tenant profile</summary>
				public const string Find = Root;
				public static string FindFn(string profileId) {
					return RootFn(profileId);
				}

				/// <summary>
				/// Batch-resolve whether a set of tenant member accounts is assigned to a
				/// tenant profile. Mirrors Users.ResolveAssignment on the staff-profiles axis;
				/// this exists to avoid N+1 per-row profile requests in list UIs (assignment
				/// drawers).
				/// </summary>
				public const string ResolveAssignment = Root + "/assignment-resolution";
				public static string ResolveAssignmentFn(string profileId) {
					return $"{RootFn(profileId)}/assignment-resolution";
				}

				// Membership is exposed as an idempotent per-member "upsert" toggle keyed by
				// the member's account id, mirroring Permissions.Upsert in this same group:
				// POST assigns, DELETE unassigns. This is what lets the members UI toggle a
				// single row without a batch confirm step.
				// The placeholder is snake_case per the URL-parameter convention; handlers bind
				// it explicitly to an idiomatic C# `userAccountId`.
				public const string Upsert = Root + "/{user_account_id}";
				public static string UpsertFn(string profileId, string userAccountId) {
					return $"{RootFn(profileId)}/{userAccountId}";
				}
			}
		}
	}
}
