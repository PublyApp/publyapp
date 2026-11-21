using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Posts.Entities;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Posts-specific architecture guard for the conventions this module
/// introduces: the status check constraint and the keyset indexes. Tenant
/// scoping is no longer source-scanned here: the global tenant query filter
/// (#2459) scopes every Post query, and the two-tenant specs prove it.
/// </summary>
public sealed class PostArchitectureSpec {
	static PostArchitectureSpec() {
		AppEnvironment.Initialize();
	}

	[Fact]
	public void ItShouldConfigureCkPostStatusWithExactlyTheEnumValues() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=post_architecture_guard")
			.Options;

		using var dbContext = new AppDbContext(options);
		var model = dbContext.GetService<IDesignTimeModel>().Model;
		var entity = model.FindEntityType(typeof(Post));
		entity.Should().NotBeNull();

		var constraint = entity.Required()
			.GetCheckConstraints()
			.SingleOrDefault(c => c.Name == "CK_Post_Status");
		constraint.Should().NotBeNull(
			"CK_Post_Status must be configured in PostConfiguration"
		);
		constraint.Required().Sql.Should().Be(
			"status IN (10, 20, 30)",
			"PostStatus enum values are 10/Draft, 20/Scheduled, 30/Published"
		);
	}

	[Fact]
	public void ItShouldConfigurePostIndexes() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=post_architecture_guard")
			.Options;

		using var dbContext = new AppDbContext(options);
		var model = dbContext.GetService<IDesignTimeModel>().Model;
		var entity = model.FindEntityType(typeof(Post));
		entity.Should().NotBeNull();

		var indexes = entity.Required().GetIndexes().ToList();
		indexes.Should().NotBeEmpty("Post must have indexes");

		var keyset = indexes.SingleOrDefault(i =>
			i.GetDatabaseName() == "ix_posts_tenant_created_at_id"
		);
		keyset.Should().NotBeNull(
			"keyset index ix_posts_tenant_created_at_id must exist for tenant post lists"
		);
		keyset.Required().Properties.Select(p => p.Name).Should().Equal(
			"TenantId", "CreatedAt", "Id"
		);

		var projectIndex = indexes.SingleOrDefault(i =>
			i.GetDatabaseName() == "ix_posts_tenant_project_id"
		);
		projectIndex.Should().NotBeNull(
			"project index ix_posts_tenant_project_id must exist"
		);
		projectIndex.Required().Properties.Select(p => p.Name).Should().Equal(
			"TenantId", "ProjectId"
		);
	}
}
