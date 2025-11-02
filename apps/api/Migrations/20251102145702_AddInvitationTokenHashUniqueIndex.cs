using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainApi.Migrations {
	/// <inheritdoc />
	public partial class AddInvitationTokenHashUniqueIndex : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.CreateIndex(
					name: "IX_invitations_token_hash",
					table: "invitations",
					column: "token_hash",
					unique: true);
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "IX_invitations_token_hash",
					table: "invitations");
		}
	}
}
