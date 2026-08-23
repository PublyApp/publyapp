using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Uploads.Entities;

/// <summary>
/// Mapping for <see cref="UploadBudget"/>. Exactly one global row is guaranteed by
/// the partial unique index on scope_kind where scope_key IS NULL; per-scope rows
/// are unique per (scope_kind, scope_key). Rows are seeded/configured at startup
/// from AppEnvironment (UPLOAD_GLOBAL_MAX_BYTES / UPLOAD_PER_STAFF_MAX_BYTES) by
/// the admission service, not by a migration — budgets are config, not schema.
/// </summary>
public sealed class UploadBudgetConfiguration : IEntityTypeConfiguration<UploadBudget> {
	public void Configure(EntityTypeBuilder<UploadBudget> builder) {
		builder.ToTable(table => {
			table.HasCheckConstraint(
				"CK_UploadBudgets_ScopeKind",
				"scope_kind IN (10, 20, 30)"
			);
			table.HasCheckConstraint(
				"CK_UploadBudgets_MaxBytes",
				"max_bytes > 0"
			);
			table.HasCheckConstraint(
				"CK_UploadBudgets_Accounting",
				"reserved_bytes >= 0 AND committed_bytes >= 0"
			);
		});

		builder
			.HasIndex(budget => new { budget.ScopeKind, budget.ScopeKey })
			.IsUnique()
			.HasDatabaseName("ux_upload_budgets_scope");

		// Only the global pool may have a NULL scope key.
		builder
			.HasIndex(budget => budget.ScopeKey)
			.IsUnique()
			.HasFilter("scope_kind = 10")
			.HasDatabaseName("ux_upload_budgets_single_global");
	}
}
