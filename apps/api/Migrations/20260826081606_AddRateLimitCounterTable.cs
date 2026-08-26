using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRateLimitCounterTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "rate_limit_counters",
                columns: table => new
                {
                    policy_name = table.Column<string>(type: "text", nullable: false),
                    partition_key_hash = table.Column<string>(type: "text", nullable: false),
                    window_started_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    permit_count = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rate_limit_counters", x => new { x.policy_name, x.partition_key_hash, x.window_started_at });
                    table.CheckConstraint("CK_RateLimitCounters_PermitCount", "permit_count >= 0");
                });

            migrationBuilder.CreateIndex(
                name: "ix_rate_limit_counters_window_started_at",
                table: "rate_limit_counters",
                column: "window_started_at");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "rate_limit_counters");
        }
    }
}
