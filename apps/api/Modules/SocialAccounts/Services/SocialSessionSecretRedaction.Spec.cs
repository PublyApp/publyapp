using System.Reflection;
using System.Text;
using System.Text.Json;

using FluentAssertions;

using PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

// Round-2 review finding 2 (PR #1439): positional records synthesize a ToString()
// that prints EVERY property — including secrets. BlueskyCredentials carries the
// app password and SocialSession the short-lived access JWT; both leak through
// ToString(), string interpolation, and JSON serialization (what structured log
// sinks emit). These specs pin the redaction at the type: no rendering path may
// ever contain the secret value, while direct property access stays intact for
// the code that legitimately needs it.
public sealed class SocialSessionSecretRedactionSpec {
	private const string AppPassword = "redact-spec-app-password";
	private const string AccessJwt = "redact-spec-access-jwt";

	[Fact]
	public void ItShouldRedactTheAppPasswordFromEveryRenderingOfBlueskyCredentials() {
		var credentials = new BlueskyCredentials(
			Identifier: "redact.example.com",
			AppPassword: AppPassword
		);

		credentials.ToString().Should().NotContain(AppPassword);
		$"{credentials}".Should().NotContain(AppPassword);

		// The compiler-generated record format is preserved minus the secret, so
		// log lines stay readable and greppable.
		credentials.ToString().Should().Contain("redact.example.com");
		credentials.ToString().Should().Contain("[REDACTED]");

		// Legitimate consumers still read the property directly.
		credentials.Identifier.Should().Be("redact.example.com");
		credentials.AppPassword.Should().Be(AppPassword);
	}

	[Fact]
	public void ItShouldRedactTheAccessJwtFromEveryRenderingOfSocialSession() {
		var session = new SocialSession(
			Did: "did:plc:redact",
			Handle: "redact.test",
			AccessJwt: AccessJwt,
			PdsHost: "https://bsky.social"
		);

		session.ToString().Should().NotContain(AccessJwt);
		$"{session}".Should().NotContain(AccessJwt);
		// Structured log sinks serialize whole objects; the short-lived JWT must not
		// survive that either. (BlueskyCredentials is exempt: its request-body
		// serialization legitimately carries the app password to the PDS.)
		JsonSerializer.Serialize(session).Should().NotContain(AccessJwt);

		session.ToString().Should().Contain("did:plc:redact");
		session.ToString().Should().Contain("[REDACTED]");

		// Non-secret fields render normally; the JWT property stays readable.
		session.Did.Should().Be("did:plc:redact");
		session.AccessJwt.Should().Be(AccessJwt);
	}

	[Fact]
	public void ItShouldRedactSecretsInPrintMembersForBothRecords() {
		// PrintMembers feeds derived-record ToString composition; exercise it
		// directly (it is protected) so the redaction cannot regress silently.
		PrintViaPrintMembers(typeof(BlueskyCredentials), AppPassword)
			.Should().NotContain(AppPassword);
		PrintViaPrintMembers(typeof(SocialSession), AccessJwt)
			.Should().NotContain(AccessJwt);
	}

	private static string PrintViaPrintMembers(Type recordType, string secretValue) {
		var instance = recordType.GetConstructors()
			.OrderBy(c => c.GetParameters().Length)
			.First();
		var parameters = instance.GetParameters()
			.Select(p => p.ParameterType.IsValueType
				? Activator.CreateInstance(p.ParameterType)
				: null)
			.ToArray();
		if (recordType == typeof(BlueskyCredentials)) {
			parameters = ["x", secretValue];
		} else if (recordType == typeof(SocialSession)) {
			parameters = ["did", "handle", secretValue, "pds"];
		}

		var built = instance.Invoke(parameters);
		var printMembers = recordType.GetMethod(
			"PrintMembers",
			BindingFlags.NonPublic | BindingFlags.Instance
		);
		Assert.NotNull(printMembers);
		var builder = new StringBuilder();
		var result = (bool)printMembers.Invoke(built, [builder])!;
		result.Should().BeTrue();
		return builder.ToString();
	}
}
