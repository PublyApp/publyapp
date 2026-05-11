using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainApi.Migrations {
	/// <inheritdoc />
	public partial class RemoveSessionSoftDeleteColumns : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.Sql("DELETE FROM sessions WHERE is_deleted = true");

			migrationBuilder.DropColumn(
					name: "deleted_at",
					table: "sessions");

			migrationBuilder.DropColumn(
					name: "is_deleted",
					table: "sessions");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.AddColumn<DateTime>(
					name: "deleted_at",
					table: "sessions",
					type: "timestamp with time zone",
					nullable: true);

			migrationBuilder.AddColumn<bool>(
					name: "is_deleted",
					table: "sessions",
					type: "boolean",
					nullable: false,
					defaultValue: false);
		}
	}
}
