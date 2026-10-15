using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.Publishing.Providers;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.Publishing.Services;

/// <summary>Why a body cannot be published (issue #2169).</summary>
public enum PublishContentFailureKind {
	Empty,
	TooLong,
}

/// <summary>
/// One refusal: <see cref="Provider"/> is the wire provider name, <see cref="Unit"/>
/// is "graphemes" or "bytes". <see cref="Limit"/>/<see cref="Actual"/> are 0 for
/// <see cref="PublishContentFailureKind.Empty"/>.
/// </summary>
public sealed record PublishContentFailure(
	PublishContentFailureKind Kind,
	string Provider,
	string Unit,
	int Limit,
	int Actual
) {
	public string Cause {
		get {
			if (this.Kind == PublishContentFailureKind.Empty) {
				return "The post text is empty. Write some text or attach media "
					+ "before publishing.";
			}

			return $"The post text is too long for {this.Provider}: {this.Actual} "
				+ $"{this.Unit}, the limit is {this.Limit}.";
		}
	}
}

/// <summary>
/// Pure publish-time content validation shared by publish-now, schedule,
/// edit-schedule and the dispatch job. Static on purpose: domain services never
/// inject domain services, and there is nothing to look up (the post text and the
/// target providers are passed in). Drafts are never validated here.
/// </summary>
public static class PublishValidationService {
	public const string GraphemeUnit = "graphemes";
	public const string ByteUnit = "bytes";

	public static PublishContentFailure? Validate(
		string body,
		bool hasMedia,
		IEnumerable<SocialProvider> providers
	) {
		var normalized = TextCounter.Normalize(body);
		var providerList = providers.Distinct().ToList();

		if (normalized.Length == 0 && !hasMedia) {
			var first = providerList.Count > 0
				? SocialAccountWire.FormatProvider(providerList[0])
				: string.Empty;
			return new PublishContentFailure(
				PublishContentFailureKind.Empty, first, PublishValidationService.GraphemeUnit, 0, 0
			);
		}

		var graphemes = TextCounter.CountGraphemes(normalized);
		var bytes = TextCounter.CountBytes(normalized);

		foreach (var provider in providerList) {
			var limits = ProviderLimits.For(provider);
			var name = SocialAccountWire.FormatProvider(provider);

			if (graphemes > limits.MaxTextGraphemes) {
				return new PublishContentFailure(
					PublishContentFailureKind.TooLong,
					name,
					PublishValidationService.GraphemeUnit,
					limits.MaxTextGraphemes,
					graphemes
				);
			}

			if (bytes > limits.MaxTextBytes) {
				return new PublishContentFailure(
					PublishContentFailureKind.TooLong,
					name,
					PublishValidationService.ByteUnit,
					limits.MaxTextBytes,
					bytes
				);
			}
		}

		return null;
	}
}
