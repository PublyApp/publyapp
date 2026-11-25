using FluentAssertions;

using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Providers.Fakes;

public sealed class FakeBlueskyPublishAdapterSpec {
	[Fact]
	public async Task ItShouldRecordTheImagesOfEachPublishInOrderWithTheirAlt() {
		FakeBlueskyPublishAdapter.ClearRecorded();
		var key = $"fake-spec-{Guid.NewGuid():N}";

		var result = await new FakeBlueskyPublishAdapter().PublishAsync(
			new PublishRequest {
				PublicationId = Guid.NewGuid(),
				IdempotencyKey = key,
				PostBody = "hi",
				ScheduledAtUtc = DateTime.UtcNow,
				Session = new SocialSession("did:plc:x", "@h.test", "jwt", "https://pds.example"),
				Media = [
					new PublishMedia { Content = [1, 2, 3], ContentType = "image/png", AltText = "one", WidthPx = 1, HeightPx = 1 },
					new PublishMedia { Content = [4, 5], ContentType = "image/jpeg", AltText = null, WidthPx = 1, HeightPx = 1 },
				],
			},
			CancellationToken.None
		);

		result.Should().BeOfType<PublishResult.Published>();
		var recorded = FakeBlueskyPublishAdapter.Recorded.Single(r => r.IdempotencyKey == key);
		recorded.Images.Select(i => (i.ContentType, i.AltText, i.SizeBytes))
			.Should().Equal(("image/png", "one", 3), ("image/jpeg", null, 2));
	}
}
