using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class MakeAuditActorNullable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_audit_logs_users_user_id",
                table: "audit_logs");

            migrationBuilder.AlterColumn<Guid>(
                name: "user_id",
                table: "audit_logs",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddForeignKey(
                name: "FK_audit_logs_users_user_id",
                table: "audit_logs",
                column: "user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_audit_logs_users_user_id",
                table: "audit_logs");

            // A rollback restores a schema where every audit row has an
            // actor: the old column was NOT NULL and its FK pointed at
            // users.id. Rows written by this feature for an unknown account
            // have no actor, so they cannot satisfy either constraint.
            // Delete them first — the previous schema has no place for them,
            // and keeping them would make the ALTER and the FK below fail.
            migrationBuilder.Sql(
                "DELETE FROM audit_logs WHERE user_id IS NULL;");

            migrationBuilder.AlterColumn<Guid>(
                name: "user_id",
                table: "audit_logs",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_audit_logs_users_user_id",
                table: "audit_logs",
                column: "user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
