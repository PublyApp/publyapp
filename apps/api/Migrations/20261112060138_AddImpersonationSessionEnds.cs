using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddImpersonationSessionEnds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "impersonation_session_ends",
                columns: table => new
                {
                    session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    ended_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    reason = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_impersonation_session_ends", x => x.session_id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_impersonation_session_ends_ended_at_session_id",
                table: "impersonation_session_ends",
                columns: new[] { "ended_at", "session_id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "impersonation_session_ends");
        }
    }
}
