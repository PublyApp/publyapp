using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

using Moq;

using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Posts.Services;
using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Data.DbContext;

// The "ForTenant" reads below carry no tenant predicate any more: they rely on the
// ambient tenant filter, which matches every tenant on an unscoped context. Each must
// throw before touching the database when the context has no tenant. The connection
// string is never opened: the guard runs first.
public sealed class RequireTenantScopeSpec {
	static RequireTenantScopeSpec() {
		AppEnvironment.Initialize();
	}

	public static TheoryData<string, Func<AppDbContext, Task>> Reads() {
		var id = Guid.NewGuid();
		return new TheoryData<string, Func<AppDbContext, Task>> {
			{ "PostService.GetByIdForTenantAsync", db => new PostService(db, NullLogger<PostService>.Instance).GetByIdForTenantAsync(id) },
			{ "PostService.FindSegmentsAsync", db => new PostService(db, NullLogger<PostService>.Instance).FindSegmentsAsync(id) },
			{ "PostService.ProjectExistsForTenantAsync", db => new PostService(db, NullLogger<PostService>.Instance).ProjectExistsForTenantAsync(id) },
			{ "PublishTargetService.FindForTenantAsync", db => new PublishTargetService(db).FindForTenantAsync() },
			{ "PublicationService.FindForPostAsync", db => new PublicationService(db, new HttpContextAccessor()).FindForPostAsync(id) },
			{ "PublicationRetryService.CheckAsync", db => new PublicationRetryService(db, new Mock<IJobEnqueuer>().Object).CheckAsync(id, CancellationToken.None) },
			{ "SocialAccountService.GetByIdForTenantAsync", db => new SocialAccountService(db, new Mock<ICredentialProtector>().Object, new Mock<IBlueskyClient>().Object).GetByIdForTenantAsync(id) },
		};
	}

	[Theory]
	[MemberData(nameof(RequireTenantScopeSpec.Reads))]
	public async Task ItShouldRefuseATenantReadOnAnUnscopedContext(
		string read,
		Func<AppDbContext, Task> invoke
	) {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=require_tenant_scope")
			.Options;
		await using var db = new AppDbContext(options);

		var act = () => invoke(db);

		(await act.Should().ThrowAsync<InvalidOperationException>(read))
			.WithMessage("*not scoped to a tenant*");
	}

	[Fact]
	public void ItShouldAcceptAScopedContext() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=require_tenant_scope")
			.Options;
		using var db = new AppDbContext(options);
		db.ScopeToTenant(Guid.NewGuid());

		var act = db.RequireTenantScope;

		act.Should().NotThrow();
	}
}
