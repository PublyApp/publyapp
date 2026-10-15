using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPublicationFailureCategory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "failure_category",
                table: "publications",
                type: "integer",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Publication_FailureCategory",
                table: "publications",
                sql: "failure_category IS NULL OR failure_category IN (1, 2, 3, 4)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Publication_FailureCategory",
                table: "publications");

            migrationBuilder.DropColumn(
                name: "failure_category",
                table: "publications");
        }
    }
}
