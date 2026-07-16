using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUserAccountProfilesProfileMembersIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_user_account_profiles_profile_id",
                table: "user_account_profiles");

            migrationBuilder.CreateIndex(
                name: "ix_user_account_profiles_profile_id_user_account_id",
                table: "user_account_profiles",
                columns: new[] { "profile_id", "user_account_id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_user_account_profiles_profile_id_user_account_id",
                table: "user_account_profiles");

            migrationBuilder.CreateIndex(
                name: "IX_user_account_profiles_profile_id",
                table: "user_account_profiles",
                column: "profile_id");
        }
    }
}
