using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Services;

// Temporary proof artifact for #1462 / PR #1467: exists solely to demonstrate
// that the required api-tests-gate CI check goes RED when the API suite
// breaks. Deleted in the immediately following commit; never merged.
public sealed class CiGateRed {
	[Fact]
	public void ItShouldFailDeliberatelyToProveTheRequiredApiTestsGateCatchesBreakage() {
		true.Should().BeFalse(
			"#1462 red proof — the required api-tests-gate check must fail when the suite breaks"
		);
	}
}
