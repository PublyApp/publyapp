using System.Text.Json;

using FluentAssertions;

using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Entities;

/// <summary>
/// Pins the #1521 contract enum shapes: C# member names must match the wire
/// snake_case values exactly so the per-enum JsonStringEnumConverter serializes
/// them to the correct contract strings.
/// </summary>
public sealed class ContractEnumShapeSpec {
	[Theory]
	[InlineData(PublicationStatus.Scheduled, "scheduled")]
	[InlineData(PublicationStatus.InProgress, "in_progress")]
	[InlineData(PublicationStatus.Published, "published")]
	[InlineData(PublicationStatus.Failed, "failed")]
	[InlineData(PublicationStatus.Paused, "paused")]
	public void ItShouldMapPublicationStatusToContractWireValues(
		PublicationStatus domain,
		string expectedWire
	) {
		var contract = PublicationWire.ToContract(domain);
		JsonSerializer.Serialize(contract).Should().Be($"\"{expectedWire}\"");
	}

	[Theory]
	[InlineData(DerivedPostStatus.Draft, "draft")]
	[InlineData(DerivedPostStatus.Scheduled, "scheduled")]
	[InlineData(DerivedPostStatus.Published, "published")]
	[InlineData(DerivedPostStatus.Partial, "partial")]
	[InlineData(DerivedPostStatus.Failed, "failed")]
	public void ItShouldMapDerivedPostStatusToContractWireValues(
		DerivedPostStatus domain,
		string expectedWire
	) {
		var contract = PostStatusDerivation.ToContract(domain);
		JsonSerializer.Serialize(contract).Should().Be($"\"{expectedWire}\"");
	}

	[Theory]
	[InlineData(SocialAccountStatus.Active, "active")]
	[InlineData(SocialAccountStatus.NeedsReconnect, "needs_reconnect")]
	[InlineData(SocialAccountStatus.Revoked, "revoked")]
	public void ItShouldMapSocialAccountStatusToContractWireValues(
		SocialAccountStatus domain,
		string expectedWire
	) {
		var contract = SocialAccountWire.ToContract(domain);
		JsonSerializer.Serialize(contract).Should().Be($"\"{expectedWire}\"");
	}

	[Fact]
	public void ItShouldPublishContractEnumsWithSnakeCaseMemberNames() {
		// The contract enum member names must equal the wire values so the
		// JsonStringEnumConverter emits the correct snake_case strings.
		Enum.GetNames<PublicationContractStatus>()
			.Should().BeEquivalentTo(
				["scheduled", "in_progress", "published", "failed", "paused"],
				"PublicationContractStatus member names must match wire values"
			);

		Enum.GetNames<DerivedPostContractStatus>()
			.Should().BeEquivalentTo(
				["draft", "scheduled", "published", "partial", "failed"],
				"DerivedPostContractStatus member names must match wire values"
			);

		Enum.GetNames<SocialAccountContractStatus>()
			.Should().BeEquivalentTo(
				["active", "needs_reconnect", "revoked"],
				"SocialAccountContractStatus member names must match wire values"
			);
	}
}
