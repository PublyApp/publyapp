using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddInvitationEmailOutboxClaimAndLinkage : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.AddColumn<DateTime>(
					name: "claimed_at",
					table: "invitation_email_outbox",
					type: "timestamp with time zone",
					nullable: true);

			migrationBuilder.AddColumn<Guid>(
					name: "invitation_id",
					table: "invitation_email_outbox",
					type: "uuid",
					nullable: true);

			migrationBuilder.CreateIndex(
					name: "IX_invitation_email_outbox_invitation_id",
					table: "invitation_email_outbox",
					column: "invitation_id");

			migrationBuilder.AddForeignKey(
					name: "FK_invitation_email_outbox_invitations_invitation_id",
					table: "invitation_email_outbox",
					column: "invitation_id",
					principalTable: "invitations",
					principalColumn: "id");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropForeignKey(
					name: "FK_invitation_email_outbox_invitations_invitation_id",
					table: "invitation_email_outbox");

			migrationBuilder.DropIndex(
					name: "IX_invitation_email_outbox_invitation_id",
					table: "invitation_email_outbox");

			migrationBuilder.DropColumn(
					name: "claimed_at",
					table: "invitation_email_outbox");

			migrationBuilder.DropColumn(
					name: "invitation_id",
					table: "invitation_email_outbox");
		}
	}
}
