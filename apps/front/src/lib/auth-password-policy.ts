/**
 * Interim single source of truth for the password minimum length, mirroring
 * the API's `PASSWORD_MIN_LENGTH` (`.env.development`,
 * `apps/api/Lib/Validation/JsonElementRules.cs`'s `MustBeRequiredPassword`).
 * TODO(fixr2-api): replace with a value sourced from the API at runtime so
 * the two can never drift again.
 */
export const PASSWORD_MIN_LENGTH = 12;
