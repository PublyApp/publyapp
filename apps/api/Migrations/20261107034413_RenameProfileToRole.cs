using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <summary>
    /// Renames the permission-group concept from "profile" to "role" everywhere in the
    /// schema, without losing data (#2290).
    ///
    /// Every table, column, index and constraint is renamed in place — nothing is
    /// dropped and recreated, so existing role rows, their permission grants, and their
    /// member / invitation links survive untouched. Stored strings that carry the old
    /// vocabulary are rewritten in the same transaction:
    /// <list type="bullet">
    ///   <item>permission keys <c>{scope}.profiles.*</c> → <c>{scope}.roles.*</c>
    ///   (the <c>permissions</c> catalogue rows and every <c>role_permissions</c> link);</item>
    ///   <item>audit-log action names <c>staff.profile.*</c> / <c>tenant.profile.*</c> →
    ///   <c>staff.role.*</c> / <c>tenant.role.*</c>, so the history UI keeps rendering
    ///   past events instead of falling back to a raw action string.</item>
    /// </list>
    ///
    /// Deployment: single SHA only — migrate, api, worker and front ship together, so no
    /// mixed-version window exists in which an old binary still reads <c>profiles</c> or
    /// writes <c>staff.profiles.*</c>. The rename calls and the one constraint drop/re-add
    /// pair that the permission-key rewrite needs carry the expand-contract
    /// acknowledgement for #2290.
    /// </summary>
    public partial class RenameProfileToRole : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Tables keep their rows: ALTER TABLE ... RENAME TO, never drop + create.
            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2290)
            migrationBuilder.RenameTable(
                name: "profiles",
                newName: "roles");

            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2290)
            migrationBuilder.RenameTable(
                name: "profile_permissions",
                newName: "role_permissions");

            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2290)
            migrationBuilder.RenameTable(
                name: "user_account_profiles",
                newName: "user_account_roles");

            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2290)
            migrationBuilder.RenameTable(
                name: "invitation_profiles",
                newName: "invitation_roles");

            // 2. Junction-table foreign keys: profile_id -> role_id in place.
            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2290)
            migrationBuilder.RenameColumn(
                name: "profile_id",
                table: "role_permissions",
                newName: "role_id");

            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2290)
            migrationBuilder.RenameColumn(
                name: "profile_id",
                table: "user_account_roles",
                newName: "role_id");

            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2290)
            migrationBuilder.RenameColumn(
                name: "profile_id",
                table: "invitation_roles",
                newName: "role_id");

            // 3. Indexes: PostgreSQL keeps their old names across a table rename, so they
            // are renamed explicitly to the names the new model expects.
            migrationBuilder.RenameIndex(
                name: "ix_profiles_staff_name_id",
                table: "roles",
                newName: "ix_roles_staff_name_id");

            migrationBuilder.RenameIndex(
                name: "ix_profiles_staff_created_at_id",
                table: "roles",
                newName: "ix_roles_staff_created_at_id");

            migrationBuilder.RenameIndex(
                name: "ux_profiles_tenant_name",
                table: "roles",
                newName: "ux_roles_tenant_name");

            migrationBuilder.RenameIndex(
                name: "ux_profiles_tenant_default_profile",
                table: "roles",
                newName: "ux_roles_tenant_default_role");

            migrationBuilder.RenameIndex(
                name: "IX_profiles_project_id",
                table: "roles",
                newName: "IX_roles_project_id");

            migrationBuilder.RenameIndex(
                name: "IX_profile_permissions_permission_key",
                table: "role_permissions",
                newName: "IX_role_permissions_permission_key");

            migrationBuilder.RenameIndex(
                name: "IX_user_account_profiles_profile_id",
                table: "user_account_roles",
                newName: "IX_user_account_roles_role_id");

            migrationBuilder.RenameIndex(
                name: "IX_invitation_profiles_profile_id",
                table: "invitation_roles",
                newName: "IX_invitation_roles_role_id");

            // 4. Primary keys, foreign keys and check constraints carry the old vocabulary
            // in their names too. ALTER TABLE ... RENAME CONSTRAINT is metadata-only.
            migrationBuilder.Sql(
                """
                ALTER TABLE roles RENAME CONSTRAINT "PK_profiles" TO "PK_roles";
                ALTER TABLE roles RENAME CONSTRAINT "FK_profiles_projects_project_id" TO "FK_roles_projects_project_id";
                ALTER TABLE roles RENAME CONSTRAINT "FK_profiles_tenants_tenant_id" TO "FK_roles_tenants_tenant_id";
                ALTER TABLE roles RENAME CONSTRAINT "CK_Profile_Staff_Constraints" TO "CK_Role_Staff_Constraints";
                ALTER TABLE roles RENAME CONSTRAINT "CK_Profile_Tenant_Constraints" TO "CK_Role_Tenant_Constraints";
                ALTER TABLE roles RENAME CONSTRAINT "CK_Profile_Project_Constraints" TO "CK_Role_Project_Constraints";

                ALTER TABLE role_permissions RENAME CONSTRAINT "PK_profile_permissions" TO "PK_role_permissions";
                ALTER TABLE role_permissions RENAME CONSTRAINT "FK_profile_permissions_profiles_profile_id" TO "FK_role_permissions_roles_role_id";
                ALTER TABLE role_permissions RENAME CONSTRAINT "FK_profile_permissions_permissions_permission_key" TO "FK_role_permissions_permissions_permission_key";

                ALTER TABLE user_account_roles RENAME CONSTRAINT "PK_user_account_profiles" TO "PK_user_account_roles";
                ALTER TABLE user_account_roles RENAME CONSTRAINT "FK_user_account_profiles_profiles_profile_id" TO "FK_user_account_roles_roles_role_id";
                ALTER TABLE user_account_roles RENAME CONSTRAINT "FK_user_account_profiles_user_accounts_user_account_id" TO "FK_user_account_roles_user_accounts_user_account_id";

                ALTER TABLE invitation_roles RENAME CONSTRAINT "PK_invitation_profiles" TO "PK_invitation_roles";
                ALTER TABLE invitation_roles RENAME CONSTRAINT "FK_invitation_profiles_profiles_profile_id" TO "FK_invitation_roles_roles_role_id";
                ALTER TABLE invitation_roles RENAME CONSTRAINT "FK_invitation_profiles_invitations_invitation_id" TO "FK_invitation_roles_invitations_invitation_id";
                """);

            // 5. Stored vocabulary: the audit trail must keep resolving after the rename.
            migrationBuilder.Sql(
                """
                UPDATE audit_logs
                SET action = replace(action, 'staff.profile.', 'staff.role.')
                WHERE action LIKE 'staff.profile.%';

                UPDATE audit_logs
                SET action = replace(action, 'tenant.profile.', 'tenant.role.')
                WHERE action LIKE 'tenant.profile.%';
                """);

            // 6. Stored permission keys: {scope}.profiles.* -> {scope}.roles.*, including
            // the per-key suffix (_profile -> _role) of the role-user read permissions.
            // role_permissions.permission_key references permissions.key, and Postgres
            // foreign keys are not deferrable, so the constraint is lifted for the swap
            // and restored with the same definition right after.
            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2290)
            migrationBuilder.Sql(
                """
                ALTER TABLE role_permissions
                DROP CONSTRAINT "FK_role_permissions_permissions_permission_key";

                UPDATE role_permissions
                SET permission_key = replace(
                    replace(permission_key, '.profiles.', '.roles.'),
                    '_profile',
                    '_role'
                )
                WHERE permission_key LIKE 'staff.profiles.%'
                   OR permission_key LIKE 'tenant.profiles.%'
                   OR permission_key LIKE 'project.profiles.%';

                UPDATE permissions
                SET key = replace(
                    replace(key, '.profiles.', '.roles.'),
                    '_profile',
                    '_role'
                )
                WHERE key LIKE 'staff.profiles.%'
                   OR key LIKE 'tenant.profiles.%'
                   OR key LIKE 'project.profiles.%';

                ALTER TABLE role_permissions
                ADD CONSTRAINT "FK_role_permissions_permissions_permission_key"
                FOREIGN KEY (permission_key) REFERENCES permissions (key) ON DELETE CASCADE;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Inverse of Up(): the schema and the stored vocabulary go back to "profile".
            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2290)
            migrationBuilder.Sql(
                """
                ALTER TABLE role_permissions
                DROP CONSTRAINT "FK_role_permissions_permissions_permission_key";

                UPDATE role_permissions
                SET permission_key = replace(
                    replace(permission_key, '.roles.', '.profiles.'),
                    '_role',
                    '_profile'
                )
                WHERE permission_key LIKE 'staff.roles.%'
                   OR permission_key LIKE 'tenant.roles.%'
                   OR permission_key LIKE 'project.roles.%';

                UPDATE permissions
                SET key = replace(
                    replace(key, '.roles.', '.profiles.'),
                    '_role',
                    '_profile'
                )
                WHERE key LIKE 'staff.roles.%'
                   OR key LIKE 'tenant.roles.%'
                   OR key LIKE 'project.roles.%';

                ALTER TABLE role_permissions
                ADD CONSTRAINT "FK_role_permissions_permissions_permission_key"
                FOREIGN KEY (permission_key) REFERENCES permissions (key) ON DELETE CASCADE;

                UPDATE audit_logs
                SET action = replace(action, 'staff.role.', 'staff.profile.')
                WHERE action LIKE 'staff.role.%';

                UPDATE audit_logs
                SET action = replace(action, 'tenant.role.', 'tenant.profile.')
                WHERE action LIKE 'tenant.role.%';
                """);

            migrationBuilder.Sql(
                """
                ALTER TABLE invitation_roles RENAME CONSTRAINT "PK_invitation_roles" TO "PK_invitation_profiles";
                ALTER TABLE invitation_roles RENAME CONSTRAINT "FK_invitation_roles_roles_role_id" TO "FK_invitation_profiles_profiles_profile_id";
                ALTER TABLE invitation_roles RENAME CONSTRAINT "FK_invitation_roles_invitations_invitation_id" TO "FK_invitation_profiles_invitations_invitation_id";

                ALTER TABLE user_account_roles RENAME CONSTRAINT "PK_user_account_roles" TO "PK_user_account_profiles";
                ALTER TABLE user_account_roles RENAME CONSTRAINT "FK_user_account_roles_roles_role_id" TO "FK_user_account_profiles_profiles_profile_id";
                ALTER TABLE user_account_roles RENAME CONSTRAINT "FK_user_account_roles_user_accounts_user_account_id" TO "FK_user_account_profiles_user_accounts_user_account_id";

                ALTER TABLE role_permissions RENAME CONSTRAINT "PK_role_permissions" TO "PK_profile_permissions";
                ALTER TABLE role_permissions RENAME CONSTRAINT "FK_role_permissions_roles_role_id" TO "FK_profile_permissions_profiles_profile_id";
                ALTER TABLE role_permissions RENAME CONSTRAINT "FK_role_permissions_permissions_permission_key" TO "FK_profile_permissions_permissions_permission_key";

                ALTER TABLE roles RENAME CONSTRAINT "PK_roles" TO "PK_profiles";
                ALTER TABLE roles RENAME CONSTRAINT "FK_roles_projects_project_id" TO "FK_profiles_projects_project_id";
                ALTER TABLE roles RENAME CONSTRAINT "FK_roles_tenants_tenant_id" TO "FK_profiles_tenants_tenant_id";
                ALTER TABLE roles RENAME CONSTRAINT "CK_Role_Staff_Constraints" TO "CK_Profile_Staff_Constraints";
                ALTER TABLE roles RENAME CONSTRAINT "CK_Role_Tenant_Constraints" TO "CK_Profile_Tenant_Constraints";
                ALTER TABLE roles RENAME CONSTRAINT "CK_Role_Project_Constraints" TO "CK_Profile_Project_Constraints";
                """);

            migrationBuilder.RenameIndex(
                name: "IX_invitation_roles_role_id",
                table: "invitation_roles",
                newName: "IX_invitation_profiles_profile_id");

            migrationBuilder.RenameIndex(
                name: "IX_user_account_roles_role_id",
                table: "user_account_roles",
                newName: "IX_user_account_profiles_profile_id");

            migrationBuilder.RenameIndex(
                name: "IX_role_permissions_permission_key",
                table: "role_permissions",
                newName: "IX_profile_permissions_permission_key");

            migrationBuilder.RenameIndex(
                name: "IX_roles_project_id",
                table: "roles",
                newName: "IX_profiles_project_id");

            migrationBuilder.RenameIndex(
                name: "ux_roles_tenant_default_role",
                table: "roles",
                newName: "ux_profiles_tenant_default_profile");

            migrationBuilder.RenameIndex(
                name: "ux_roles_tenant_name",
                table: "roles",
                newName: "ux_profiles_tenant_name");

            migrationBuilder.RenameIndex(
                name: "ix_roles_staff_created_at_id",
                table: "roles",
                newName: "ix_profiles_staff_created_at_id");

            migrationBuilder.RenameIndex(
                name: "ix_roles_staff_name_id",
                table: "roles",
                newName: "ix_profiles_staff_name_id");

            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2290)
            migrationBuilder.RenameColumn(
                name: "role_id",
                table: "invitation_roles",
                newName: "profile_id");

            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2290)
            migrationBuilder.RenameColumn(
                name: "role_id",
                table: "user_account_roles",
                newName: "profile_id");

            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2290)
            migrationBuilder.RenameColumn(
                name: "role_id",
                table: "role_permissions",
                newName: "profile_id");

            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2290)
            migrationBuilder.RenameTable(
                name: "invitation_roles",
                newName: "invitation_profiles");

            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2290)
            migrationBuilder.RenameTable(
                name: "user_account_roles",
                newName: "user_account_profiles");

            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2290)
            migrationBuilder.RenameTable(
                name: "role_permissions",
                newName: "profile_permissions");

            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2290)
            migrationBuilder.RenameTable(
                name: "roles",
                newName: "profiles");
        }
    }
}
