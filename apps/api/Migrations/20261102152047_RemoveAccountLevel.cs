using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <summary>
    /// Removes the account level concept (#2289). Full access becomes the seedable
    /// <c>profiles.is_full_access</c> system profile — one per scope — so every former
    /// <c>Admin</c> must hold that profile before <c>level</c> disappears.
    ///
    /// Order is deliberate:
    /// 1. add the flag,
    /// 2. create the full-access profile wherever it is missing (staff scope, and one
    ///    per tenant) and mark the seeded ones,
    /// 3. copy every Admin account's full access into a profile assignment,
    /// 4. carry pending Admin invitations over to the full-access profile so accepting
    ///    them still yields full access,
    /// 5. only then drop the three columns.
    ///
    /// Existing profile assignments are never touched. Down() reconstructs
    /// <c>level</c>/<c>account_level</c> from full-access profile membership, which is a
    /// lossy link back to the old model but is the truthful inverse of what Up() did.
    /// </summary>
    public partial class RemoveAccountLevel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_full_access",
                table: "profiles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // A) Staff scope full-access profile. The seeder creates it as "Staff Owner";
            //    recreate that exact name so seeding stays idempotent afterwards.
            migrationBuilder.Sql(
                """
                INSERT INTO profiles
                    (name, description, scope, is_default, is_full_access, created_at, updated_at, is_deleted)
                SELECT
                    'Staff Owner',
                    'Platform owner with full system access',
                    0,
                    false,
                    true,
                    now(),
                    now(),
                    false
                WHERE NOT EXISTS (
                    SELECT 1 FROM profiles
                    WHERE scope = 0
                      AND name = 'Staff Owner'
                      AND is_deleted = false
                );

                UPDATE profiles
                SET is_full_access = true,
                    updated_at = now()
                WHERE scope = 0
                  AND name = 'Staff Owner'
                  AND is_deleted = false;
                """);

            // B) One tenant-scope full-access profile per tenant, named "Owner" — the same
            //    name TenantAsStaffService now creates for new tenants.
            migrationBuilder.Sql(
                """
                INSERT INTO profiles
                    (name, description, scope, tenant_id, is_default, is_full_access, created_at, updated_at, is_deleted)
                SELECT
                    'Owner',
                    'Organization owner with full access',
                    1,
                    t.id,
                    false,
                    true,
                    now(),
                    now(),
                    false
                FROM tenants t
                WHERE NOT EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.scope = 1
                      AND p.tenant_id = t.id
                      AND p.name = 'Owner'
                      AND p.is_deleted = false
                );

                UPDATE profiles
                SET is_full_access = true,
                    updated_at = now()
                WHERE scope = 1
                  AND name = 'Owner'
                  AND is_deleted = false;
                """);

            // C) Every former Admin keeps full access as a profile assignment.
            //    the old Admin level == 50, staff scope == 0, tenant scope == 1.
            //    Soft-deleted accounts are included: restoring one must not silently
            //    drop its full access.
            migrationBuilder.Sql(
                """
                INSERT INTO user_account_profiles (user_account_id, profile_id, created_at, updated_at)
                SELECT ua.id, p.id, now(), now()
                FROM user_accounts ua
                JOIN profiles p
                  ON p.scope = 0
                 AND p.name = 'Staff Owner'
                 AND p.is_deleted = false
                WHERE ua.level = 50
                  AND ua.scope = 0
                  AND NOT EXISTS (
                      SELECT 1 FROM user_account_profiles x
                      WHERE x.user_account_id = ua.id
                        AND x.profile_id = p.id
                  );

                INSERT INTO user_account_profiles (user_account_id, profile_id, created_at, updated_at)
                SELECT ua.id, p.id, now(), now()
                FROM user_accounts ua
                JOIN profiles p
                  ON p.scope = 1
                 AND p.tenant_id = ua.tenant_id
                 AND p.name = 'Owner'
                 AND p.is_deleted = false
                WHERE ua.level = 50
                  AND ua.scope = 1
                  AND ua.tenant_id IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM user_account_profiles x
                      WHERE x.user_account_id = ua.id
                        AND x.profile_id = p.id
                  );
                """);

            // D) A still-pending Admin invitation must still yield full access once
            //    accepted; the profile list is now the only carrier of that intent.
            migrationBuilder.Sql(
                """
                INSERT INTO invitation_profiles (invitation_id, profile_id, created_at, updated_at)
                SELECT i.id, p.id, now(), now()
                FROM invitations i
                JOIN profiles p
                  ON p.scope = 1
                 AND p.tenant_id = i.tenant_id
                 AND p.name = 'Owner'
                 AND p.is_deleted = false
                WHERE i.account_level = 50
                  AND i.status = 0
                  AND i.is_deleted = false
                  AND i.tenant_id IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM invitation_profiles x
                      WHERE x.invitation_id = i.id
                        AND x.profile_id = p.id
                  );
                """);

            migrationBuilder.DropColumn(
                name: "level",
                table: "user_accounts");

            migrationBuilder.DropColumn(
                name: "account_level",
                table: "invitations");

            migrationBuilder.DropColumn(
                name: "account_level",
                table: "invitation_email_outbox");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // 10 == the old User level, 50 == the old Admin level.
            migrationBuilder.AddColumn<int>(
                name: "level",
                table: "user_accounts",
                type: "integer",
                nullable: false,
                defaultValue: 10);

            migrationBuilder.AddColumn<int>(
                name: "account_level",
                table: "invitations",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "account_level",
                table: "invitation_email_outbox",
                type: "integer",
                nullable: true);

            // Rebuild the old level from full-access profile membership. Accounts that
            // never held it were User, which is the column default above.
            migrationBuilder.Sql(
                """
                UPDATE user_accounts ua
                SET level = 50
                WHERE EXISTS (
                    SELECT 1
                    FROM user_account_profiles uap
                    JOIN profiles p ON p.id = uap.profile_id
                    WHERE uap.user_account_id = ua.id
                      AND p.is_full_access = true
                      AND p.is_deleted = false
                );

                UPDATE invitations i
                SET account_level = 50
                WHERE EXISTS (
                    SELECT 1
                    FROM invitation_profiles ip
                    JOIN profiles p ON p.id = ip.profile_id
                    WHERE ip.invitation_id = i.id
                      AND p.is_full_access = true
                      AND p.is_deleted = false
                );

                -- The outbox carried the level only for its email wording; derive it from
                -- the invitation it delivers. Rows without a link stay NULL (User).
                UPDATE invitation_email_outbox o
                SET account_level = i.account_level
                FROM invitations i
                WHERE o.invitation_id = i.id;
                """);

            migrationBuilder.DropColumn(
                name: "is_full_access",
                table: "profiles");
        }
    }
}
