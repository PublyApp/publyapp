using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainApi.Migrations {
	/// <inheritdoc />
	public partial class AddStaffBackofficeFoundations : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.AddColumn<Guid>(
					name: "impersonating_staff_user_id",
					table: "sessions",
					type: "uuid",
					nullable: true);

			migrationBuilder.AddColumn<DateTime>(
					name: "impersonation_expires_at",
					table: "sessions",
					type: "timestamp with time zone",
					nullable: true);

			migrationBuilder.AddColumn<string>(
					name: "impersonation_reason",
					table: "sessions",
					type: "text",
					nullable: true);

			migrationBuilder.AddColumn<bool>(
					name: "is_impersonation",
					table: "sessions",
					type: "boolean",
					nullable: false,
					defaultValue: false);

			migrationBuilder.CreateTable(
					name: "audit_logs",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						user_id = table.Column<Guid>(type: "uuid", nullable: false),
						action = table.Column<string>(type: "text", nullable: false),
						target_id = table.Column<Guid>(type: "uuid", nullable: true),
						details = table.Column<string>(type: "text", nullable: true),
						ip_address = table.Column<string>(type: "text", nullable: true),
						user_agent = table.Column<string>(type: "text", nullable: true),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_audit_logs", x => x.id);
						table.ForeignKey(
											name: "FK_audit_logs_users_user_id",
											column: x => x.user_id,
											principalTable: "users",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
					});

			migrationBuilder.CreateTable(
					name: "invitations",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						email = table.Column<string>(type: "text", nullable: false),
						scope = table.Column<int>(type: "integer", nullable: false),
						tenant_id = table.Column<Guid>(type: "uuid", nullable: true),
						project_id = table.Column<Guid>(type: "uuid", nullable: true),
						token_hash = table.Column<string>(type: "text", nullable: false),
						expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_accepted = table.Column<bool>(type: "boolean", nullable: false),
						accepted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
						is_revoked = table.Column<bool>(type: "boolean", nullable: false),
						revoked_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
						invited_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
						profile_id = table.Column<Guid>(type: "uuid", nullable: false),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_invitations", x => x.id);
						table.CheckConstraint("CK_Invitation_Project_Constraints", "(scope = 2 AND tenant_id IS NOT NULL AND project_id IS NOT NULL) OR scope != 2");
						table.CheckConstraint("CK_Invitation_Staff_Constraints", "(scope = 0 AND tenant_id IS NULL AND project_id IS NULL) OR scope != 0");
						table.CheckConstraint("CK_Invitation_Tenant_Constraints", "(scope = 1 AND tenant_id IS NOT NULL AND project_id IS NULL) OR scope != 1");
						table.ForeignKey(
											name: "FK_invitations_profiles_profile_id",
											column: x => x.profile_id,
											principalTable: "profiles",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
						table.ForeignKey(
											name: "FK_invitations_projects_project_id",
											column: x => x.project_id,
											principalTable: "projects",
											principalColumn: "id");
						table.ForeignKey(
											name: "FK_invitations_tenants_tenant_id",
											column: x => x.tenant_id,
											principalTable: "tenants",
											principalColumn: "id");
						table.ForeignKey(
											name: "FK_invitations_users_invited_by_user_id",
											column: x => x.invited_by_user_id,
											principalTable: "users",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
					});

			migrationBuilder.CreateTable(
					name: "system_notices",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						severity = table.Column<int>(type: "integer", nullable: false),
						title = table.Column<string>(type: "text", nullable: false),
						message = table.Column<string>(type: "text", nullable: false),
						starts_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
						created_by_staff_id = table.Column<Guid>(type: "uuid", nullable: false),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_system_notices", x => x.id);
						table.ForeignKey(
											name: "FK_system_notices_users_created_by_staff_id",
											column: x => x.created_by_staff_id,
											principalTable: "users",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
					});

			migrationBuilder.CreateIndex(
					name: "IX_sessions_impersonating_staff_user_id",
					table: "sessions",
					column: "impersonating_staff_user_id");

			migrationBuilder.CreateIndex(
					name: "IX_audit_logs_action_created_at",
					table: "audit_logs",
					columns: new[] { "action", "created_at" });

			migrationBuilder.CreateIndex(
					name: "IX_audit_logs_target_id",
					table: "audit_logs",
					column: "target_id");

			migrationBuilder.CreateIndex(
					name: "IX_audit_logs_user_id_created_at",
					table: "audit_logs",
					columns: new[] { "user_id", "created_at" });

			migrationBuilder.CreateIndex(
					name: "IX_invitations_email_scope_is_accepted",
					table: "invitations",
					columns: new[] { "email", "scope", "is_accepted" });

			migrationBuilder.CreateIndex(
					name: "IX_invitations_expires_at",
					table: "invitations",
					column: "expires_at");

			migrationBuilder.CreateIndex(
					name: "IX_invitations_invited_by_user_id",
					table: "invitations",
					column: "invited_by_user_id");

			migrationBuilder.CreateIndex(
					name: "IX_invitations_profile_id",
					table: "invitations",
					column: "profile_id");

			migrationBuilder.CreateIndex(
					name: "IX_invitations_project_id",
					table: "invitations",
					column: "project_id");

			migrationBuilder.CreateIndex(
					name: "IX_invitations_tenant_id_scope",
					table: "invitations",
					columns: new[] { "tenant_id", "scope" });

			migrationBuilder.CreateIndex(
					name: "IX_system_notices_created_by_staff_id",
					table: "system_notices",
					column: "created_by_staff_id");

			migrationBuilder.CreateIndex(
					name: "IX_system_notices_severity",
					table: "system_notices",
					column: "severity");

			migrationBuilder.CreateIndex(
					name: "IX_system_notices_starts_at_expires_at",
					table: "system_notices",
					columns: new[] { "starts_at", "expires_at" });

			migrationBuilder.AddForeignKey(
					name: "FK_sessions_users_impersonating_staff_user_id",
					table: "sessions",
					column: "impersonating_staff_user_id",
					principalTable: "users",
					principalColumn: "id",
					onDelete: ReferentialAction.Restrict);
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropForeignKey(
					name: "FK_sessions_users_impersonating_staff_user_id",
					table: "sessions");

			migrationBuilder.DropTable(
					name: "audit_logs");

			migrationBuilder.DropTable(
					name: "invitations");

			migrationBuilder.DropTable(
					name: "system_notices");

			migrationBuilder.DropIndex(
					name: "IX_sessions_impersonating_staff_user_id",
					table: "sessions");

			migrationBuilder.DropColumn(
					name: "impersonating_staff_user_id",
					table: "sessions");

			migrationBuilder.DropColumn(
					name: "impersonation_expires_at",
					table: "sessions");

			migrationBuilder.DropColumn(
					name: "impersonation_reason",
					table: "sessions");

			migrationBuilder.DropColumn(
					name: "is_impersonation",
					table: "sessions");
		}
	}
}
