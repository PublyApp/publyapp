using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainApi.Migrations {
	/// <inheritdoc />
	public partial class TenantProfileNameUniqueIndex : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.CreateIndex(
					name: "ux_profiles_tenant_name",
					table: "profiles",
					columns: new[] { "tenant_id", "name" },
					unique: true,
					filter: "\"scope\" = 1 AND \"is_deleted\" = false");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "ux_profiles_tenant_name",
					table: "profiles");
		}
	}
}
