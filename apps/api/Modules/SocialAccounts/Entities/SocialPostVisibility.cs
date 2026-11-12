namespace PublyApp.Api.Modules.SocialAccounts.Entities;

/// <summary>
/// Who can see the posts PublyApp publishes to a fediverse account (#2186). Stored as
/// an int; the wire value is the Mastodon API word (<c>public</c>, <c>unlisted</c>,
/// <c>private</c>) so it goes to the instance unchanged. Direct messages are not a
/// publishing visibility and are deliberately absent.
/// </summary>
public enum SocialPostVisibility {
	Public = 0,
	Unlisted = 1,
	Private = 2,
}
