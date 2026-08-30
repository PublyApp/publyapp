using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddInvitationEmailOutbox : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.CreateTable(
					name: "invitation_email_outbox",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						email = table.Column<string>(type: "text", nullable: false),
						kind = table.Column<int>(type: "integer", nullable: false),
						tenant_name = table.Column<string>(type: "text", nullable: true),
						token = table.Column<string>(type: "text", nullable: false),
						account_level = table.Column<int>(type: "integer", nullable: true),
						status = table.Column<int>(type: "integer", nullable: false),
						attempt_count = table.Column<int>(type: "integer", nullable: false),
						last_error = table.Column<string>(type: "text", nullable: true),
						next_attempt_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						sent_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_invitation_email_outbox", x => x.id);
					});

			migrationBuilder.CreateIndex(
					name: "IX_invitation_email_outbox_status_next_attempt_at",
					table: "invitation_email_outbox",
					columns: new[] { "status", "next_attempt_at" });
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropTable(
					name: "invitation_email_outbox");
		}
	}
}
