using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Lib;

namespace PublyApp.Api.Modules.Publishing.Services;

/// <summary>One image of the post (or of an effective view of it), in publish order.</summary>
public sealed record ContentAsset(
	Guid Id,
	string RelativePath,
	string ContentType,
	string? AltText,
	int WidthPx,
	int HeightPx
);

/// <summary>The post's shared content: segment texts and images, no overrides applied.</summary>
public sealed record SourceContent(
	string Body,
	IReadOnlyList<string> FollowUps,
	IReadOnlyList<ContentAsset> Assets
);

/// <summary>
/// What ONE destination will publish: <see cref="Texts"/> holds every segment (index 0 =
/// the root), <see cref="Images"/> belongs to the root segment. The segment count always
/// equals the post's: overrides replace texts, they never add or drop segments.
/// </summary>
public sealed record EffectiveContent(
	IReadOnlyList<string> Texts,
	IReadOnlyList<ContentAsset> Images,
	RenditionSettings? Settings
) {
	public string Body {
		get { return this.Texts[0]; }
	}

	public IReadOnlyList<string> FollowUps {
		get { return this.Texts.Skip(1).ToList(); }
	}

	public IReadOnlyList<string> ImageContentTypes {
		get { return this.Images.Select(image => image.ContentType).ToList(); }
	}
}

/// <summary>
/// The ONE place the post's content is overlaid with a destination's overrides (#2172).
/// Publish-now, schedule, edit-schedule, the dispatch job, the rendition endpoints and the
/// queue/history previews all read content through here, so "what will be published" has a
/// single definition. Static over the context on purpose: domain services never inject
/// domain services (same stance as <c>ThreadSegments</c>).
/// </summary>
public static class RenditionResolver {
	/// <summary>Pure overlay: the source content with the overrides applied, if any.</summary>
	public static EffectiveContent Resolve(SourceContent source, RenditionOverrides? overrides) {
		var texts = new List<string>(source.FollowUps.Count + 1) { source.Body };
		texts.AddRange(source.FollowUps);
		var images = source.Assets;
		if (overrides is null) {
			return new EffectiveContent(texts, images, null);
		}

		foreach (var (position, text) in overrides.Texts) {
			// An override past the end belongs to a segment the post no longer has.
			if (position >= 0 && position < texts.Count) {
				texts[position] = text;
			}
		}

		if (overrides.Media is { } media) {
			var byId = source.Assets.ToDictionary(asset => asset.Id);
			var ordered = media.AssetIds is null
				? source.Assets.ToList()
				: media.AssetIds
					.Where(byId.ContainsKey)
					.Select(id => byId[id])
					.ToList();
			images = ordered
				.Select(asset => media.AltTexts.TryGetValue(asset.Id, out var alt)
					? asset with { AltText = string.IsNullOrWhiteSpace(alt) ? null : alt }
					: asset)
				.ToList();
		}

		return new EffectiveContent(texts, images, overrides.Settings);
	}

	/// <summary>The effective root text, for previews that only show the first segment.</summary>
	public static string EffectiveRootText(string sourceBody, string? textOverridesJson) {
		return RenditionOverrides.ReadTexts(textOverridesJson).TryGetValue(0, out var text)
			? text
			: sourceBody;
	}

	public static async Task<SourceContent> LoadSourceAsync(
		AppDbContext db,
		Post post,
		CancellationToken cancellationToken
	) {
		var postId = post.GetRequiredId();
		var followUps = await ThreadSegments.FollowUpBodiesAsync(db, postId, cancellationToken);
		var assets = await (
			from media in db.PostMediaAsset.AsNoTracking()
			where media.PostId == postId && !media.IsDeleted
			orderby media.Position
			select media
		).ToListAsync(cancellationToken);
		return new SourceContent(
			post.Body,
			followUps,
			assets
				.Select(media => new ContentAsset(
					media.GetRequiredId(),
					media.RelativePath,
					media.ContentType,
					media.AltText,
					media.WidthPx,
					media.HeightPx
				))
				.ToList()
		);
	}

	/// <summary>The overrides stored for one publication, or null when it inherits everything.</summary>
	public static async Task<RenditionOverrides?> LoadOverridesAsync(
		AppDbContext db,
		Guid tenantId,
		Guid publicationId,
		CancellationToken cancellationToken
	) {
		var row = await db.Rendition
			.AsNoTracking()
			.FirstOrDefaultAsync(
				candidate => candidate.PublicationId == publicationId
					&& candidate.TenantId == tenantId,
				cancellationToken
			);
		return row is null ? null : RenditionOverrides.FromRow(row);
	}

	/// <summary>Batch form of the single-publication overload: publications without a row are absent.</summary>
	public static async Task<IReadOnlyDictionary<Guid, RenditionOverrides>> LoadOverridesAsync(
		AppDbContext db,
		Guid tenantId,
		IReadOnlyCollection<Guid> publicationIds,
		CancellationToken cancellationToken
	) {
		var rows = await db.Rendition
			.AsNoTracking()
			.Where(candidate => candidate.TenantId == tenantId
				&& publicationIds.Contains(candidate.PublicationId))
			.ToListAsync(cancellationToken);
		return rows.ToDictionary(row => row.PublicationId, RenditionOverrides.FromRow);
	}

	/// <summary>The effective content of an existing publication: post + its rendition, now.</summary>
	public static async Task<EffectiveContent> ResolveForPublicationAsync(
		AppDbContext db,
		Guid tenantId,
		Guid publicationId,
		Post post,
		CancellationToken cancellationToken
	) {
		var source = await RenditionResolver.LoadSourceAsync(db, post, cancellationToken);
		var overrides = await RenditionResolver.LoadOverridesAsync(
			db, tenantId, publicationId, cancellationToken
		);
		return RenditionResolver.Resolve(source, overrides);
	}
}
