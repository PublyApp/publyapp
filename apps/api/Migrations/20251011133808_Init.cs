using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainApi.Migrations {
	/// <inheritdoc />
	public partial class Init : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.CreateTable(
					name: "permissions",
					columns: table => new {
						key = table.Column<string>(type: "text", nullable: false),
						scope = table.Column<int>(type: "integer", nullable: false),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_permissions", x => x.key);
					});

			migrationBuilder.CreateTable(
					name: "tenants",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						code = table.Column<string>(type: "text", nullable: false),
						name = table.Column<string>(type: "text", nullable: false),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_tenants", x => x.id);
						table.CheckConstraint("CK_Tenant_Code_Lowercase", "code = LOWER(code)");
					});

			migrationBuilder.CreateTable(
					name: "users",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						last_name = table.Column<string>(type: "text", nullable: true),
						first_name = table.Column<string>(type: "text", nullable: true),
						email = table.Column<string>(type: "text", nullable: false),
						password = table.Column<string>(type: "text", nullable: false),
						avatar_url = table.Column<string>(type: "text", nullable: true),
						status = table.Column<int>(type: "integer", nullable: false),
						is_suspended = table.Column<bool>(type: "boolean", nullable: false),
						is_verified = table.Column<bool>(type: "boolean", nullable: false),
						email_verify_token = table.Column<string>(type: "text", nullable: true),
						email_verify_token_expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
						password_reset_token = table.Column<string>(type: "text", nullable: true),
						password_reset_token_expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_users", x => x.id);
						table.CheckConstraint("CK_User_Email_Lowercase", "email = LOWER(email)");
					});

			migrationBuilder.CreateTable(
					name: "products",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						name = table.Column<string>(type: "text", nullable: true),
						description = table.Column<string>(type: "text", nullable: true),
						price = table.Column<decimal>(type: "numeric", nullable: false),
						tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_products", x => x.id);
						table.ForeignKey(
											name: "FK_products_tenants_tenant_id",
											column: x => x.tenant_id,
											principalTable: "tenants",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
					});

			migrationBuilder.CreateTable(
					name: "projects",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
						name = table.Column<string>(type: "text", nullable: false),
						description = table.Column<string>(type: "text", nullable: true),
						brand_identity = table.Column<string>(type: "text", nullable: true),
						is_active = table.Column<bool>(type: "boolean", nullable: false),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_projects", x => x.id);
						table.ForeignKey(
											name: "FK_projects_tenants_tenant_id",
											column: x => x.tenant_id,
											principalTable: "tenants",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
					});

			migrationBuilder.CreateTable(
					name: "sessions",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						user_id = table.Column<Guid>(type: "uuid", nullable: true),
						token = table.Column<string>(type: "text", nullable: false),
						expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_sessions", x => x.id);
						table.ForeignKey(
											name: "FK_sessions_users_user_id",
											column: x => x.user_id,
											principalTable: "users",
											principalColumn: "id");
					});

			migrationBuilder.CreateTable(
					name: "profiles",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						tenant_id = table.Column<Guid>(type: "uuid", nullable: true),
						project_id = table.Column<Guid>(type: "uuid", nullable: true),
						name = table.Column<string>(type: "text", nullable: false),
						description = table.Column<string>(type: "text", nullable: true),
						profile_scope = table.Column<int>(type: "integer", nullable: false),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_profiles", x => x.id);
						table.CheckConstraint("CK_Profile_Project_Constraints", "(profile_scope = 2 AND tenant_id IS NOT NULL AND project_id IS NOT NULL) OR profile_scope != 2");
						table.CheckConstraint("CK_Profile_Staff_Constraints", "(profile_scope = 0 AND tenant_id IS NULL AND project_id IS NULL) OR profile_scope != 0");
						table.CheckConstraint("CK_Profile_Tenant_Constraints", "(profile_scope = 1 AND tenant_id IS NOT NULL AND project_id IS NULL) OR profile_scope != 1");
						table.ForeignKey(
											name: "FK_profiles_projects_project_id",
											column: x => x.project_id,
											principalTable: "projects",
											principalColumn: "id");
						table.ForeignKey(
											name: "FK_profiles_tenants_tenant_id",
											column: x => x.tenant_id,
											principalTable: "tenants",
											principalColumn: "id");
					});

			migrationBuilder.CreateTable(
					name: "user_accounts",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						user_id = table.Column<Guid>(type: "uuid", nullable: false),
						tenant_id = table.Column<Guid>(type: "uuid", nullable: true),
						project_id = table.Column<Guid>(type: "uuid", nullable: true),
						account_scope = table.Column<int>(type: "integer", nullable: false),
						level = table.Column<int>(type: "integer", nullable: false),
						is_suspended = table.Column<bool>(type: "boolean", nullable: false),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_user_accounts", x => x.id);
						table.CheckConstraint("CK_UserAccount_Project_Constraints", "(account_scope = 2 AND tenant_id IS NOT NULL AND project_id IS NOT NULL) OR account_scope != 2");
						table.CheckConstraint("CK_UserAccount_Staff_Constraints", "(account_scope = 0 AND tenant_id IS NULL AND project_id IS NULL) OR account_scope != 0");
						table.CheckConstraint("CK_UserAccount_Tenant_Constraints", "(account_scope = 1 AND tenant_id IS NOT NULL AND project_id IS NULL) OR account_scope != 1");
						table.ForeignKey(
											name: "FK_user_accounts_projects_project_id",
											column: x => x.project_id,
											principalTable: "projects",
											principalColumn: "id");
						table.ForeignKey(
											name: "FK_user_accounts_tenants_tenant_id",
											column: x => x.tenant_id,
											principalTable: "tenants",
											principalColumn: "id");
						table.ForeignKey(
											name: "FK_user_accounts_users_user_id",
											column: x => x.user_id,
											principalTable: "users",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
					});

			migrationBuilder.CreateTable(
					name: "profile_permissions",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						profile_id = table.Column<Guid>(type: "uuid", nullable: false),
						permission_key = table.Column<string>(type: "text", nullable: false),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_profile_permissions", x => x.id);
						table.ForeignKey(
											name: "FK_profile_permissions_permissions_permission_key",
											column: x => x.permission_key,
											principalTable: "permissions",
											principalColumn: "key",
											onDelete: ReferentialAction.Cascade);
						table.ForeignKey(
											name: "FK_profile_permissions_profiles_profile_id",
											column: x => x.profile_id,
											principalTable: "profiles",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
					});

			migrationBuilder.CreateTable(
					name: "user_account_profiles",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false),
						user_account_id = table.Column<Guid>(type: "uuid", nullable: false),
						profile_id = table.Column<Guid>(type: "uuid", nullable: false),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_user_account_profiles", x => x.id);
						table.ForeignKey(
											name: "FK_user_account_profiles_profiles_profile_id",
											column: x => x.profile_id,
											principalTable: "profiles",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
						table.ForeignKey(
											name: "FK_user_account_profiles_user_accounts_user_account_id",
											column: x => x.user_account_id,
											principalTable: "user_accounts",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
					});

			migrationBuilder.CreateIndex(
					name: "IX_products_tenant_id",
					table: "products",
					column: "tenant_id");

			migrationBuilder.CreateIndex(
					name: "IX_profile_permissions_permission_key",
					table: "profile_permissions",
					column: "permission_key");

			migrationBuilder.CreateIndex(
					name: "IX_profile_permissions_profile_id_permission_key",
					table: "profile_permissions",
					columns: new[] { "profile_id", "permission_key" });

			migrationBuilder.CreateIndex(
					name: "IX_profiles_project_id",
					table: "profiles",
					column: "project_id");

			migrationBuilder.CreateIndex(
					name: "IX_profiles_tenant_id",
					table: "profiles",
					column: "tenant_id");

			migrationBuilder.CreateIndex(
					name: "IX_projects_tenant_id_name",
					table: "projects",
					columns: new[] { "tenant_id", "name" },
					unique: true);

			migrationBuilder.CreateIndex(
					name: "IX_sessions_expires_at",
					table: "sessions",
					column: "expires_at");

			migrationBuilder.CreateIndex(
					name: "IX_sessions_token",
					table: "sessions",
					column: "token",
					unique: true);

			migrationBuilder.CreateIndex(
					name: "IX_sessions_user_id",
					table: "sessions",
					column: "user_id");

			migrationBuilder.CreateIndex(
					name: "ix_tenants_code_active",
					table: "tenants",
					column: "code",
					unique: true,
					filter: "\"is_deleted\" = false");

			migrationBuilder.CreateIndex(
					name: "IX_user_account_profiles_profile_id",
					table: "user_account_profiles",
					column: "profile_id");

			migrationBuilder.CreateIndex(
					name: "IX_user_account_profiles_user_account_id_profile_id",
					table: "user_account_profiles",
					columns: new[] { "user_account_id", "profile_id" },
					unique: true);

			migrationBuilder.CreateIndex(
					name: "IX_user_accounts_project_id_account_scope",
					table: "user_accounts",
					columns: new[] { "project_id", "account_scope" });

			migrationBuilder.CreateIndex(
					name: "IX_user_accounts_tenant_id_account_scope",
					table: "user_accounts",
					columns: new[] { "tenant_id", "account_scope" });

			migrationBuilder.CreateIndex(
					name: "ix_user_accounts_user_id_account_type_active",
					table: "user_accounts",
					columns: new[] { "user_id", "account_scope" },
					filter: "\"is_deleted\" = false AND \"is_suspended\" = false");

			migrationBuilder.CreateIndex(
					name: "IX_user_accounts_user_id_tenant_id",
					table: "user_accounts",
					columns: new[] { "user_id", "tenant_id" });

			migrationBuilder.CreateIndex(
					name: "IX_user_accounts_user_id_tenant_id_project_id_account_scope",
					table: "user_accounts",
					columns: new[] { "user_id", "tenant_id", "project_id", "account_scope" },
					unique: true);

			migrationBuilder.CreateIndex(
					name: "ix_users_email_active",
					table: "users",
					column: "email",
					unique: true,
					filter: "\"is_deleted\" = false");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropTable(
					name: "products");

			migrationBuilder.DropTable(
					name: "profile_permissions");

			migrationBuilder.DropTable(
					name: "sessions");

			migrationBuilder.DropTable(
					name: "user_account_profiles");

			migrationBuilder.DropTable(
					name: "permissions");

			migrationBuilder.DropTable(
					name: "profiles");

			migrationBuilder.DropTable(
					name: "user_accounts");

			migrationBuilder.DropTable(
					name: "projects");

			migrationBuilder.DropTable(
					name: "users");

			migrationBuilder.DropTable(
					name: "tenants");
		}
	}
}
