using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainApi.Migrations {
	/// <inheritdoc />
	public partial class AddPasswordResetTokenToUser : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "IX_profile_permissions_profile_id",
					table: "profile_permissions");

			migrationBuilder.AddColumn<string>(
					name: "password_reset_token",
					table: "users",
					type: "text",
					nullable: true);

			migrationBuilder.AddColumn<DateTime>(
					name: "password_reset_token_expires_at",
					table: "users",
					type: "timestamp with time zone",
					nullable: true);

			migrationBuilder.CreateIndex(
					name: "IX_user_accounts_user_id_tenant_id",
					table: "user_accounts",
					columns: new[] { "user_id", "tenant_id" });

			migrationBuilder.CreateIndex(
					name: "IX_profile_permissions_profile_id_permission_key",
					table: "profile_permissions",
					columns: new[] { "profile_id", "permission_key" });
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "IX_user_accounts_user_id_tenant_id",
					table: "user_accounts");

			migrationBuilder.DropIndex(
					name: "IX_profile_permissions_profile_id_permission_key",
					table: "profile_permissions");

			migrationBuilder.DropColumn(
					name: "password_reset_token",
					table: "users");

			migrationBuilder.DropColumn(
					name: "password_reset_token_expires_at",
					table: "users");

			migrationBuilder.CreateIndex(
					name: "IX_profile_permissions_profile_id",
					table: "profile_permissions",
					column: "profile_id");
		}
	}
}
