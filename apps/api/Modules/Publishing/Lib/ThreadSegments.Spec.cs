using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Lib;

// Thread helpers (#2171) against a real ephemeral Postgres: re-issuing a failed
// thread must continue after its last published segment, not post it all again.
public sealed class ThreadSegmentsSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public ThreadSegmentsSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	private static async Task<Publication> _AddPublicationAsync(
		AppDbContext db,
		Guid tenantId,
		Guid postId,
		Guid accountId
	) {
		var publication = new Publication {
			TenantId = tenantId,
			PostId = postId,
			SocialAccountId = accountId,
			ScheduledAtUtc = DateTime.UtcNow,
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = Guid.NewGuid().ToString("N"),
		};
		db.Publication.Add(publication);
		await db.SaveChangesAsync();
		return publication;
	}

	[Fact]
	public async Task ItShouldCarryTheFailedPublicationsPublishedSegmentsOntoTheFreshOne() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenant = new PublyApp.Api.Modules.Tenants.Entities.Tenant {
			Name = $"thread-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = PublyApp.Api.Modules.Tenants.Entities.TenantStatus.Active,
			MaxUsers = 10,
		};
		var user = new User {
			Email = $"thread-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.Tenant.Add(tenant);
		db.User.Add(user);
		await db.SaveChangesAsync();
		var post = new Post {
			TenantId = tenant.GetRequiredId(),
			Body = "root",
			CreatedByUserId = user.GetRequiredId(),
		};
		var account = new SocialAccount {
			TenantId = tenant.GetRequiredId(),
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@thread.spec",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.Post.Add(post);
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();

		var failed = await ThreadSegmentsSpec._AddPublicationAsync(
			db, tenant.GetRequiredId(), post.GetRequiredId(), account.GetRequiredId()
		);
		var transitions = scope.ServiceProvider.GetRequiredService<IPublicationStatusTransitionService>();
		await transitions.MarkInProgressAsync(
			new MarkPublicationInProgressArgs(failed.GetRequiredId(), tenant.GetRequiredId()),
			CancellationToken.None
		);
		await transitions.MarkFailedAsync(
			new MarkPublicationFailedArgs(failed.GetRequiredId(), tenant.GetRequiredId(), "spec"),
			CancellationToken.None
		);
		for (var position = 0; position < 2; position++) {
			db.PublicationSegmentResult.Add(new PublicationSegmentResult {
				TenantId = tenant.GetRequiredId(),
				PublicationId = failed.GetRequiredId(),
				SegmentPosition = position,
				ExternalRecordId = $"at://did:plc:x/app.bsky.feed.post/r{position}",
				ExternalCid = $"cid-{position}",
				ExternalUrl = $"https://bsky.app/r{position}",
			});
		}

		await db.SaveChangesAsync();
		var fresh = await ThreadSegmentsSpec._AddPublicationAsync(
			db, tenant.GetRequiredId(), post.GetRequiredId(), account.GetRequiredId()
		);

		await ThreadSegments.CarryOverFailedProgressAsync(
			db,
			tenant.GetRequiredId(),
			post.GetRequiredId(),
			[(fresh.GetRequiredId(), account.GetRequiredId())],
			CancellationToken.None
		);
		await db.SaveChangesAsync();

		var carried = await db.PublicationSegmentResult
			.Where(result => result.PublicationId == fresh.Id)
			.OrderBy(result => result.SegmentPosition)
			.ToListAsync();
		carried.Select(result => result.ExternalCid).Should().Equal("cid-0", "cid-1");
		(await ThreadSegments.PublishedSegmentCountAsync(
			db, post.GetRequiredId(), CancellationToken.None
		)).Should().Be(2);
	}
}
