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
    /// 4. carry pending Admin invitations (staff and tenant) over to the full-access
    ///    profile so accepting them still yields full access,
    /// 5. only then drop the three columns.
    ///
    /// Idempotence: every data step is guarded by NOT EXISTS, so a retried migration
    /// never creates a second system profile, never promotes a tenant's custom profile
    /// and never duplicates an assignment or invitation link. A tenant may already own
    /// custom profiles named "Owner" and/or "Owner (full access)": neither is ever
    /// promoted, and the new system profile falls back to a numeric suffix that provably
    /// does not exist for that tenant. Soft-deleted tenants get no system profile.
    ///
    /// Project scope: project accounts and project invitations never carried the Admin
    /// level (they are created at level 10 / NULL), so there is no project branch. A
    /// guard at the top of Up() aborts the migration if such a row is ever found, rather
    /// than silently losing its intent when the columns go.
    ///
    /// Deployment: single SHA only — migrate, api, worker and front ship together, so no
    /// mixed-version window exists in which an old binary still writes these columns.
    /// The three DropColumn calls carry the expand-contract acknowledgement for #2289.
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
            // M2 guard: project scope never used the Admin level (project accounts are
            // created at level 10, project invitations carry no account level). If that
            // ever stopped being true, dropping the columns would silently erase the
            // intent of those rows — abort loudly instead.
            migrationBuilder.Sql(
                """
                DO $$
                DECLARE
                    account_count integer;
                    invitation_count integer;
                BEGIN
                    SELECT count(*) INTO account_count
                    FROM user_accounts
                    WHERE scope = 2
                      AND level = 50;

                    SELECT count(*) INTO invitation_count
                    FROM invitations
                    WHERE scope = 2
                      AND account_level = 50;

                    IF account_count > 0 OR invitation_count > 0 THEN
                        RAISE EXCEPTION
                            'RemoveAccountLevel aborted: % project-scope user_accounts row(s) with level = 50 and % project-scope invitations row(s) with account_level = 50 exist. Project scope never used the Admin level; refusing to remove the columns and silently lose that intent. Migrate these rows to the intended profile first.',
                            account_count,
                            invitation_count;
                    END IF;
                END $$;
                """);

            migrationBuilder.AddColumn<bool>(
                name: "is_full_access",
                table: "profiles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // A) Staff scope full-access profile. The seeder creates it as "Staff Owner";
            //    mark that seeded row when it already exists, otherwise create it. Both
            //    statements are skipped when a full-access staff profile already exists,
            //    so a retried migration cannot add a second one.
            migrationBuilder.Sql(
                """
                UPDATE profiles
                SET is_full_access = true,
                    updated_at = now()
                WHERE scope = 0
                  AND name = 'Staff Owner'
                  AND is_deleted = false
                  AND NOT EXISTS (
                      SELECT 1 FROM profiles f
                      WHERE f.scope = 0
                        AND f.is_full_access = true
                        AND f.is_deleted = false
                  );

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
                    SELECT 1 FROM profiles f
                    WHERE f.scope = 0
                      AND f.is_full_access = true
                      AND f.is_deleted = false
                );
                """);

            // B) One tenant-scope full-access profile per non-deleted tenant, named
            //    "Owner" — the same name TenantAsStaffService creates for new tenants. A
            //    tenant may already own custom, limited profiles called "Owner" and/or
            //    "Owner (full access)": never promote them (that would silently grant
            //    full access to their members). The new system profile takes the first
            //    free name among "Owner", "Owner (full access)", then numeric suffixes,
            //    and tenants that already have a full-access profile are skipped.
            migrationBuilder.Sql(
                """
                INSERT INTO profiles
                    (name, description, scope, tenant_id, is_default, is_full_access, created_at, updated_at, is_deleted)
                SELECT
                    candidate.name,
                    'Organization owner with full access',
                    1,
                    t.id,
                    false,
                    true,
                    now(),
                    now(),
                    false
                FROM tenants t
                CROSS JOIN LATERAL (
                    SELECT c.name
                    FROM (
                        SELECT
                            1 AS rank,
                            CASE WHEN EXISTS (
                                SELECT 1 FROM profiles p
                                WHERE p.scope = 1
                                  AND p.tenant_id = t.id
                                  AND p.name = 'Owner'
                                  AND p.is_deleted = false
                            ) THEN 'Owner (full access)' ELSE 'Owner' END AS name
                        UNION ALL
                        SELECT
                            n,
                            CASE WHEN EXISTS (
                                SELECT 1 FROM profiles p
                                WHERE p.scope = 1
                                  AND p.tenant_id = t.id
                                  AND p.name = 'Owner'
                                  AND p.is_deleted = false
                            ) THEN 'Owner (full access) ' || n ELSE 'Owner ' || n END
                        FROM generate_series(2, 1000) AS n
                    ) c
                    WHERE NOT EXISTS (
                        SELECT 1 FROM profiles p
                        WHERE p.scope = 1
                          AND p.tenant_id = t.id
                          AND p.name = c.name
                          AND p.is_deleted = false
                    )
                    ORDER BY c.rank
                    LIMIT 1
                ) AS candidate
                WHERE t.is_deleted = false
                  AND NOT EXISTS (
                      SELECT 1 FROM profiles p
                      WHERE p.scope = 1
                        AND p.tenant_id = t.id
                        AND p.is_full_access = true
                        AND p.is_deleted = false
                  );
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
                 AND p.is_full_access = true
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
                 AND p.is_full_access = true
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
            //    accepted; the profile list is now the only carrier of that intent. Staff
            //    invitations (scope 0) carry no tenant, so they need their own branch
            //    pointing at the staff full-access profile.
            migrationBuilder.Sql(
                """
                INSERT INTO invitation_profiles (invitation_id, profile_id, created_at, updated_at)
                SELECT i.id, p.id, now(), now()
                FROM invitations i
                JOIN profiles p
                  ON p.scope = 1
                 AND p.tenant_id = i.tenant_id
                 AND p.is_full_access = true
                 AND p.is_deleted = false
                WHERE i.account_level = 50
                  AND i.status = 0
                  AND i.is_deleted = false
                  AND i.scope = 1
                  AND i.tenant_id IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM invitation_profiles x
                      WHERE x.invitation_id = i.id
                        AND x.profile_id = p.id
                  );

                INSERT INTO invitation_profiles (invitation_id, profile_id, created_at, updated_at)
                SELECT i.id, p.id, now(), now()
                FROM invitations i
                JOIN profiles p
                  ON p.scope = 0
                 AND p.is_full_access = true
                 AND p.is_deleted = false
                WHERE i.account_level = 50
                  AND i.status = 0
                  AND i.is_deleted = false
                  AND i.scope = 0
                  AND NOT EXISTS (
                      SELECT 1 FROM invitation_profiles x
                      WHERE x.invitation_id = i.id
                        AND x.profile_id = p.id
                  );
                """);

            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2289)
            migrationBuilder.DropColumn(
                name: "level",
                table: "user_accounts");

            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2289)
            migrationBuilder.DropColumn(
                name: "account_level",
                table: "invitations");

            // expand-contract-ok: single-SHA deploy, no mixed-version window (#2289)
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

            // Remove the tenant-scope system profiles Up() added. They are exactly the
            // scope=1 rows carrying is_full_access: the column only exists because Up()
            // created it, and only Up() (then the new seeder) ever sets it. Leaving them
            // behind makes a later Up() abort on ux_profiles_tenant_name — a partial
            // unique index on (tenant_id, name) — because the "Owner" profile it wants to
            // insert is still there. Assignments cascade from profiles; invitation links
            // are Restrict.
            migrationBuilder.Sql(
                """
                DELETE FROM invitation_profiles ip
                USING profiles p
                WHERE p.id = ip.profile_id
                  AND p.scope = 1
                  AND p.is_full_access = true;

                DELETE FROM profiles
                WHERE scope = 1
                  AND is_full_access = true;
                """);

            migrationBuilder.DropColumn(
                name: "is_full_access",
                table: "profiles");
        }
    }
}
