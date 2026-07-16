using System.Text.Json;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

// The F2 contract: one canonical serializer whose wire form is camelCase, whose reads
// are case-insensitive, and whose required members make a missing field a JsonException
// instead of a silent Guid.Empty. The byte-exact fold-migration shape
// ({"invitationId":"…"}, produced by jsonb_build_object in 2C's migration SQL) must
// round-trip into payload records.
public sealed class JobJsonSpec {
	private sealed record InvitationPayload {
		public required Guid InvitationId { get; init; }
	}

	[Fact]
	public void ItShouldDeserializeTheExactMigrationShapedCamelCaseJson() {
		var id = Guid.NewGuid();
		// Byte-exact wire shape the fold migration emits (design §4.6/F2).
		var wire = $"{{\"invitationId\":\"{id}\"}}";

		var payload = JobJson.Deserialize<InvitationPayload>(wire);

		payload.InvitationId.Should().Be(id);
	}

	[Fact]
	public void ItShouldSerializeToCamelCaseAndRoundTrip() {
		var payload = new InvitationPayload { InvitationId = Guid.NewGuid() };

		var wire = JobJson.Serialize(payload);

		wire.Should().Contain("\"invitationId\"", "the wire form is camelCase");
		wire.Should().NotContain("\"InvitationId\"");
		JobJson.Deserialize<InvitationPayload>(wire).Should().Be(payload);
	}

	[Fact]
	public void ItShouldReadPascalCaseInputForCompatibility() {
		var id = Guid.NewGuid();
		var wire = $"{{\"InvitationId\":\"{id}\"}}";

		var payload = JobJson.Deserialize<InvitationPayload>(wire);

		payload.InvitationId.Should().Be(id);
	}

	[Fact]
	public void ItShouldThrowWhenARequiredMemberIsMissing() {
		// Without `required` enforcement this would materialize Guid.Empty — the
		// exact blocker F2 describes.
		var act = () => JobJson.Deserialize<InvitationPayload>("{}");

		act.Should().Throw<JsonException>();
	}

	[Fact]
	public void ItShouldThrowOnMalformedJson() {
		var act = () => JobJson.Deserialize<InvitationPayload>("{not json");

		act.Should().Throw<JsonException>();
	}

	[Fact]
	public void ItShouldThrowOnNullJson() {
		var act = () => JobJson.Deserialize<InvitationPayload>("null");

		act.Should().Throw<JsonException>();
	}
}
