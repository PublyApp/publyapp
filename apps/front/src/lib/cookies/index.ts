export { logout } from './logout.utils';
export { createClearSessionCookieHeaders } from './server-cookie.utils';
export {
	clearSessionCookie,
	getSessionCookieFromClient,
} from './session-cookie.utils';

// =============================================================================
// Tenant Hint Cookie - Public API
// See: docs/implementation-plans/identity-scoped-tenant-cookie.md
// =============================================================================

export {
	// Client-side helpers (browser)
	clearLegacyTenantFromBrowser, // Clear legacy cookie (tenant-suspended handling)
	clearTenantHintForUserInBrowser, // Clear hint for specific user (tenant-suspended handling)
	// Map operations (used by both server and client)
	getTenantHintForUser,
	isSecureCookieFromBrowser,
	isSecureCookieFromRequest,
	readLegacyTenantFromBrowser, // Read legacy cookie for migration fallback
	readTenantHintsFromBrowser,
	readTenantHintsFromRequest, // If you already have parsed cookies
	// Server-side helpers (SSR loaders/actions)
	readTenantHintsFromRequestHeaders, // Preferred - parses cookies internally
	serializeClearLegacyCookie, // Deprecated - only clears at /
	serializeClearLegacyCookieHeaders, // Preferred - clears at all likely paths
	serializeTenantHintsForResponse,
	setTenantHintForUser,
	// Types
	type TenantHintsMap,
	updateTenantHintInBrowser, // Preferred over writeTenantHintsToBrowser
} from './tenant-hint-cookie.utils';

// NOTE: The following are intentionally NOT exported (internal implementation):
// - parseTenantHintsCookie, serializeTenantHintsCookie (low-level parsing)
// - writeTenantHintsToBrowser (use updateTenantHintInBrowser instead)
// - isValidUuid, normalizeUuid (validation/normalization internals)
// - getCookieOptions (cookie config internals)
