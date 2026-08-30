using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddUserAccountMembershipUniqueness : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "IX_user_accounts_user_id_tenant_id",
					table: "user_accounts");

			migrationBuilder.DropIndex(
					name: "IX_user_accounts_user_id_tenant_id_project_id_scope",
					table: "user_accounts");

			// round-6 API F1: the old composite index this migration replaces allowed
			// NULL tenant/project columns to repeat, so historical data can already
			// contain duplicate active staff/tenant/project memberships for the same
			// user (exactly the case TenantUserMembershipOperations.cs already works
			// around by picking the newest row instead of throwing). Creating the new
			// unique indexes below without repairing that data first raises 23505 and
			// aborts the whole migration transaction on any environment where it
			// happened. For each scope: keep the newest active row (same tie-break the
			// app layer already uses — CreatedAt DESC), move the losers' profile
			// assignments onto the survivor so no assignment is silently dropped, then
			// soft-delete the losers exactly like every other membership-removal path
			// in this codebase.
			DeduplicateActiveStaffMemberships(migrationBuilder);
			DeduplicateActiveTenantMemberships(migrationBuilder);
			DeduplicateActiveProjectMemberships(migrationBuilder);

			migrationBuilder.CreateIndex(
					name: "ux_user_accounts_project_active",
					table: "user_accounts",
					columns: new[] { "user_id", "project_id" },
					unique: true,
					filter: "\"scope\" = 2 AND \"is_deleted\" = false");

			migrationBuilder.CreateIndex(
					name: "ux_user_accounts_staff_active",
					table: "user_accounts",
					column: "user_id",
					unique: true,
					filter: "\"scope\" = 0 AND \"is_deleted\" = false");

			migrationBuilder.CreateIndex(
					name: "ux_user_accounts_tenant_active",
					table: "user_accounts",
					columns: new[] { "user_id", "tenant_id" },
					unique: true,
					filter: "\"scope\" = 1 AND \"project_id\" IS NULL AND \"is_deleted\" = false");
		}

		private static void DeduplicateActiveStaffMemberships(MigrationBuilder migrationBuilder) {
			RunDedup(
					migrationBuilder,
					tempTable: "_dedup_staff",
					selectPartition: "user_id",
					groupByPartition: "user_id",
					scopeWhere: "scope = 0",
					scopeWhereAliased: "ua.scope = 0",
					joinOn: "ua.user_id IS NOT DISTINCT FROM d.user_id",
					havingLabel: "user_id (staff)");
		}

		private static void DeduplicateActiveTenantMemberships(MigrationBuilder migrationBuilder) {
			RunDedup(
					migrationBuilder,
					tempTable: "_dedup_tenant",
					selectPartition: "user_id, tenant_id",
					groupByPartition: "user_id, tenant_id",
					scopeWhere: "scope = 1 AND project_id IS NULL",
					scopeWhereAliased: "ua.scope = 1 AND ua.project_id IS NULL",
					joinOn: "ua.user_id IS NOT DISTINCT FROM d.user_id "
							+ "AND ua.tenant_id IS NOT DISTINCT FROM d.tenant_id",
					havingLabel: "user_id, tenant_id (tenant)");
		}

		private static void DeduplicateActiveProjectMemberships(MigrationBuilder migrationBuilder) {
			RunDedup(
					migrationBuilder,
					tempTable: "_dedup_project",
					selectPartition: "user_id, project_id",
					groupByPartition: "user_id, project_id",
					scopeWhere: "scope = 2",
					scopeWhereAliased: "ua.scope = 2",
					joinOn: "ua.user_id IS NOT DISTINCT FROM d.user_id "
							+ "AND ua.project_id IS NOT DISTINCT FROM d.project_id",
					havingLabel: "user_id, project_id (project)");
		}

		// Deduplicates active (is_deleted = false) user_accounts rows within one
		// uniqueness scope down to a single survivor per partition key, migrating
		// dependent user_account_profiles rows onto the survivor before soft-deleting
		// the losers. A no-op (empty temp table, no rows touched) when there are no
		// duplicates, which is the expected case on every environment that already
		// has no legacy data.
		private static void RunDedup(
				MigrationBuilder migrationBuilder,
				string tempTable,
				string selectPartition,
				string groupByPartition,
				string scopeWhere,
				string scopeWhereAliased,
				string joinOn,
				string havingLabel) {
			migrationBuilder.Sql($"""
                CREATE TEMP TABLE {tempTable} AS
                SELECT {selectPartition}, (array_agg(id ORDER BY created_at DESC, id DESC))[1] AS winner_id
                FROM user_accounts
                WHERE {scopeWhere} AND is_deleted = false
                GROUP BY {groupByPartition}
                HAVING COUNT(*) > 1;
                """);

			// Move each loser's profile assignments onto the survivor before the
			// loser is soft-deleted, so a duplicate membership's profile grants are
			// preserved on the row that remains active.
			migrationBuilder.Sql($"""
                INSERT INTO user_account_profiles (user_account_id, profile_id, created_at, updated_at)
                SELECT d.winner_id, uap.profile_id, uap.created_at, uap.updated_at
                FROM user_account_profiles uap
                JOIN user_accounts ua ON ua.id = uap.user_account_id
                JOIN {tempTable} d ON {joinOn}
                WHERE {scopeWhereAliased} AND ua.is_deleted = false AND ua.id <> d.winner_id
                ON CONFLICT (user_account_id, profile_id) DO NOTHING;
                """);

			migrationBuilder.Sql($"""
                UPDATE user_accounts ua
                SET is_deleted = true, deleted_at = now(), updated_at = now()
                FROM {tempTable} d
                WHERE {joinOn}
                    AND {scopeWhereAliased}
                    AND ua.is_deleted = false
                    AND ua.id <> d.winner_id;
                """);

			// Fail loudly here (with a clear message) instead of letting the
			// CREATE UNIQUE INDEX below abort with a bare 23505 if the repair above
			// somehow left a duplicate group behind.
			migrationBuilder.Sql($"""
                DO $$
                DECLARE
                    remaining_duplicates INTEGER;
                BEGIN
                    SELECT COUNT(*) INTO remaining_duplicates FROM (
                        SELECT {selectPartition}
                        FROM user_accounts
                        WHERE {scopeWhere} AND is_deleted = false
                        GROUP BY {groupByPartition}
                        HAVING COUNT(*) > 1
                    ) remaining;

                    IF remaining_duplicates > 0 THEN
                        RAISE EXCEPTION
                            'AddUserAccountMembershipUniqueness: % duplicate active membership group(s) remain for {havingLabel} after dedup',
                            remaining_duplicates;
                    END IF;
                END $$;
                """);

			migrationBuilder.Sql($"DROP TABLE {tempTable};");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "ux_user_accounts_project_active",
					table: "user_accounts");

			migrationBuilder.DropIndex(
					name: "ux_user_accounts_staff_active",
					table: "user_accounts");

			migrationBuilder.DropIndex(
					name: "ux_user_accounts_tenant_active",
					table: "user_accounts");

			migrationBuilder.CreateIndex(
					name: "IX_user_accounts_user_id_tenant_id",
					table: "user_accounts",
					columns: new[] { "user_id", "tenant_id" });

			migrationBuilder.CreateIndex(
					name: "IX_user_accounts_user_id_tenant_id_project_id_scope",
					table: "user_accounts",
					columns: new[] { "user_id", "tenant_id", "project_id", "scope" },
					unique: true);
		}
	}
}
