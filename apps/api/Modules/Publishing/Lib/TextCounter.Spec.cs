using System.Text.Json;

using FluentAssertions;

using PublyApp.Api.Modules.Publishing.Providers.Capabilities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Lib;

// Issue #2169: the browser counter (apps/front/src/lib/text-counter) runs the SAME
// fixture file, so server and browser provably agree on every string.
public sealed class TextCounterSpec {
	private sealed record Fixture(
		string Name, string Text, int Graphemes, int Bytes, int? Characters, int UrlWeight, int Utf16
	);

	private static int _ServerGraphemes(JsonElement item) {
		return item.TryGetProperty("serverGraphemes", out var server)
			? server.GetInt32()
			: item.GetProperty("graphemes").GetInt32();
	}

	private static List<Fixture> _LoadFixtures() {
		var relative = new[] {
			"apps", "front", "src", "lib", "text-counter", "text-counter-fixtures.json",
		};
		var directory = new DirectoryInfo(AppContext.BaseDirectory);
		while (directory is not null) {
			var candidate = Path.Combine([directory.FullName, .. relative]);
			if (File.Exists(candidate)) {
				using var document = JsonDocument.Parse(File.ReadAllText(candidate));
				return [.. document.RootElement.EnumerateArray().Select(item => new Fixture(
					item.GetProperty("name").GetString() ?? string.Empty,
					item.GetProperty("text").GetString() ?? string.Empty,
					TextCounterSpec._ServerGraphemes(item),
					item.GetProperty("bytes").GetInt32(),
					item.TryGetProperty("characters", out var characters) ? characters.GetInt32() : null,
					item.TryGetProperty("urlWeight", out var weight) ? weight.GetInt32() : 23,
					item.GetProperty("utf16").GetInt32()
				))];
			}

			directory = directory.Parent;
		}

		throw new InvalidOperationException(
			"Could not locate text-counter-fixtures.json above the test output directory."
		);
	}

	[Fact]
	public void ItShouldCountEveryFixtureStringLikeTheBrowser() {
		var fixtures = TextCounterSpec._LoadFixtures();
		fixtures.Should().NotBeEmpty();

		foreach (var fixture in fixtures) {
			TextCounter.CountGraphemes(fixture.Text).Should().Be(
				fixture.Graphemes, $"graphemes of '{fixture.Name}'"
			);
			TextCounter.CountBytes(fixture.Text).Should().Be(
				fixture.Bytes, $"bytes of '{fixture.Name}'"
			);
		}
	}

	[Fact]
	public void ItShouldCountUtf16CodeUnitsLikeTheBrowser() {
		foreach (var fixture in TextCounterSpec._LoadFixtures()) {
			Utf16CountingRule.Instance.Count(TextCounter.Normalize(fixture.Text)).Should().Be(
				fixture.Utf16, $"utf16 of '{fixture.Name}'"
			);
		}
	}

	[Fact]
	public void ItShouldCountMastodonCharactersLikeTheBrowser() {
		var fixtures = TextCounterSpec._LoadFixtures().Where(f => f.Characters is not null).ToList();
		fixtures.Should().NotBeEmpty();

		foreach (var fixture in fixtures) {
			var rule = new MastodonCountingRule(fixture.UrlWeight);
			rule.Count(TextCounter.Normalize(fixture.Text)).Should().Be(
				fixture.Characters, $"characters of '{fixture.Name}'"
			);
		}
	}
}
