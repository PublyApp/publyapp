using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Lib.ProblemResults;

using Xunit;

namespace PublyApp.Api.Lib.Testing.Helpers;

/// <summary>
/// One-call assertions for the problem-details bodies the API returns on failures.
/// </summary>
internal static class ProblemAssertions {
	/// <summary>Reads the body as <see cref="AppProblemDetails"/> and asserts its translation key.</summary>
	public static async Task ShouldBeProblemAsync(
		this HttpResponseMessage response,
		string translationKey
	) {
		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(translationKey);
	}

	/// <summary>Reads the body as <see cref="ValidationProblemDetails"/> and asserts its translation key.</summary>
	public static async Task ShouldBeValidationProblemAsync(
		this HttpResponseMessage response,
		string translationKey
	) {
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(translationKey);
	}

	/// <summary>Reads the body as <see cref="ValidationProblemDetails"/> and asserts it reports an error on <paramref name="field"/>.</summary>
	public static async Task ShouldHaveValidationErrorAsync(
		this HttpResponseMessage response,
		string field
	) {
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey(field);
	}
}
