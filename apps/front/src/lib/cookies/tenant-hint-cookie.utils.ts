import * as cookie from 'cookie';

import {
	TENANT_HINTS_COOKIE_KEY,
	TENANT_HINTS_COOKIE_KEY_LEGACY,
	TENANT_HINTS_COOKIE_VERSION,
	TENANT_HINTS_LEGACY_CLEAR_PATHS,
	TENANT_HINTS_MAX_COOKIE_LENGTH,
	TENANT_HINTS_MAX_ENTRIES,
} from '@org/shared-ts/lib/constants';
import duration from '@org/shared-ts/utils/duration.utils';

// UUID regex for validation (case-insensitive for parsing, but we normalize to lowercase)
const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isValidUuid = (value: string): boolean => UUID_REGEX.test(value);

/**
 * Normalizes UUID to lowercase canonical format.
 * Ensures consistent comparison and smaller cookie size.
 */
const normalizeUuid = (uuid: string): string => uuid.toLowerCase();

export type TenantHintsMap = Map<string, string>; // userId -> tenantId

/**
 * Parses the tenant hints cookie value into a Map.
 * Format: v1|userId:tenantId|userId:tenantId|...
 *
 * HARDENED parsing (DoS-safe):
 * - Returns empty map for missing/invalid/oversized cookie
 * - Stops after MAX_ENTRIES + 1 entries (ignores rest)
 * - Skips entries with invalid UUIDs
 * - Never throws (wrapped in try/catch)
 * - Never logs raw cookie values
 */
const parseTenantHintsCookie = (
	cookieValue: string | undefined,
): TenantHintsMap => {
	const map = new Map<string, string>();

	try {
		if (!cookieValue || typeof cookieValue !== 'string') {
			return map;
		}

		// HARDENING: Reject oversized cookies immediately (DoS protection)
		if (cookieValue.length > TENANT_HINTS_MAX_COOKIE_LENGTH) {
			return map;
		}

		const parts = cookieValue.split('|');

		// Check version prefix
		if (parts.length < 1 || !parts[0].startsWith('v')) {
			return map; // Unknown format, return empty
		}

		const version = parts[0];
		if (version !== TENANT_HINTS_COOKIE_VERSION) {
			// Future: handle version migrations here
			return map; // Unknown version, return empty
		}

		// HARDENING: Parse at most MAX_ENTRIES + 1 entries (ignore rest)
		const maxToParse = Math.min(parts.length, TENANT_HINTS_MAX_ENTRIES + 2); // +2 for version prefix + 1 extra

		// Parse entries (skip version prefix)
		for (let i = 1; i < maxToParse; i++) {
			const entry = parts[i];
			const colonIndex = entry.indexOf(':');

			if (colonIndex === -1) continue; // Invalid entry format

			const userId = entry.slice(0, colonIndex);
			const tenantId = entry.slice(colonIndex + 1);

			// Validate both are UUIDs
			if (!isValidUuid(userId) || !isValidUuid(tenantId)) continue;

			// Normalize to lowercase for consistent comparison
			// Delete first to ensure last occurrence becomes most-recent (LRU correctness)
			const normalizedUserId = normalizeUuid(userId);
			map.delete(normalizedUserId);
			map.set(normalizedUserId, normalizeUuid(tenantId));
		}
	} catch {
		// HARDENING: Never throw from parsing - return empty map on any error
		// No logging to avoid log-flooding DoS
		return new Map();
	}

	return map;
};

/**
 * Serializes the tenant hints Map to cookie value format.
 * Enforces max entries limit (oldest evicted).
 */
const serializeTenantHintsCookie = (map: TenantHintsMap): string => {
	// Convert to array, keeping insertion order (Map preserves order)
	let entries = Array.from(map.entries());

	// Enforce max entries (drop oldest = first entries)
	if (entries.length > TENANT_HINTS_MAX_ENTRIES) {
		entries = entries.slice(entries.length - TENANT_HINTS_MAX_ENTRIES);
	}

	// Return just version if empty, otherwise version|entries
	if (entries.length === 0) {
		return TENANT_HINTS_COOKIE_VERSION;
	}

	const entriesStr = entries
		.map(([userId, tenantId]) => `${userId}:${tenantId}`)
		.join('|');

	return `${TENANT_HINTS_COOKIE_VERSION}|${entriesStr}`;
};

/**
 * Gets tenant hint for a specific user from the mapping.
 * Returns undefined if no hint exists for this user.
 * Normalizes userId for consistent lookup.
 */
export const getTenantHintForUser = (
	map: TenantHintsMap,
	userId: string,
): string | undefined => {
	return map.get(normalizeUuid(userId));
};

/**
 * Updates the mapping with a user's tenant selection.
 * Moves the entry to "most recent" position (end of map).
 * Returns a new Map (immutable update).
 * Validates and normalizes IDs - returns unchanged map if invalid.
 */
export const setTenantHintForUser = (
	map: TenantHintsMap,
	userId: string,
	tenantId: string,
): TenantHintsMap => {
	// Validate inputs - don't poison cookie with invalid data
	// No logging to avoid log-flooding DoS and leaking IDs
	if (!isValidUuid(userId) || !isValidUuid(tenantId)) {
		return map; // Return unchanged
	}

	const newMap = new Map(map);
	const normalizedUserId = normalizeUuid(userId);
	const normalizedTenantId = normalizeUuid(tenantId);

	// Delete first to ensure it's moved to end (most recent)
	newMap.delete(normalizedUserId);
	newMap.set(normalizedUserId, normalizedTenantId);

	return newMap;
};

/**
 * Cookie serialization options for browser writes.
 */
const getCookieOptions = (isSecure: boolean) => ({
	path: '/',
	sameSite: 'lax' as const,
	secure: isSecure,
	maxAge: duration.toSeconds('30d'),
});

/**
 * Determines if cookies should use Secure flag.
 * Handles reverse proxy scenarios by checking X-Forwarded-Proto header.
 * Falls back to URL check for direct connections.
 */
export const isSecureCookieFromRequest = (request: Request): boolean => {
	// Check forwarded proto header (set by reverse proxy like Traefik/nginx)
	// Handle comma-separated values (e.g., "https, http" from chained proxies)
	const forwardedProto = request.headers.get('X-Forwarded-Proto');
	if (forwardedProto) {
		const firstProto = forwardedProto.split(',')[0].trim();
		return firstProto === 'https';
	}

	// Fallback to URL check (works for direct connections)
	return request.url.startsWith('https');
};

/**
 * Client-side secure flag detection.
 * Uses window.location.protocol which is always accurate.
 */
export const isSecureCookieFromBrowser = (): boolean => {
	return typeof window !== 'undefined' && window.location.protocol === 'https:';
};

/**
 * Reads and parses tenant hints from browser cookies (client-side).
 * Also handles legacy cookie migration.
 */
export const readTenantHintsFromBrowser = (): TenantHintsMap => {
	const browserCookies = cookie.parse(document.cookie);
	return parseTenantHintsCookie(browserCookies[TENANT_HINTS_COOKIE_KEY]);
};

/**
 * Reads legacy tenant cookie from browser (client-side).
 * Returns validated & normalized UUID or undefined.
 * For migration fallback - prefer readTenantHintsFromBrowser().
 */
export const readLegacyTenantFromBrowser = (): string | undefined => {
	const browserCookies = cookie.parse(document.cookie);
	const legacy = browserCookies[TENANT_HINTS_COOKIE_KEY_LEGACY];
	return legacy && isValidUuid(legacy) ? normalizeUuid(legacy) : undefined;
};

/**
 * Clears legacy tenant cookie from browser (client-side).
 * Only clears root path - browser can only see its accessible paths.
 */
export const clearLegacyTenantFromBrowser = (): void => {
	document.cookie = cookie.serialize(TENANT_HINTS_COOKIE_KEY_LEGACY, '', {
		path: '/',
		maxAge: 0,
		expires: new Date(0),
	});
};

/**
 * Writes tenant hints to browser cookie (client-side).
 * Auto-detects secure flag from browser protocol.
 */
const writeTenantHintsToBrowser = (map: TenantHintsMap): void => {
	const value = serializeTenantHintsCookie(map);
	const serialized = cookie.serialize(
		TENANT_HINTS_COOKIE_KEY,
		value,
		getCookieOptions(isSecureCookieFromBrowser()),
	);
	document.cookie = serialized;
};

/**
 * Convenience: Update current user's hint and write to browser cookie.
 * Auto-detects secure flag. Returns true if cookie was updated.
 */
export const updateTenantHintInBrowser = (
	userId: string,
	tenantId: string,
): boolean => {
	const currentMap = readTenantHintsFromBrowser();
	const updatedMap = setTenantHintForUser(currentMap, userId, tenantId);

	// Check if map actually changed (setTenantHintForUser returns unchanged map on invalid input)
	if (updatedMap === currentMap) {
		return false; // Invalid input, cookie not updated
	}

	writeTenantHintsToBrowser(updatedMap);
	return true;
};

/**
 * Removes the tenant hint for a specific user from the browser cookie.
 * Used when a tenant is suspended to prevent redirect loops.
 * Returns true if the entry was removed, false if user wasn't in the map.
 */
export const clearTenantHintForUserInBrowser = (userId: string): boolean => {
	const currentMap = readTenantHintsFromBrowser();
	const normalizedUserId = userId.toLowerCase();

	// Check if user exists in map
	if (!currentMap.has(normalizedUserId)) {
		return false; // User wasn't in the map
	}

	// Create new map without this user
	const newMap = new Map(currentMap);
	newMap.delete(normalizedUserId);

	writeTenantHintsToBrowser(newMap);
	return true;
};

/**
 * Reads and parses tenant hints from request cookies (server-side).
 * Also reads legacy cookie as fallback for migration.
 */
export const readTenantHintsFromRequest = (
	requestCookies: Record<string, string | undefined>,
): { map: TenantHintsMap; legacyTenantId: string | undefined } => {
	const map = parseTenantHintsCookie(requestCookies[TENANT_HINTS_COOKIE_KEY]);
	const legacyTenantId = requestCookies[TENANT_HINTS_COOKIE_KEY_LEGACY];

	// Validate legacy value is a UUID and normalize to lowercase
	const validLegacy =
		legacyTenantId && isValidUuid(legacyTenantId)
			? normalizeUuid(legacyTenantId)
			: undefined;

	return { map, legacyTenantId: validLegacy };
};

/**
 * Convenience helper that reads tenant hints directly from Request headers.
 * Preferred over readTenantHintsFromRequest() - routes don't need to parse cookies themselves.
 */
export const readTenantHintsFromRequestHeaders = (
	request: Request,
): { map: TenantHintsMap; legacyTenantId: string | undefined } => {
	const cookieHeader = request.headers.get('Cookie') || '';
	const requestCookies = cookie.parse(cookieHeader);
	return readTenantHintsFromRequest(requestCookies);
};

/**
 * Serializes tenant hints cookie for Set-Cookie header (server-side).
 * Requires explicit isSecure param - use isSecureCookieFromRequest() to determine.
 */
export const serializeTenantHintsForResponse = (
	map: TenantHintsMap,
	isSecure: boolean,
): string => {
	const value = serializeTenantHintsCookie(map);
	return cookie.serialize(
		TENANT_HINTS_COOKIE_KEY,
		value,
		getCookieOptions(isSecure),
	);
};

/**
 * Returns Set-Cookie header value to clear the legacy cookie at root path.
 * @deprecated Use serializeClearLegacyCookieHeaders() for complete cleanup
 */
export const serializeClearLegacyCookie = (): string => {
	return cookie.serialize(TENANT_HINTS_COOKIE_KEY_LEGACY, '', {
		path: '/',
		maxAge: 0,
		expires: new Date(0), // Belt and suspenders
	});
};

/**
 * Returns Set-Cookie headers to clear the legacy cookie at ALL likely paths.
 * HARDENING: Handles path-scoped duplicate cookies from historical bugs.
 * Clears at: /, /auth, /auth/login, /app
 */
export const serializeClearLegacyCookieHeaders = (): string[] => {
	return TENANT_HINTS_LEGACY_CLEAR_PATHS.map((path) =>
		cookie.serialize(TENANT_HINTS_COOKIE_KEY_LEGACY, '', {
			path,
			maxAge: 0,
			expires: new Date(0), // Belt and suspenders
		}),
	);
};
