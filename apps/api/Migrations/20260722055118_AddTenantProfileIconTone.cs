using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddTenantProfileIconTone : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.AddColumn<string>(
					name: "icon",
					table: "profiles",
					type: "text",
					nullable: true);

			migrationBuilder.AddColumn<string>(
					name: "tone",
					table: "profiles",
					type: "text",
					nullable: true);
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropColumn(
					name: "icon",
					table: "profiles");

			migrationBuilder.DropColumn(
					name: "tone",
					table: "profiles");
		}
	}
}
