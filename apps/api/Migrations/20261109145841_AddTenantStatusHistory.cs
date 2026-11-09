using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <summary>
    /// Records every organisation lifecycle transition so the staff dashboard can
    /// compute an honest « active organisations per day » series (#2349).
    ///
    /// The rows are written by a trigger on <c>tenants</c>, not by application code:
    /// the status changes go through tracked entities, <c>ExecuteUpdateAsync</c> and
    /// raw <c>UPDATE</c> statements (single and bulk actions), and a trigger covers
    /// all of them — plus any future path — in the same transaction as the change.
    ///
    /// Backfill: every existing organisation gets one row dated at its creation, with
    /// the status it has today. History before this migration is APPROXIMATE: a tenant
    /// that is suspended today is treated as suspended since creation, so the past
    /// curve is flatter than the real one. Only transitions recorded from now on are
    /// exact.
    /// </summary>
    public partial class AddTenantStatusHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "tenant_status_history",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    occurred_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tenant_status_history", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_tenant_status_history_tenant_id_occurred_at",
                table: "tenant_status_history",
                columns: new[] { "tenant_id", "occurred_at" });

            // 10 Pending / 20 Active / 30 Suspended / 40 Deleted (soft delete).
            migrationBuilder.Sql(
                """
                CREATE FUNCTION record_tenant_status_history() RETURNS trigger AS $$
                BEGIN
                    IF TG_OP = 'UPDATE'
                        AND NEW.status IS NOT DISTINCT FROM OLD.status
                        AND NEW.is_deleted IS NOT DISTINCT FROM OLD.is_deleted THEN
                        RETURN NEW;
                    END IF;

                    INSERT INTO tenant_status_history (tenant_id, status, occurred_at, created_at)
                    VALUES (
                        NEW.id,
                        CASE WHEN NEW.is_deleted THEN 40 ELSE NEW.status END,
                        now(),
                        now()
                    );
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER tenants_record_status_history
                AFTER INSERT OR UPDATE OF status, is_deleted ON tenants
                FOR EACH ROW EXECUTE FUNCTION record_tenant_status_history();
                """);

            // Approximate history for organisations that predate the trigger: the
            // creation date is the only point we can honestly place, so each tenant
            // starts at creation with the status it holds today.
            migrationBuilder.Sql(
                """
                INSERT INTO tenant_status_history (tenant_id, status, occurred_at, created_at)
                SELECT id,
                       CASE WHEN is_deleted THEN 40 ELSE status END,
                       created_at,
                       created_at
                FROM tenants;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS tenants_record_status_history ON tenants;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS record_tenant_status_history();");

            migrationBuilder.DropTable(
                name: "tenant_status_history");
        }
    }
}
