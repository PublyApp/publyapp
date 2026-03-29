using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainApi.Migrations {
	/// <inheritdoc />
	public partial class AddProfileIsDefaultInvariant : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "IX_profiles_tenant_id",
					table: "profiles");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.CreateIndex(
					name: "IX_profiles_tenant_id",
					table: "profiles",
					column: "tenant_id");
		}
	}
}
