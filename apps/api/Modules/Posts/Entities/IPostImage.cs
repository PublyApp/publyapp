namespace PublyApp.Api.Modules.Posts.Entities;

/// <summary>
/// What every stored post image exposes to read models and publishing, whether it
/// belongs to the post itself (<see cref="PostMediaAsset"/>) or to one follow-up
/// segment (<see cref="PostSegmentMediaAsset"/>, #2181).
/// </summary>
public interface IPostImage {
	Guid GetRequiredId();

	int Position { get; }

	string RelativePath { get; }

	string ContentType { get; }

	string? AltText { get; }

	int WidthPx { get; }

	int HeightPx { get; }
}
