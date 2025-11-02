using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainApi.Migrations {
	/// <inheritdoc />
	public partial class MakeSessionUserIdRequired : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropForeignKey(
				name: "FK_sessions_users_user_id",
				table: "sessions");

			migrationBuilder.AlterColumn<Guid>(
				name: "user_id",
				table: "sessions",
				type: "uuid",
				nullable: false,
				oldClrType: typeof(Guid),
				oldType: "uuid",
				oldNullable: true);

			migrationBuilder.AddForeignKey(
				name: "FK_sessions_users_user_id",
				table: "sessions",
				column: "user_id",
				principalTable: "users",
				principalColumn: "id",
				onDelete: ReferentialAction.Cascade);
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropForeignKey(
					name: "FK_sessions_users_user_id",
					table: "sessions");

			migrationBuilder.AlterColumn<Guid>(
					name: "user_id",
					table: "sessions",
					type: "uuid",
					nullable: true,
					oldClrType: typeof(Guid),
					oldType: "uuid");

			migrationBuilder.AddForeignKey(
					name: "FK_sessions_users_user_id",
					table: "sessions",
					column: "user_id",
					principalTable: "users",
					principalColumn: "id");
		}
	}
}
