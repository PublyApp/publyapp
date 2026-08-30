using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddTenantOrganizationProfileFields : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.AddColumn<string>(
					name: "billing_email",
					table: "tenants",
					type: "text",
					nullable: true);

			migrationBuilder.AddColumn<string>(
					name: "default_locale",
					table: "tenants",
					type: "text",
					nullable: true);

			migrationBuilder.AddColumn<string>(
					name: "description",
					table: "tenants",
					type: "text",
					nullable: true);

			migrationBuilder.AddColumn<DateTime>(
					name: "last_activity_at",
					table: "tenants",
					type: "timestamp with time zone",
					nullable: true);

			migrationBuilder.AddColumn<string>(
					name: "legal_name",
					table: "tenants",
					type: "text",
					nullable: true);

			migrationBuilder.AddColumn<string>(
					name: "notes",
					table: "tenants",
					type: "text",
					nullable: true);

			migrationBuilder.AddColumn<string>(
					name: "support_email",
					table: "tenants",
					type: "text",
					nullable: true);

			migrationBuilder.AddColumn<string>(
					name: "timezone",
					table: "tenants",
					type: "text",
					nullable: true);

			migrationBuilder.AddColumn<string>(
					name: "website_url",
					table: "tenants",
					type: "text",
					nullable: true);
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropColumn(
					name: "billing_email",
					table: "tenants");

			migrationBuilder.DropColumn(
					name: "default_locale",
					table: "tenants");

			migrationBuilder.DropColumn(
					name: "description",
					table: "tenants");

			migrationBuilder.DropColumn(
					name: "last_activity_at",
					table: "tenants");

			migrationBuilder.DropColumn(
					name: "legal_name",
					table: "tenants");

			migrationBuilder.DropColumn(
					name: "notes",
					table: "tenants");

			migrationBuilder.DropColumn(
					name: "support_email",
					table: "tenants");

			migrationBuilder.DropColumn(
					name: "timezone",
					table: "tenants");

			migrationBuilder.DropColumn(
					name: "website_url",
					table: "tenants");
		}
	}
}
