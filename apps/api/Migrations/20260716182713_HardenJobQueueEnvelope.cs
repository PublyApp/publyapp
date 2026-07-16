using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class HardenJobQueueEnvelope : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_job_queue_claim",
                table: "job_queue");

            migrationBuilder.DropIndex(
                name: "ux_job_queue_idempotency",
                table: "job_queue");

            migrationBuilder.AlterColumn<int>(
                name: "max_attempts",
                table: "job_queue",
                type: "integer",
                nullable: false,
                defaultValue: 10,
                oldClrType: typeof(int),
                oldType: "integer",
                oldDefaultValue: 8);

            migrationBuilder.AddColumn<Guid>(
                name: "actor_user_id",
                table: "job_queue",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "correlation_id",
                table: "job_queue",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "lock_token",
                table: "job_queue",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "tenant_id",
                table: "job_queue",
                type: "uuid",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "original_job_id",
                table: "job_dead_letter",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "actor_user_id",
                table: "job_dead_letter",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "correlation_id",
                table: "job_dead_letter",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "enqueued_at",
                table: "job_dead_letter",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<string>(
                name: "idempotency_key",
                table: "job_dead_letter",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "locked_by",
                table: "job_dead_letter",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "max_attempts",
                table: "job_dead_letter",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "priority",
                table: "job_dead_letter",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "tenant_id",
                table: "job_dead_letter",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_job_queue_claim",
                table: "job_queue",
                columns: new[] { "priority", "next_attempt_at", "created_at", "id" },
                descending: new[] { true, false, false, false },
                filter: "status = 0");

            migrationBuilder.CreateIndex(
                name: "ux_job_queue_type_idempotency",
                table: "job_queue",
                columns: new[] { "job_type", "idempotency_key" },
                unique: true,
                filter: "idempotency_key IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "ck_job_queue_max_attempts",
                table: "job_queue",
                sql: "max_attempts BETWEEN 1 AND 50");

            migrationBuilder.AddCheckConstraint(
                name: "ck_job_queue_priority",
                table: "job_queue",
                sql: "priority BETWEEN 0 AND 1000");

            // High-churn maintenance (design §4.1, F21): delete-on-success produces
            // sustained dead tuples; default autovacuum triggers scale with table
            // size and lag a small hot table. Aggressive per-table settings +
            // HOT-update headroom.
            migrationBuilder.Sql("""
                ALTER TABLE job_queue SET (
                    autovacuum_vacuum_scale_factor = 0.0,
                    autovacuum_vacuum_threshold    = 500,
                    autovacuum_analyze_scale_factor = 0.0,
                    autovacuum_analyze_threshold   = 500,
                    fillfactor = 90
                );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE job_queue RESET (
                    autovacuum_vacuum_scale_factor,
                    autovacuum_vacuum_threshold,
                    autovacuum_analyze_scale_factor,
                    autovacuum_analyze_threshold,
                    fillfactor
                );
                """);

            migrationBuilder.DropIndex(
                name: "ix_job_queue_claim",
                table: "job_queue");

            migrationBuilder.DropIndex(
                name: "ux_job_queue_type_idempotency",
                table: "job_queue");

            migrationBuilder.DropCheckConstraint(
                name: "ck_job_queue_max_attempts",
                table: "job_queue");

            migrationBuilder.DropCheckConstraint(
                name: "ck_job_queue_priority",
                table: "job_queue");

            migrationBuilder.DropColumn(
                name: "actor_user_id",
                table: "job_queue");

            migrationBuilder.DropColumn(
                name: "correlation_id",
                table: "job_queue");

            migrationBuilder.DropColumn(
                name: "lock_token",
                table: "job_queue");

            migrationBuilder.DropColumn(
                name: "tenant_id",
                table: "job_queue");

            migrationBuilder.DropColumn(
                name: "actor_user_id",
                table: "job_dead_letter");

            migrationBuilder.DropColumn(
                name: "correlation_id",
                table: "job_dead_letter");

            migrationBuilder.DropColumn(
                name: "enqueued_at",
                table: "job_dead_letter");

            migrationBuilder.DropColumn(
                name: "idempotency_key",
                table: "job_dead_letter");

            migrationBuilder.DropColumn(
                name: "locked_by",
                table: "job_dead_letter");

            migrationBuilder.DropColumn(
                name: "max_attempts",
                table: "job_dead_letter");

            migrationBuilder.DropColumn(
                name: "priority",
                table: "job_dead_letter");

            migrationBuilder.DropColumn(
                name: "tenant_id",
                table: "job_dead_letter");

            migrationBuilder.AlterColumn<int>(
                name: "max_attempts",
                table: "job_queue",
                type: "integer",
                nullable: false,
                defaultValue: 8,
                oldClrType: typeof(int),
                oldType: "integer",
                oldDefaultValue: 10);

            migrationBuilder.AlterColumn<Guid>(
                name: "original_job_id",
                table: "job_dead_letter",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.CreateIndex(
                name: "ix_job_queue_claim",
                table: "job_queue",
                columns: new[] { "priority", "next_attempt_at", "created_at" },
                descending: new[] { true, false, false },
                filter: "status = 0");

            migrationBuilder.CreateIndex(
                name: "ux_job_queue_idempotency",
                table: "job_queue",
                column: "idempotency_key",
                unique: true,
                filter: "idempotency_key IS NOT NULL");
        }
    }
}
