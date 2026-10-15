using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPublishAttemptJournal : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Publication_FailureCategory",
                table: "publications");

            migrationBuilder.CreateTable(
                name: "publication_publish_attempts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    publication_id = table.Column<Guid>(type: "uuid", nullable: false),
                    segment_position = table.Column<int>(type: "integer", nullable: false),
                    attempt_number = table.Column<int>(type: "integer", nullable: false),
                    operation = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    content_fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    idempotency_key = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    submission_state = table.Column<int>(type: "integer", nullable: false),
                    external_record_id = table.Column<string>(type: "text", nullable: true),
                    external_url = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_publication_publish_attempts", x => x.id);
                    table.CheckConstraint("CK_PublishAttempt_SubmissionState", "submission_state IN (1, 2, 3, 4, 5)");
                    table.ForeignKey(
                        name: "FK_publication_publish_attempts_publications_publication_id",
                        column: x => x.publication_id,
                        principalTable: "publications",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_publication_publish_attempts_tenants_tenant_id",
                        column: x => x.tenant_id,
                        principalTable: "tenants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Publication_FailureCategory",
                table: "publications",
                sql: "failure_category IS NULL OR failure_category IN (1, 2, 3, 4, 5)");

            migrationBuilder.CreateIndex(
                name: "ix_publication_publish_attempts_publication_position",
                table: "publication_publish_attempts",
                columns: new[] { "publication_id", "segment_position" });

            migrationBuilder.CreateIndex(
                name: "IX_publication_publish_attempts_tenant_id",
                table: "publication_publish_attempts",
                column: "tenant_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "publication_publish_attempts");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Publication_FailureCategory",
                table: "publications");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Publication_FailureCategory",
                table: "publications",
                sql: "failure_category IS NULL OR failure_category IN (1, 2, 3, 4)");
        }
    }
}
