using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Projects.Entities;

public sealed class ProjectConfiguration : IEntityTypeConfiguration<Project> {
	public void Configure(EntityTypeBuilder<Project> builder) {
		// Project status is lifecycle state, not soft-delete state. Deleted rows use BaseAttributes.
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_Project_Status",
			"status IN (10, 20)"
		));
	}
}
