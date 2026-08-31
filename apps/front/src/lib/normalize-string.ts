/**
 * Coerce a possibly-null/undefined string into a trimmed non-empty value, or
 * `null`. Three query-option mappers previously inlined this exact function
 * (`auth.ts`, `tenants-for-picker.ts`, `needs-reconnect-accounts.ts`), which
 * the production-clone `jscpd` ratchet was flagging. The single home here
 * keeps the parsing boundary on one rule and removes the duplicate.
 */
export const normalizeString = (
	value: string | null | undefined,
): string | null => {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return null;
};
