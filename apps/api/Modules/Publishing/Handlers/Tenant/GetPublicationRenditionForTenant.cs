using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

public record RenditionSegmentItem {
	public required int Position { get; init; }
	public required string Text { get; init; }
}

public record RenditionAltTextItem {
	public required Guid AssetId { get; init; }
	public required string AltText { get; init; }
}

public record RenditionMediaItem {
	// Publish order; null keeps every image of the post.
	public required IReadOnlyList<Guid>? AssetIds { get; init; }
	public required IReadOnlyList<RenditionAltTextItem> AltTexts { get; init; }
}

public record RenditionEffectiveImageItem {
	public required Guid AssetId { get; init; }
	public required string ContentType { get; init; }
	public required string? AltText { get; init; }
}

/// <summary>What the destination will publish: the post overlaid with its overrides.</summary>
public record RenditionEffectiveItem {
	// Every segment text in order (index 0 = the root); the count never differs from the post's.
	public required IReadOnlyList<string> Texts { get; init; }
	public required IReadOnlyList<RenditionEffectiveImageItem> Images { get; init; }
}

public record RenditionResponse {
	public required Guid PublicationId { get; init; }
	// False = no overrides: the destination inherits the whole post.
	public required bool Customized { get; init; }
	// Only the overrides, as stored.
	public required IReadOnlyList<RenditionSegmentItem> Segments { get; init; }
	public required RenditionMediaItem? Media { get; init; }
	public required RenditionEffectiveItem Effective { get; init; }
}

public static class RenditionResponseMapper {
	public static RenditionResponse ToResponse(RenditionView view) {
		var overrides = view.Overrides;
		return new RenditionResponse {
			PublicationId = view.PublicationId,
			Customized = !overrides.IsEmpty,
			Segments = overrides.Texts
				.OrderBy(entry => entry.Key)
				.Select(entry => new RenditionSegmentItem { Position = entry.Key, Text = entry.Value })
				.ToList(),
			Media = overrides.Media is null
				? null
				: new RenditionMediaItem {
					AssetIds = overrides.Media.AssetIds,
					AltTexts = overrides.Media.AltTexts
						.Select(entry => new RenditionAltTextItem { AssetId = entry.Key, AltText = entry.Value })
						.ToList(),
				},
			Effective = new RenditionEffectiveItem {
				Texts = view.Effective.Texts,
				Images = view.Effective.Images
					.Select(image => new RenditionEffectiveImageItem {
						AssetId = image.Id,
						ContentType = image.ContentType,
						AltText = image.AltText,
					})
					.ToList(),
			},
		};
	}
}

/// <summary>
/// Reads a publication's overrides and the content it will publish (#2172). 404 for an
/// absent, deleted or foreign publication.
/// </summary>
public sealed class GetPublicationRenditionForTenant {
	public static async Task<Results<
		Ok<RenditionResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string publicationId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IRenditionService renditionService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		if (!Guid.TryParse(publicationId, out var publicationIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid publicationId",
				ResponseKeys.MalformedId
			);
		}

		var result = await renditionService.GetAsync(
			new GetRenditionArgs(tenantId, publicationIdGuid), cancellationToken
		);
		if (result is not RenditionResult.Found found) {
			return TypedProblems.NotFound("Publication not found", ResponseKeys.NotFound);
		}

		return TypedResults.Ok(RenditionResponseMapper.ToResponse(found.View));
	}
}
