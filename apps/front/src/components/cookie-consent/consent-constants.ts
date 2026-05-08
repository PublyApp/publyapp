// Storage key shared by both localStorage and the cookie. Same key in both
// stores keeps the contract simple for downstream debuggers.
export const CONSENT_STORAGE_KEY = 'publyapp:cookie-consent';

// Bump to re-prompt all users (e.g. when adding a new category or changing
// the meaning of an existing one). Stored alongside the consent record so we
// can detect mismatches.
export const CONSENT_POLICY_VERSION = 1;

// CNIL guidance: re-prompt for consent at most every 13 months. ~395 days.
export const CONSENT_REPROMPT_AFTER_DAYS = 395;

// Cookie max-age. Most browsers cap JS-set cookies at 400 days.
export const CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

// Schema version for the persisted record. Bump when changing the StoredConsent
// shape; the read path treats unknown schemas as invalid (re-prompts).
export const CONSENT_SCHEMA_VERSION = 1;
