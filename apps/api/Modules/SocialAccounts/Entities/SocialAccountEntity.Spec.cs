using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Entities;

public sealed class SocialAccountEntitySpec {
	static SocialAccountEntitySpec() {
		AppEnvironment.Initialize();
	}

	private static IReadOnlyList<IEntityType> Model() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=social_account_guard")
			.Options;

		using var db = new AppDbContext(options);
		return db.GetService<IDesignTimeModel>().Model.GetEntityTypes().ToList();
	}

	[Fact]
	public void ItShouldDeclareCheckConstraintAndUniqueIndexForSocialAccount() {
		var entity = Model().Single(e => e.ClrType == typeof(SocialAccount));
		entity.GetCheckConstraints().Single(c => c.Name == "CK_SocialAccount_Status")
			.Sql.Should().Be("status IN (10, 20, 30)");
		entity.GetIndexes().Single(i => i.GetDatabaseName() == "ix_social_accounts_tenant_provider_external")
			.Properties.Select(p => p.Name).Should().Equal("TenantId", "Provider", "ExternalAccountId");
	}

	[Fact]
	public void ItShouldDeclareACompositeKeyForSocialAccountProject() {
		var entity = Model().Single(e => e.ClrType == typeof(SocialAccountProject));
		entity.FindPrimaryKey()!.Properties.Select(p => p.Name)
			.Should().Equal("SocialAccountId", "ProjectId");
	}
}
