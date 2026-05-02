using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainApi.Migrations {
	/// <inheritdoc />
	public partial class RemovePendingUserStatus : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropCheckConstraint(
					name: "CK_User_Status",
					table: "users");

			// Pending users only existed through the now-unmapped direct creation flow.
			// Keep migration safe for existing dev/test databases before tightening the enum.
			migrationBuilder.Sql("UPDATE users SET status = 40 WHERE status = 20");

			migrationBuilder.AddCheckConstraint(
					name: "CK_User_Status",
					table: "users",
					sql: "status IN (30, 40)");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropCheckConstraint(
					name: "CK_User_Status",
					table: "users");

			migrationBuilder.AddCheckConstraint(
					name: "CK_User_Status",
					table: "users",
					sql: "status IN (20, 30, 40)");
		}
	}
}
