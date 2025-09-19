using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainApi.Migrations {
	/// <inheritdoc />
	public partial class PG_Indices_001 : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "IX_users_email",
					table: "users");

			migrationBuilder.DropIndex(
					name: "IX_tenants_code",
					table: "tenants");

			migrationBuilder.CreateIndex(
					name: "ix_users_email_active",
					table: "users",
					column: "email",
					unique: true,
					filter: "\"is_deleted\" = false");

			migrationBuilder.CreateIndex(
					name: "ix_user_accounts_userid_accounttype_active",
					table: "user_accounts",
					columns: new[] { "user_id", "account_type" },
					filter: "\"is_deleted\" = false AND \"is_suspended\" = false");

			migrationBuilder.CreateIndex(
					name: "ix_tenants_code_active",
					table: "tenants",
					column: "code",
					unique: true,
					filter: "\"is_deleted\" = false");

			migrationBuilder.CreateIndex(
					name: "IX_sessions_expires_at",
					table: "sessions",
					column: "expires_at");

			migrationBuilder.CreateIndex(
					name: "IX_sessions_token",
					table: "sessions",
					column: "token",
					unique: true);
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "ix_users_email_active",
					table: "users");

			migrationBuilder.DropIndex(
					name: "ix_user_accounts_userid_accounttype_active",
					table: "user_accounts");

			migrationBuilder.DropIndex(
					name: "ix_tenants_code_active",
					table: "tenants");

			migrationBuilder.DropIndex(
					name: "IX_sessions_expires_at",
					table: "sessions");

			migrationBuilder.DropIndex(
					name: "IX_sessions_token",
					table: "sessions");

			migrationBuilder.CreateIndex(
					name: "IX_users_email",
					table: "users",
					column: "email",
					unique: true);

			migrationBuilder.CreateIndex(
					name: "IX_tenants_code",
					table: "tenants",
					column: "code",
					unique: true);
		}
	}
}
