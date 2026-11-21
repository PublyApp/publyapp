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
		var problem = await ProblemAssertions._ReadProblemAsync<AppProblemDetails>(response);
		problem.TranslationKey.Should().Be(translationKey);
	}

	/// <summary>Reads the body as <see cref="ValidationProblemDetails"/> and asserts its translation key.</summary>
	public static async Task ShouldBeValidationProblemAsync(
		this HttpResponseMessage response,
		string translationKey
	) {
		var problem = await ProblemAssertions._ReadProblemAsync<ValidationProblemDetails>(response);
		problem.TranslationKey.Should().Be(translationKey);
	}

	/// <summary>Reads the body as <see cref="ValidationProblemDetails"/> and asserts it reports an error on <paramref name="field"/>.</summary>
	public static async Task ShouldHaveValidationErrorAsync(
		this HttpResponseMessage response,
		string field
	) {
		var problem = await ProblemAssertions._ReadProblemAsync<ValidationProblemDetails>(response);
		problem.Errors.Should().ContainKey(field);
	}

	private static async Task<T> _ReadProblemAsync<T>(HttpResponseMessage response)
		where T : AppProblemDetails {
		var problem = await response.Content.ReadFromJsonAsync<T>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		return problem;
	}
}
