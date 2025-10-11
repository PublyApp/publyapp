using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainApi.Migrations {
	/// <inheritdoc />
	public partial class AccountLevel : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.RenameColumn(
					name: "hierarchy_level",
					table: "user_accounts",
					newName: "level");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.RenameColumn(
					name: "level",
					table: "user_accounts",
					newName: "hierarchy_level");
		}
	}
}
