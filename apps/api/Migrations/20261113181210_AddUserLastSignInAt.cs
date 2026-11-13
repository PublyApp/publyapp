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

            // Backfill from the sessions still stored: the best history there is.
            migrationBuilder.Sql(@"
UPDATE users u
SET last_sign_in_at = s.last_created_at
FROM (
    SELECT user_id, MAX(created_at) AS last_created_at
    FROM sessions
    WHERE is_impersonation = false
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
