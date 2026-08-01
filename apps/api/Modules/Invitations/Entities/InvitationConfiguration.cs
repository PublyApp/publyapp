using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Invitations.Entities;

public sealed class InvitationConfiguration : IEntityTypeConfiguration<Invitation> {
	public void Configure(EntityTypeBuilder<Invitation> builder) {
		// Database-level invitation scope constraints
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_Invitation_Staff_Constraints",
			"(scope = 0 AND tenant_id IS NULL AND project_id IS NULL) OR scope != 0"
		));

		builder.ToTable(table => table.HasCheckConstraint(
			"CK_Invitation_Tenant_Constraints",
			"(scope = 1 AND tenant_id IS NOT NULL AND project_id IS NULL) OR scope != 1"
		));

		builder.ToTable(table => table.HasCheckConstraint(
			"CK_Invitation_Project_Constraints",
			"(scope = 2 AND tenant_id IS NOT NULL AND project_id IS NOT NULL) OR scope != 2"
		));

		// Expired is derived from Pending + ExpiresAt, so only persisted lifecycle states are allowed.
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_Invitation_Status",
			"status IN (0, 1, 2)"
		));
	}
}
