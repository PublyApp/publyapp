using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class FixUploadBudgetGlobalUniqueness : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "ux_upload_budgets_scope",
					table: "upload_budgets");

			migrationBuilder.DropIndex(
					name: "ux_upload_budgets_single_global",
					table: "upload_budgets");

			migrationBuilder.CreateIndex(
					name: "ux_upload_budgets_scope",
					table: "upload_budgets",
					columns: new[] { "scope_kind", "scope_key" },
					unique: true)
					.Annotation("Npgsql:NullsDistinct", false);
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "ux_upload_budgets_scope",
					table: "upload_budgets");

			migrationBuilder.CreateIndex(
					name: "ux_upload_budgets_scope",
					table: "upload_budgets",
					columns: new[] { "scope_kind", "scope_key" },
					unique: true);

			migrationBuilder.CreateIndex(
					name: "ux_upload_budgets_single_global",
					table: "upload_budgets",
					column: "scope_key",
					unique: true,
					filter: "scope_kind = 10");
		}
	}
}
