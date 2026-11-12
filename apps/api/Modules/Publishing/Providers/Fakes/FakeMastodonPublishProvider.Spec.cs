using FluentAssertions;

using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Providers.Fakes;

// #2186: the e2e Mastodon / Pixelfed delivery and its routing next to the Bluesky fake.
public sealed class FakeMastodonPublishProviderSpec {
	private static PublishRequest _Request(string key, SocialProvider provider = SocialProvider.Mastodon) {
		return new PublishRequest {
			PublicationId = Guid.NewGuid(),
			IdempotencyKey = key,
			PostBody = "hello",
			ScheduledAtUtc = DateTime.UtcNow,
			Provider = provider,
			Session = new SocialSession("1@m.example", "me@m.example", "jwt", "https://m.example"),
		};
	}

	private static PublishMedia _Image() {
		return new PublishMedia { Content = [1, 2, 3], ContentType = "image/png", AltText = "alt", WidthPx = 1, HeightPx = 1 };
	}

	[Fact]
	public async Task ItShouldAnswerWithAStableStatusIdentityDerivedFromTheKey() {
		var key = $"fake-m-{Guid.NewGuid():N}";

		var first = await new FakeMastodonPublishProvider().PublishAsync(FakeMastodonPublishProviderSpec._Request(key), CancellationToken.None);
		var again = await new FakeMastodonPublishProvider().PublishAsync(FakeMastodonPublishProviderSpec._Request(key), CancellationToken.None);
		var other = await new FakeMastodonPublishProvider().PublishAsync(FakeMastodonPublishProviderSpec._Request($"{key}-other"), CancellationToken.None);

		var published = first.Should().BeOfType<PublishResult.Published>().Subject;
		again.Should().BeEquivalentTo(published, "a retried job recomputes the same status");
		other.Should().NotBeEquivalentTo(published);
		published.RecordId.Should().MatchRegex("^1[0-9a-f]{16}$");
		published.RecordUrl.Should().StartWith("https://mastodon.fake.test/@e2e/");
	}

	[Fact]
	public async Task ItShouldRecordTheVisibilityTextsAndImagesTheRealProviderWouldSend() {
		FakeMastodonPublishProvider.ClearRecorded();
		var key = $"fake-m-{Guid.NewGuid():N}";
		var request = FakeMastodonPublishProviderSpec._Request(key) with {
			Visibility = SocialPostVisibility.Unlisted,
			FollowUpSegments = ["second"],
			Media = [FakeMastodonPublishProviderSpec._Image()],
		};

		await new FakeMastodonPublishProvider().PublishAsync(request, CancellationToken.None);

		var recorded = FakeMastodonPublishProvider.Recorded.Single(r => r.IdempotencyKey == key);
		recorded.Visibility.Should().Be("unlisted");
		recorded.Texts.Should().Equal("hello", "second");
		recorded.Images.Select(i => (i.ContentType, i.AltText, i.SizeBytes)).Should().Equal(("image/png", "alt", 3));
	}

	[Fact]
	public async Task ItShouldReportEachNewSegmentOfAThreadOnceAndSkipTheCompletedOnes() {
		var key = $"fake-m-{Guid.NewGuid():N}";
		var reported = new List<int>();
		var request = FakeMastodonPublishProviderSpec._Request(key) with {
			FollowUpSegments = ["two", "three"],
			CompletedSegments = [new CompletedSegment(0, "already", string.Empty, "https://x")],
			OnSegmentCompleted = (segment, _) => {
				reported.Add(segment.Position);
				return Task.CompletedTask;
			},
		};

		await new FakeMastodonPublishProvider().PublishAsync(request, CancellationToken.None);

		reported.Should().Equal(1, 2);
	}

	[Fact]
	public async Task ItShouldRefuseAPixelfedPostWithoutAnImageLikeTheRealDelivery() {
		var result = await new FakeMastodonPublishProvider().PublishAsync(
			FakeMastodonPublishProviderSpec._Request($"fake-m-{Guid.NewGuid():N}", SocialProvider.Pixelfed),
			CancellationToken.None
		);

		result.Should().BeOfType<PublishResult.ContentFailure>().Which.Cause.Should().Contain("at least one image");
	}

	[Fact]
	public async Task ItShouldResumeAPixelfedThreadAfterItsRootWithoutAskingForAnImageAgain() {
		var request = FakeMastodonPublishProviderSpec._Request($"fake-m-{Guid.NewGuid():N}", SocialProvider.Pixelfed) with {
			FollowUpSegments = ["two"],
			CompletedSegments = [new CompletedSegment(0, "root-id", string.Empty, "https://x")],
		};

		var result = await new FakeMastodonPublishProvider().PublishAsync(request, CancellationToken.None);

		result.Should().BeOfType<PublishResult.Published>("the real delivery only needs the image for the root");
	}

	[Fact]
	public async Task ItShouldJournalEachNewSegmentBeforeItsWriteAndSkipTheCompletedOnes() {
		var events = new List<string>();
		var request = FakeMastodonPublishProviderSpec._Request($"fake-m-{Guid.NewGuid():N}") with {
			FollowUpSegments = ["two", "three"],
			CompletedSegments = [new CompletedSegment(0, "root-id", string.Empty, "https://x")],
			OnBeforeWrite = (position, _) => {
				events.Add($"before {position}");
				return Task.CompletedTask;
			},
			OnSegmentCompleted = (segment, _) => {
				events.Add($"done {segment.Position}");
				return Task.CompletedTask;
			},
		};

		await new FakeMastodonPublishProvider().PublishAsync(request, CancellationToken.None);

		events.Should().Equal("before 1", "done 1", "before 2", "done 2");
	}

	[Theory]
	[InlineData(10, true)]
	[InlineData(61, false)]
	public async Task ItShouldReconcileLikeTheRealDeliveryThroughTheRoutingProvider(int minutes, bool safe) {
		var result = await ((IPublishProvider)new FakeRoutingPublishProvider()).ReconcileAsync(
			new ReconcileRequest {
				PublicationId = Guid.NewGuid(),
				IdempotencyKey = "k",
				SegmentPosition = 0,
				Session = new SocialSession("1@m.example", "me@m.example", "jwt", "https://m.example"),
				Provider = SocialProvider.Mastodon,
				FirstAttemptAtUtc = DateTime.UtcNow - TimeSpan.FromMinutes(minutes),
			},
			CancellationToken.None
		);

		if (safe) {
			result.Should().BeOfType<ReconcileResult.SafeToResend>();
		} else {
			result.Should().BeOfType<ReconcileResult.NeedsReview>();
		}
	}

	[Theory]
	[InlineData(SocialProvider.Mastodon, true)]
	[InlineData(SocialProvider.Pixelfed, true)]
	[InlineData(SocialProvider.Bluesky, false)]
	[InlineData(SocialProvider.DiscordWebhook, false)]
	public async Task ItShouldRouteFediverseTargetsToTheMastodonFakeAndEverythingElseToTheBlueskyFake(SocialProvider provider, bool toMastodon) {
		FakeMastodonPublishProvider.ClearRecorded();
		FakeBlueskyPublishProvider.ClearRecorded();
		var key = $"fake-route-{Guid.NewGuid():N}";
		var request = FakeMastodonPublishProviderSpec._Request(key, provider) with {
			Media = [FakeMastodonPublishProviderSpec._Image()],
		};

		var result = await new FakeRoutingPublishProvider().PublishAsync(request, CancellationToken.None);

		result.Should().BeOfType<PublishResult.Published>();
		FakeMastodonPublishProvider.Recorded.Any(r => r.IdempotencyKey == key).Should().Be(toMastodon);
		FakeBlueskyPublishProvider.Recorded.Any(r => r.IdempotencyKey == key).Should().Be(!toMastodon);
	}
}
