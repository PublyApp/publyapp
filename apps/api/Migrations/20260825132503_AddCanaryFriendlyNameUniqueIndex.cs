using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCanaryFriendlyNameUniqueIndex : Migration
    {
        /// <inheritdoc />
        // #1416 expand-only repair: production carries duplicate canary rows minted by
        // the concurrent first-boot race, and creating the unique index over them would
        // abort with a bare 23505. Dedupe FIRST — keep the LOWEST id, the row earlier
        // boots verified under — then enforce uniqueness. Idempotent by construction
        // (no duplicates -> deletes nothing), expand-only: nothing is dropped or renamed.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DELETE FROM data_protection_keys
                WHERE "FriendlyName" = 'social-accounts-master-key-canary'
                  AND "Id" <> (
                      SELECT MIN("Id") FROM data_protection_keys
                      WHERE "FriendlyName" = 'social-accounts-master-key-canary'
                  )
                """
            );

            migrationBuilder.CreateIndex(
                name: "ux_data_protection_keys_canary_friendly_name",
                table: "data_protection_keys",
                column: "FriendlyName",
                unique: true,
                filter: "\"FriendlyName\" = 'social-accounts-master-key-canary'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_data_protection_keys_canary_friendly_name",
                table: "data_protection_keys");
        }
    }
}
