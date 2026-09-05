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
 * Uses a deterministic Unicode blank contract wider than
 * `String.prototype.trim` so that zero-width spaces, Hangul fillers, C0/C1
 * controls and other visually empty code points that `trim()` leaves behind
 * are treated as absent — see brief #1879 (Cf) and issue #1931 (the rest).
 *
 * The contract is total — every string maps to either the trimmed cause or
 * the marker — and it is decided by Unicode properties plus a structural
 * property of the Braille encoding, not by a hand-written code-point list:
 * 1. `trim()` strips the ECMAScript whitespace set at the cause boundaries.
 * 2. `\p{White_Space}` catches whitespace between other blank characters.
 * 3. `\p{Default_Ignorable_Code_Point}` catches the default-ignorable subset
 *    of Cf (U+200B, U+FEFF, U+2066, …), Hangul fillers, variation selectors,
 *    the BOM, tag characters, …
 * 4. `\p{Cc}` catches C0 and C1 controls, which paint no glyph.
 * 5. `\p{Script=Braille}` identifies Braille patterns. Their low eight bits
 *    are the raised-dot mask, so a zero mask identifies the blank pattern;
 *    every dotted pattern remains visible.
 *
 * `\p{Default_Ignorable_Code_Point}` is NOT a synonym for `\p{Cf}`: it
 * covers the default-ignorable subset of Cf. Format characters that Unicode
 * deliberately does NOT mark default-ignorable — the Arabic number signs
 * (U+0600–U+0605), the Syriac abbreviation mark (U+070F), the interlinear
 * annotation anchors (U+FFF9–U+FFFB) — are Cf but not default-ignorable;
 * the contract leaves them alone (pinned by a test).
 *
 * What is deliberately NOT covered and why — these paint a visible glyph
 * and are correctly left alone:
 * - A lone combining acute (U+0301) paints an accent.
 * - An unassigned code point (U+0378) paints tofu (.notdef box).
 * - A lone surrogate (U+D800) paints the replacement character (U+FFFD).
 * - A dotted Braille pattern has raised dots and remains a real cause.
 *
 * This avoids a font-dependent canvas/layout measurement while still
 * classifying the empty Braille pattern from the encoding property itself.
 * See issue #1931.
 */
const BLANK_CODE_POINT =
	/^[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cc}]$/u;
const BRAILLE_PATTERN = /^\p{Script=Braille}$/u;

/**
 * Whether every code point in a string belongs to the deterministic blank
 * contract used by `formatFailureCause`.
 */
export const isVisuallyBlank = (value: string): boolean => {
	for (const character of value) {
		if (BLANK_CODE_POINT.test(character)) {
			continue;
		}

		const codePoint = character.codePointAt(0);
		if (
			codePoint !== undefined &&
			BRAILLE_PATTERN.test(character) &&
			codePoint % 0x100 === 0
		) {
			continue;
		}

		return false;
	}

	return true;
};

export const formatFailureCause = (
	cause: string | null | undefined,
	t: (key: string) => string,
): string => {
	if (typeof cause !== 'string') {
		return t('common:no-cause');
	}

	const trimmed = cause.trim();
	if (isVisuallyBlank(trimmed)) {
		return t('common:no-cause');
	}

	return trimmed;
};
