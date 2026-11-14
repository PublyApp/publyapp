using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUserLastSignInAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "last_sign_in_at",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            // Backfill: the newest of the durable login audit rows (survive logout and
            // the session sweep) and the sessions still stored (sign-ins that predate
            // the audit action). Impersonation sessions are not sign-ins.
            migrationBuilder.Sql(@"
UPDATE users u
SET last_sign_in_at = s.last_at
FROM (
    SELECT user_id, MAX(at) AS last_at
    FROM (
        SELECT user_id, created_at AS at
        FROM sessions
        WHERE is_impersonation = false
        UNION ALL
        SELECT user_id, created_at AS at
        FROM audit_logs
        WHERE action = 'auth.login.succeeded' AND is_deleted = false
    ) events
    GROUP BY user_id
) s
WHERE s.user_id = u.id;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "last_sign_in_at",
                table: "users");
        }
    }
}
