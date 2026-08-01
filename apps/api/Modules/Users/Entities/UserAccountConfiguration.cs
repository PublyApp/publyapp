using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Modules.Users.Entities;

public sealed class UserAccountConfiguration : IEntityTypeConfiguration<UserAccount> {
	public void Configure(EntityTypeBuilder<UserAccount> builder) {
		EntityConfigurationMarker.Mark(builder);

		// Database-level account type constraints
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_UserAccount_Staff_Constraints",
			"(scope = 0 AND tenant_id IS NULL AND project_id IS NULL) OR scope != 0"
		));
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_UserAccount_Tenant_Constraints",
			"(scope = 1 AND tenant_id IS NOT NULL AND project_id IS NULL) OR scope != 1"
		));
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_UserAccount_Project_Constraints",
			"(scope = 2 AND tenant_id IS NOT NULL AND project_id IS NOT NULL) OR scope != 2"
		));

		// AccountStatus is membership-local only. GloballySuspended is a derived read-model
		// status and must never be stored in user_accounts.status.
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_UserAccount_Status",
			"status IN (0, 1)"
		));

		builder
			.HasIndex(account => new { account.UserId, account.Scope })
			.HasDatabaseName("ix_user_accounts_user_id_account_type_active")
			// Covers active membership lookups. Status 1 is AccountStatus.Suspended.
			.HasFilter("\"is_deleted\" = false AND \"status\" != 1");

		// Membership uniqueness invariant, enforced per scope because a plain composite
		// unique index treats TenantId/ProjectId NULLs as distinct in PostgreSQL and would
		// silently allow duplicate active memberships (round-5 API F1).
		builder
			.HasIndex(account => account.UserId)
			.IsUnique()
			.HasDatabaseName("ux_user_accounts_staff_active")
			// At most one active staff account per user.
			.HasFilter("\"scope\" = 0 AND \"is_deleted\" = false");

		builder
			.HasIndex(account => new { account.UserId, account.TenantId })
			.IsUnique()
			.HasDatabaseName("ux_user_accounts_tenant_active")
			// At most one active tenant account per user per tenant.
			.HasFilter("\"scope\" = 1 AND \"project_id\" IS NULL AND \"is_deleted\" = false");

		builder
			.HasIndex(account => new { account.UserId, account.ProjectId })
			.IsUnique()
			.HasDatabaseName("ux_user_accounts_project_active")
			// At most one active project account per user per project.
			.HasFilter("\"scope\" = 2 AND \"is_deleted\" = false");
	}
}
