using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Posts.Entities;

public sealed class PostConfiguration : IEntityTypeConfiguration<Post> {
	public void Configure(EntityTypeBuilder<Post> builder) {
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_Post_Status",
			"status IN (10, 20, 30)"
		));

		// Keyset pagination index for tenant post lists: supports efficient
		// sorting by CreatedAt with Id as tie-breaker within one tenant.
		builder
			.HasIndex(post => new { post.TenantId, post.CreatedAt, post.Id })
			.HasDatabaseName("ix_posts_tenant_created_at_id");

		builder
			.HasIndex(post => new { post.TenantId, post.ProjectId })
			.HasDatabaseName("ix_posts_tenant_project_id");

		builder
			.HasOne(post => post.Tenant)
			.WithMany()
			.HasForeignKey(post => post.TenantId)
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasOne(post => post.Project)
			.WithMany()
			.HasForeignKey(post => post.ProjectId)
			.OnDelete(DeleteBehavior.SetNull);

		builder
			.HasOne(post => post.CreatedByUser)
			.WithMany()
			.HasForeignKey(post => post.CreatedByUserId)
			.OnDelete(DeleteBehavior.Restrict);
	}
}
