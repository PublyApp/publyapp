namespace PublyApp.Api.Modules.Posts.Validation;

/// <summary>
/// Post domain validation bounds. Mirrors the #1135 profile-fields mechanism:
/// max lengths are validator-side constants, not EF column bounds, so the
/// database schema stays permissive while the API contract is bounded here.
/// </summary>
public static class PostValidationRules {
	// Long-form social/blog content; consistent with the repo's existing
	// scale (Message 2000, Description 1024) but generous for article bodies.
	public const int BodyMaxLength = 20_000;
}
