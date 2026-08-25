using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Modules.Messaging.Entities;

// Unit specs for the #866 round-1 finding 1: the actor is a real value type — the kind
// can only be an EmailLogActorKinds vocabulary value (the factories are the only
// constructors) and the id is non-empty and bounded, throwing before any database write.
public sealed class EmailLogActorSpec {
	[Fact]
	public void ItShouldBuildAWebhookActorWithTheVocabularyKindAndTheGivenId() {
		var actor = EmailLogActor.ProviderWebhook("evt_123");

		actor.Kind.Should().Be(EmailLogActorKinds.ProviderWebhook);
		actor.Id.Should().Be("evt_123");
	}

	[Fact]
	public void ItShouldBuildAReconciliationActorWithTheVocabularyKindAndTheGivenId() {
		var actor = EmailLogActor.ProviderReconciliation("batch_42");

		actor.Kind.Should().Be(EmailLogActorKinds.ProviderReconciliation);
		actor.Id.Should().Be("batch_42");
	}

	[Fact]
	public void ItShouldThrowOnAnEmptyIdNamingTheField() {
		var build = () => EmailLogActor.ProviderWebhook("");

		build.Should().Throw<ArgumentException>()
			.WithMessage("*id is required*")
			.And.ParamName.Should().Be("id");
	}

	[Fact]
	public void ItShouldThrowOnAWhitespaceIdNamingTheField() {
		var build = () => EmailLogActor.ProviderReconciliation("   ");

		build.Should().Throw<ArgumentException>().WithMessage("*id is required*");
	}

	[Fact]
	public void ItShouldThrowOnAnIdOverTheBoundNamingTheField() {
		var build = () => EmailLogActor.ProviderWebhook(new string('x', EmailLogActor.MaxIdLength + 1));

		build.Should().Throw<ArgumentException>()
			.WithMessage("*at most 512 characters*")
			.And.ParamName.Should().Be("id");
	}

	[Fact]
	public void ItShouldAcceptAnIdAtExactlyTheBound() {
		var actor = EmailLogActor.ProviderWebhook(new string('x', EmailLogActor.MaxIdLength));

		actor.Id.Should().HaveLength(EmailLogActor.MaxIdLength);
	}
}
