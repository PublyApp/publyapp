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
	public const int SearchMaxLength = 256;

	// Alt text rides on the attached image row; bounded here like every other
	// wire field so the DB column stays permissive while the contract is not.
	public const int ImageAltTextMaxLength = 1_000;
}
