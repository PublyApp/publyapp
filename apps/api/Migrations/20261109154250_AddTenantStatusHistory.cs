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
    /// Why a trigger, what it covers and how to verify it exists:
    /// docs/records/2026-11-09-decision-tenant-status-history-trigger.md.
    ///
    /// Baseline: every organisation that exists at migration time gets ONE row at
    /// <c>now()</c> carrying the status it holds at that instant. Nothing is dated
    /// before the migration: the days before it are not served as measured values
    /// (the API exposes <c>recordedSince</c>, the earliest recorded transition).
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
                name: "IX_tenant_status_history_occurred_at_id",
                table: "tenant_status_history",
                columns: new[] { "occurred_at", "id" });

            migrationBuilder.CreateIndex(
                name: "IX_tenant_status_history_tenant_id_occurred_at",
                table: "tenant_status_history",
                columns: new[] { "tenant_id", "occurred_at" });

            // 10 Pending / 20 Active / 30 Suspended / 40 Deleted (soft delete).
            // clock_timestamp(), not now(): now() is the TRANSACTION start, so two
            // transitions written in one transaction would share an occurred_at and
            // lose their order (#2349 MEDIUM-2).
            migrationBuilder.Sql(
                """
                CREATE FUNCTION record_tenant_status_history() RETURNS trigger AS $$
                BEGIN
                    IF TG_OP = 'UPDATE'
                        AND NEW.status IS NOT DISTINCT FROM OLD.status
                        AND NEW.is_deleted IS NOT DISTINCT FROM OLD.is_deleted THEN
                        RETURN NEW;
                    END IF;

                    -- Hard delete is terminal: the tenant leaves the curve instead of
                    -- keeping its last status forever (no FK cleans these rows).
                    IF TG_OP = 'DELETE' THEN
                        INSERT INTO tenant_status_history
                            (tenant_id, status, occurred_at, created_at)
                        VALUES
                            (OLD.id, 40, clock_timestamp(), clock_timestamp());
                        RETURN OLD;
                    END IF;

                    INSERT INTO tenant_status_history
                        (tenant_id, status, occurred_at, created_at)
                    VALUES (
                        NEW.id,
                        CASE WHEN NEW.is_deleted THEN 40 ELSE NEW.status END,
                        clock_timestamp(),
                        clock_timestamp()
                    );
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER tenants_record_status_history
                AFTER INSERT OR UPDATE OF status, is_deleted OR DELETE ON tenants
                FOR EACH ROW EXECUTE FUNCTION record_tenant_status_history();
                """);

            // Baseline for organisations that predate the trigger: one row at
            // migration time with the status they hold now. Dated now(), never
            // created_at — history before this migration is not invented.
            migrationBuilder.Sql(
                """
                INSERT INTO tenant_status_history (tenant_id, status, occurred_at, created_at)
                SELECT id,
                       CASE WHEN is_deleted THEN 40 ELSE status END,
                       now(),
                       now()
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
