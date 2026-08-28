using FluentAssertions;

using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

/// <summary>
/// Guards the provider wire mapping (#1443).
///
/// Why this exists. <c>PublishTargetService</c> used to write the literal
/// <c>"bluesky"</c> under a comment claiming it reused the single source. With
/// exactly one enum member the two are indistinguishable at runtime, so no
/// behavioural test could have caught the lie — the first non-Bluesky provider
/// would simply have been mislabelled on the wire, silently.
///
/// What makes the call site safe is not the value it returns today but the fact
/// that <see cref="SocialAccountWire.FormatProvider"/> refuses a value it does
/// not handle, where a literal cannot.
///
/// Honest scope, measured rather than assumed. Adding a <see cref="SocialProvider"/>
/// member without extending the mapping does NOT first fail here — it fails at
/// BUILD time, because <c>IDE0072</c> (populate switch) is an error in this repo.
/// Verified by mutation: adding <c>Mastodon = 1</c> stops the build at
/// <c>SocialAccountService.cs(117,19)</c> before any test runs. The compiler is
/// the primary net, and routing the call site through this mapping is precisely
/// what puts it BEHIND that net — a literal compiles happily forever.
///
/// These specs are the secondary net, covering what the compiler does not: that
/// no provider maps to blank or to a value another provider already uses, and
/// that an undefined enum value cast in at runtime is refused rather than given
/// a plausible default.
/// </summary>
public sealed class SocialAccountWireSpec {
	[Fact]
	public void ItShouldFormatEverySocialProviderWithoutThrowing() {
		var unhandled = new List<string>();
		var formatted = new List<string>();

		foreach (var provider in Enum.GetValues<SocialProvider>()) {
			try {
				var wire = SocialAccountWire.FormatProvider(provider);
				wire.Should().NotBeNullOrWhiteSpace(
					$"the wire value for {provider} must be a real token, not blank"
				);
				formatted.Add(wire);
			} catch (ArgumentOutOfRangeException) {
				unhandled.Add(provider.ToString());
			}
		}

		unhandled.Should().BeEmpty(
			"every SocialProvider must have a wire value. Unhandled: "
			+ string.Join(", ", unhandled)
			+ ". Extend SocialAccountWire.FormatProvider — do NOT write the literal "
			+ "at the call site, which is the defect #1443 fixed."
		);
	}

	[Fact]
	public void ItShouldGiveEveryProviderADistinctWireValue() {
		var byWire = Enum.GetValues<SocialProvider>()
			.ToDictionary(provider => provider, SocialAccountWire.FormatProvider);

		byWire.Values.Distinct().Should().HaveCount(
			byWire.Count,
			"two providers sharing a wire value would make them indistinguishable "
			+ "to the frontend. Mapping: "
			+ string.Join(", ", byWire.Select(pair => $"{pair.Key}={pair.Value}"))
		);
	}

	[Fact]
	public void ItShouldNotSilentlyAcceptAnUndefinedProviderValue() {
		// The property the call site relies on: an unknown value FAILS LOUDLY.
		// A literal at the call site would have returned "bluesky" for this.
		var undefined = (SocialProvider)9999;

		var act = () => SocialAccountWire.FormatProvider(undefined);

		act.Should().Throw<ArgumentOutOfRangeException>(
			"FormatProvider must refuse a value it does not know rather than "
			+ "returning a plausible default — that refusal is the whole reason "
			+ "the call site routes through it instead of writing a literal."
		);
	}
}
