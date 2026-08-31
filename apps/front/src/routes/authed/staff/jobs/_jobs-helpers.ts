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
 * zero-width spaces (U+200B), Hangul fillers (U+115F / U+1160 / U+3164),
 * C0/C1 control characters and other "visually empty" code points that
 * `trim()` leaves behind are treated as absent — see brief #1879 (Cf) and
 * issue #1931 (the rest).
 *
 * The predicate is NOT a hand-written list. It combines:
 * - `\p{Default_Ignorable_Code_Point}` — Cf (U+200B, U+FEFF, …), Hangul
 *   fillers (U+115F, U+1160, U+3164), variation selectors, the BOM, etc.
 * - `\p{Cc}` — C0 and C1 control characters (U+0000–U+0008, U+000B/C,
 *   U+000E–U+001F, U+007F–U+009F) — browsers paint no glyph for them.
 * - One NAMED exception: U+2800 BRAILLE PATTERN BLANK, a printing character
 *   (category So) that happens to render as blank and is NOT default-ignorable.
 *
 * What is deliberately NOT covered and why — these paint a visible glyph
 * and are correctly left alone:
 * - A lone combining acute (U+0301) paints an accent.
 * - An unassigned code point (U+0378) paints tofu (.notdef box).
 * - A lone surrogate (U+D800) paints the replacement character (U+FFFD).
 *
 * No Unicode property isolates "renders blank" — only a font measure could
 * — so U+2800 is named, justified, and the reason lives next to it.
 * See issue #1931.
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
	// but leaves Cf (e.g. U+200B ZWSP), Cc controls and other "visually empty"
	// code points intact. A cause that is visually empty — only those code
	// points — must still show the marker.
	//
	// `\p{Default_Ignorable_Code_Point}` is the Unicode property the spec
	// defines for "should not render" — it covers Cf (U+200B, U+FEFF, …) AND
	// Hangul fillers (U+115F, U+1160, U+3164) and variation selectors. It is
	// a property, not a hand-written list.
	//
	// `\p{Cc}` adds C0/C1 control characters — browsers paint no glyph for
	// them. Tab, newline and carriage return are already stripped by `trim()`.
	//
	// The trailing `.trim()` is load-bearing, not decoration: the leading
	// `cause.trim()` cannot remove whitespace that sits BETWEEN two invisible
	// code points. `"\u200B \u200B"` survives the first trim intact, and
	// stripping the invisibles leaves a lone space — visually empty, but
	// length 1. Without the second trim that cause reaches the operator as an
	// empty cell, which is the defect this whole predicate exists to prevent.
	//
	// Named exception: U+2800 BRAILLE PATTERN BLANK. It is category So
	// (Other_Symbol), NOT default-ignorable — Unicode treats it as a
	// printing character whose glyph happens to be empty. No property
	// isolates "renders blank"; a runtime cannot measure glyph width, so
	// the only honest answer is to name the code point and explain it here.
	if (
		trimmed
			.replace(/[\p{Default_Ignorable_Code_Point}\p{Cc}\u2800]/gu, '')
			.trim().length === 0
	) {
		return t('common:no-cause');
	}

	return trimmed;
};
