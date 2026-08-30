/**
 * Shared decision for "what text to show for a failure cause" — single source
 * of truth for the column AND the two drawers (dead-letter, queue). Without
 * this, the three sites diverge: the column used `||` (catches empty string),
 * the drawers used `??` (lets an empty/whitespace cause through as a blank
 * cell). Rule: a cause that is null, undefined, or only whitespace is absent
 * and renders as the designated "no cause recorded" marker.
 *
 * Returns the trimmed cause when present, the translated marker otherwise.
 * Never returns the dash (`no-value`) — that key is for genuinely-empty
 * non-cause fields (e.g. a missing job type), not for a missing failure cause.
 *
 * Uses a whitespace predicate wider than `String.prototype.trim` so that
 * zero-width spaces (U+200B), Hangul fillers (U+115F / U+1160 / U+3164) and
 * other "visually empty" code points that `trim()` leaves behind are treated
 * as absent — see brief #1879 (Cf) and issue #1931 (the rest).
 *
 * The predicate is NOT a hand-written list. It uses one Unicode property
 * (`Default_Ignorable_Code_Point`) that already covers everything that
 * "should not render" per Unicode — Cf, the Hangul fillers, variation
 * selectors, the BOM, etc. — plus one NAMED exception for U+2800 BRAILLE
 * PATTERN BLANK, which is a printing character (category So) that happens
 * to render as blank and is NOT default-ignorable. No Unicode property
 * isolates "renders blank" — only a font measure could — so the exception
 * is named, justified, and the reason lives next to it. See issue #1931.
 */
export const formatFailureCause = (
	cause: string | null | undefined,
	t: (key: string) => string,
): string => {
	if (typeof cause !== 'string') {
		return t('common:no-cause');
	}

	const trimmed = cause.trim();
	// `String.prototype.trim` strips ASCII whitespace + `Zs` (including U+00A0),
	// but leaves Cf (e.g. U+200B ZWSP) and other "visually empty" code points
	// intact. A cause that is visually empty — only those code points — must
	// still show the marker.
	//
	// `\p{Default_Ignorable_Code_Point}` is the Unicode property the spec
	// defines for "should not render" — it covers Cf (U+200B, U+FEFF, …) AND
	// Hangul fillers (U+115F, U+1160, U+3164) and variation selectors. It is
	// a property, not a hand-written list.
	//
	// Named exception: U+2800 BRAILLE PATTERN BLANK. It is category So
	// (Other_Symbol), NOT default-ignorable — Unicode treats it as a
	// printing character whose glyph happens to be empty. No property
	// isolates "renders blank"; a runtime cannot measure glyph width, so
	// the only honest answer is to name the code point and explain it here.
	if (
		trimmed.replace(/[\p{Default_Ignorable_Code_Point}\u2800]/gu, '').length ===
		0
	) {
		return t('common:no-cause');
	}

	return trimmed;
};
