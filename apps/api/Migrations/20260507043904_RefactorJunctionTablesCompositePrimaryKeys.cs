using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainApi.Migrations {
	/// <inheritdoc />
	public partial class RefactorJunctionTablesCompositePrimaryKeys : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropPrimaryKey(
					name: "PK_user_account_profiles",
					table: "user_account_profiles");

			migrationBuilder.DropIndex(
					name: "IX_user_account_profiles_user_account_id_profile_id",
					table: "user_account_profiles");

			migrationBuilder.DropPrimaryKey(
					name: "PK_profile_permissions",
					table: "profile_permissions");

			migrationBuilder.DropIndex(
					name: "IX_profile_permissions_profile_id_permission_key",
					table: "profile_permissions");

			// Inactive rows represented revoked memberships in the old schema. Once the
			// soft-delete columns are removed, keeping them would make those grants active.
			migrationBuilder.Sql(
					"DELETE FROM user_account_profiles WHERE is_deleted = true");

			migrationBuilder.Sql(
					"DELETE FROM profile_permissions WHERE is_deleted = true");

			migrationBuilder.DropColumn(
					name: "id",
					table: "user_account_profiles");

			migrationBuilder.DropColumn(
					name: "deleted_at",
					table: "user_account_profiles");

			migrationBuilder.DropColumn(
					name: "is_deleted",
					table: "user_account_profiles");

			migrationBuilder.DropColumn(
					name: "id",
					table: "profile_permissions");

			migrationBuilder.DropColumn(
					name: "deleted_at",
					table: "profile_permissions");

			migrationBuilder.DropColumn(
					name: "is_deleted",
					table: "profile_permissions");

			migrationBuilder.AddPrimaryKey(
					name: "PK_user_account_profiles",
					table: "user_account_profiles",
					columns: new[] { "user_account_id", "profile_id" });

			// The foreign-key pair is the natural identity for a permission grant.
			migrationBuilder.AddPrimaryKey(
					name: "PK_profile_permissions",
					table: "profile_permissions",
					columns: new[] { "profile_id", "permission_key" });
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropPrimaryKey(
					name: "PK_user_account_profiles",
					table: "user_account_profiles");

			migrationBuilder.DropPrimaryKey(
					name: "PK_profile_permissions",
					table: "profile_permissions");

			migrationBuilder.AddColumn<Guid>(
					name: "id",
					table: "user_account_profiles",
					type: "uuid",
					nullable: false,
					defaultValueSql: "uuidv7()");

			migrationBuilder.AddColumn<DateTime>(
					name: "deleted_at",
					table: "user_account_profiles",
					type: "timestamp with time zone",
					nullable: true);

			migrationBuilder.AddColumn<bool>(
					name: "is_deleted",
					table: "user_account_profiles",
					type: "boolean",
					nullable: false,
					defaultValue: false);

			migrationBuilder.AddColumn<Guid>(
					name: "id",
					table: "profile_permissions",
					type: "uuid",
					nullable: false,
					defaultValueSql: "uuidv7()");

			migrationBuilder.AddColumn<DateTime>(
					name: "deleted_at",
					table: "profile_permissions",
					type: "timestamp with time zone",
					nullable: true);

			migrationBuilder.AddColumn<bool>(
					name: "is_deleted",
					table: "profile_permissions",
					type: "boolean",
					nullable: false,
					defaultValue: false);

			migrationBuilder.AddPrimaryKey(
					name: "PK_user_account_profiles",
					table: "user_account_profiles",
					column: "id");

			migrationBuilder.AddPrimaryKey(
					name: "PK_profile_permissions",
					table: "profile_permissions",
					column: "id");

			migrationBuilder.CreateIndex(
					name: "IX_user_account_profiles_user_account_id_profile_id",
					table: "user_account_profiles",
					columns: new[] { "user_account_id", "profile_id" },
					unique: true);

			migrationBuilder.CreateIndex(
					name: "IX_profile_permissions_profile_id_permission_key",
					table: "profile_permissions",
					columns: new[] { "profile_id", "permission_key" },
					unique: true);
		}
	}
}
