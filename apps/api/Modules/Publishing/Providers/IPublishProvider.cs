namespace PublyApp.Api.Modules.Publishing.Providers;

/// <summary>
/// The delivery seam between the publishing domain and a social provider (Epic D
/// §3). The publish job depends on THIS interface only; BlueskyPublishProvider is
/// the first implementation. Implementations classify every outcome into a
/// <see cref="PublishResult"/> kind — they never throw for classified failures.
/// </summary>
public interface IPublishProvider {
	Task<PublishResult> PublishAsync(PublishRequest request, CancellationToken cancellationToken);
}
