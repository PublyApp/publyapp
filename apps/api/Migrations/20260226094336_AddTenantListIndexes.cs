using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainApi.Migrations {
	/// <inheritdoc />
	public partial class AddTenantListIndexes : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "ix_tenants_code_active",
					table: "tenants");

			migrationBuilder.AlterDatabase()
					.Annotation("Npgsql:PostgresExtension:pg_trgm", ",,");

			migrationBuilder.CreateIndex(
					name: "ix_tenants_code_trgm",
					table: "tenants",
					column: "code",
					unique: true,
					filter: "\"is_deleted\" = false")
					.Annotation("Npgsql:IndexMethod", "gin")
					.Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

			migrationBuilder.CreateIndex(
					name: "ix_tenants_name_trgm",
					table: "tenants",
					column: "name",
					filter: "\"is_deleted\" = false")
					.Annotation("Npgsql:IndexMethod", "gin")
					.Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

			migrationBuilder.CreateIndex(
					name: "ix_tenants_staff_created_at_id",
					table: "tenants",
					columns: new[] { "created_at", "id" },
					filter: "\"is_deleted\" = false");

			migrationBuilder.CreateIndex(
					name: "ix_tenants_staff_name_id",
					table: "tenants",
					columns: new[] { "name", "id" },
					filter: "\"is_deleted\" = false");

			migrationBuilder.CreateIndex(
					name: "ix_tenants_staff_status_id",
					table: "tenants",
					columns: new[] { "status", "id" },
					filter: "\"is_deleted\" = false");

			migrationBuilder.CreateIndex(
					name: "ix_tenants_staff_updated_at_id",
					table: "tenants",
					columns: new[] { "updated_at", "id" },
					filter: "\"is_deleted\" = false");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "ix_tenants_code_trgm",
					table: "tenants");

			migrationBuilder.DropIndex(
					name: "ix_tenants_name_trgm",
					table: "tenants");

			migrationBuilder.DropIndex(
					name: "ix_tenants_staff_created_at_id",
					table: "tenants");

			migrationBuilder.DropIndex(
					name: "ix_tenants_staff_name_id",
					table: "tenants");

			migrationBuilder.DropIndex(
					name: "ix_tenants_staff_status_id",
					table: "tenants");

			migrationBuilder.DropIndex(
					name: "ix_tenants_staff_updated_at_id",
					table: "tenants");

			migrationBuilder.AlterDatabase()
					.OldAnnotation("Npgsql:PostgresExtension:pg_trgm", ",,");

			migrationBuilder.CreateIndex(
					name: "ix_tenants_code_active",
					table: "tenants",
					column: "code",
					unique: true,
					filter: "\"is_deleted\" = false");
		}
	}
}
