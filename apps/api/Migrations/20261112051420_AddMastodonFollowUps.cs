using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMastodonFollowUps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "default_visibility",
                table: "social_accounts",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "protected_code_verifier",
                table: "oauth_states",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "reconnect_social_account_id",
                table: "oauth_states",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "registered_at",
                table: "oauth_app_registrations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "registered_by_tenant_id",
                table: "oauth_app_registrations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_SocialAccount_DefaultVisibility",
                table: "social_accounts",
                sql: "default_visibility IN (0, 1, 2)");

            migrationBuilder.CreateIndex(
                name: "ix_oauth_app_registrations_registered_by_tenant",
                table: "oauth_app_registrations",
                columns: new[] { "registered_by_tenant_id", "registered_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_SocialAccount_DefaultVisibility",
                table: "social_accounts");

            migrationBuilder.DropIndex(
                name: "ix_oauth_app_registrations_registered_by_tenant",
                table: "oauth_app_registrations");

            migrationBuilder.DropColumn(
                name: "default_visibility",
                table: "social_accounts");

            migrationBuilder.DropColumn(
                name: "protected_code_verifier",
                table: "oauth_states");

            migrationBuilder.DropColumn(
                name: "reconnect_social_account_id",
                table: "oauth_states");

            migrationBuilder.DropColumn(
                name: "registered_at",
                table: "oauth_app_registrations");

            migrationBuilder.DropColumn(
                name: "registered_by_tenant_id",
                table: "oauth_app_registrations");
        }
    }
}
