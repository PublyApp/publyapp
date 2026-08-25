/**
 * #1415 — the structural, node-side half of the box-shadow-ring contract.
 *
 * `OUTLINE_TOKEN_ALLOWLIST` (focus-ring-cascade.spec.ts) tells the rendered
 * guard an allowlisted primitive may paint NO outline at `:focus-visible`
 * because its documented focus treatment is the Tailwind ring family
 * (`focus-visible:ring-3`/`ring-2` + `focus-visible:border-ring` over an
 * `outline-none` reset — DESIGN.md "Focus rings"). Until #1415 nothing
 * asserted the OTHER half of that bargain on the compiled production asset:
 * a primitive could keep `outline: none` and silently lose the ring — focus
 * becomes invisible and the rendered guard stays green, because for
 * allowlisted probes it only asserted the outline member's absence.
 *
 * This gate closes that hole structurally, on EVERY read of the compiled
 * stylesheet (same fail-loud slot as `assertUsableCompiledCss`, before any
 * browser session is spent): the sheet must still carry, in compiled form,
 * the `:focus-visible` ring rules the DESIGN.md families are written with.
 *
 * Why compiled-form matching is honest here: Tailwind v4 emits every ring
 * utility as a `--tw-ring-shadow` declaration whose spread lives inside
 * `calc(<N>px + var(--tw-ring-offset-width))`, guarded by a `:focus-visible`
 * selector for these utilities. A mutation that drops the ring from a
 * primitive deletes those rules from the asset; one that shrinks them
 * (`ring-0`/`ring-1`) rewrites N below the pinned floor; either way the pin
 * goes red naming the family. Resting chrome shadows (card elevation, input
 * depth) declare `box-shadow` without any `:focus-visible` selector and can
 * never satisfy the pin.
 *
 * What this gate deliberately does NOT do: it does not tie rules to
 * primitives by name — class names are build artifacts, not contracts.
 * The per-primitive proof that each allowlisted probe's ring actually paints
 * lives in the rendered guard (`focus-ring-cascade.spec.ts`), which reads the
 * engine-resolved paint through real keyboard focus. The two halves together
 * are the contract: structure pins the families exist at their widths;
 * render proves each allowlisted probe gains the ring at `:focus-visible`.
 */

/** The 3px box-shadow-ring family per DESIGN.md "Focus rings": button,
 * badge (`ring-[3px]`), input, textarea, select, switch. */
export const FOCUS_RING_FAMILY_PX = 3;

/** The checkbox's documented 2px ring (DESIGN.md "Focus rings"). */
export const CHECKBOX_RING_PX = 2;

/**
 * #1379/#1415 — probes allowed to rely on the box-shadow ring ALONE at
 * `:focus-visible`, i.e. allowed to paint NO outline. Single source of truth
 * for BOTH halves of the allowlist bargain: the rendered guard
 * (`focus-ring-cascade.spec.ts`) asserts these probes paint no outline AND
 * that they DO gain a >= pinned-width box-shadow ring at focus; this module's
 * structural gate pins the ring families' compiled existence at those widths.
 *
 * Deliberately kept narrow: every entry is a primitive whose focus treatment
 * is documented in DESIGN.md ("Focus rings") as the Tailwind ring utility
 * family (`focus-visible:ring-3` / `ring-[3px]` / `ring-2` +
 * `focus-visible:border-ring`) over an `outline-none` reset — button, badge,
 * input, textarea, select, switch at 3px, checkbox at 2px. None of these
 * ships an outline today; if one starts painting an outline the drift must be
 * looked at and this list updated BY A DESIGN DECISION, never silently.
 */
export const OUTLINE_TOKEN_ALLOWLIST: ReadonlySet<string> = new Set([
	// button.tsx — `focus-visible:ring-3 focus-visible:ring-ring` over
	// `outline-none` (DESIGN.md "Focus rings", 3px family).
	'button-default',
	// button.tsx variant="outline" — same 3px family as above; the variant
	// changes the resting chrome, not the focus contract.
	'button-outline',
	// #1405/#1415: input.tsx — `focus-visible:ring-3 focus-visible:ring-ring/30`
	// + `focus-visible:border-ring` over `outline-none` (DESIGN.md "Focus
	// rings", 3px family, line-borne).
	'input',
	// select.tsx SelectTrigger — same 3px family over `outline-none`.
	'select-trigger',
	// switch.tsx — `focus-visible:ring-3 focus-visible:ring-ring`.
	'switch',
	// checkbox.tsx — the documented 2px exception (`focus-visible:ring-2`).
	'checkbox',
	// textarea.tsx — same 3px family as input.tsx.
	'textarea',
	// NOTE: the badge probes (badge-link / badge-outline-link) are NOT
	// members: badge.tsx carries the 3px ring on its base AND the contractual
	// outline behind `[a]:focus-visible:outline-2 [a]:focus-visible:outline-ring`
	// (#1405) — through the badge-as-link pattern it paints BOTH, so it is
	// measured against the full outline triad, not this allowlist.
]);

type RingRule = {
	/** The full matched rule text — carried into error messages so a red
	 * pin shows exactly which compiled rule failed the floor. */
	raw: string;
	/** Parsed widest spread of the rule's `--tw-ring-shadow` value(s), px. */
	widestSpreadPx: number;
};

/**
 * Matches a compiled CSS rule whose selector chain contains
 * `:focus-visible` and whose body declares `--tw-ring-shadow` (the variable
 * every Tailwind v4 ring utility feeds into the winning `box-shadow`). The
 * regex walks rule-shaped chunks so a body can never be attributed to the
 * wrong selector.
 */
const RING_RULE_SOURCE =
	/([^{}]*:focus-visible[^{}]*)\{([^{}]*--tw-ring-shadow[^{}]*)\}/g;

/**
 * Extracts the px spreads a compiled `--tw-ring-shadow` value declares.
 * Tailwind v4 writes them as `calc(<N>px + var(--tw-ring-offset-width))`
 * (bare `<N>px` accepted defensively); anything unparsable contributes
 * nothing rather than being silently treated as compliant — an exotic
 * emission that dodges BOTH parsers fails loud via the zero-rules gate
 * instead.
 */
const parseRingSpreadsPx = (value: string): number[] => {
	const spreads: number[] = [];
	const calcPattern = /calc\(\s*([0-9.]+)px\s*\+/g;
	const barePattern = /\b([0-9.]+)px\b/g;
	for (const match of value.matchAll(calcPattern)) {
		spreads.push(Number.parseFloat(match[1]));
	}
	if (spreads.length === 0) {
		for (const match of value.matchAll(barePattern)) {
			spreads.push(Number.parseFloat(match[1]));
		}
	}
	return spreads;
};

/** Widest `:focus-visible`-guarded ring rule at or above `minSpreadPx`. */
const findFocusVisibleRingRules = (css: string): RingRule[] => {
	const rules: RingRule[] = [];
	for (const match of css.matchAll(RING_RULE_SOURCE)) {
		const [raw, selector, body] = match;
		void selector;
		const spreads = parseRingSpreadsPx(body);
		if (spreads.length === 0) {
			continue;
		}
		rules.push({ raw: raw.trim(), widestSpreadPx: Math.max(...spreads) });
	}
	return rules;
};

const formatRules = (rules: RingRule[]): string =>
	rules.map((rule) => `${rule.widestSpreadPx}px ← ${rule.raw}`).join('; ');

/**
 * Structural pin over the compiled production stylesheet — throws unless
 * every DESIGN.md "Focus rings" ring family survives in compiled form:
 *
 * - the 3px family (button/badge/input/textarea/select/switch) must have at
 *   least one `:focus-visible` rule carrying a `--tw-ring-shadow` spread of
 *   exactly 3px;
 * - the checkbox's 2px family likewise at exactly 2px.
 *
 * Zero matching rules is NEVER a pass: it throws with a plain-words cause.
 */
export const assertFocusRingUtilitiesPinned = (css: string): void => {
	const rules = findFocusVisibleRingRules(css);

	const assertFamily = (familyPx: number, label: string): void => {
		// Plain throw, not vitest's `expect`: this helper is loaded by BOTH
		// the vitest unit pins and the Playwright spec, and only the former
		// has vitest's globals in scope (same shape as
		// `assertUsableCompiledCss`).
		const exact = rules.filter((rule) => rule.widestSpreadPx === familyPx);
		if (exact.length > 0) {
			return;
		}
		throw new Error(
			label +
				`no :focus-visible rule carries the ${familyPx}px box-shadow ring ` +
				'in the compiled stylesheet — the ring family DESIGN.md ' +
				'"Focus rings" documents for this primitive group has been ' +
				'dropped or shrunk below its pinned width. Compiled ' +
				':focus-visible ring rules found (each listed as its WIDEST ' +
				`ring spread): ${
					rules.length > 0 ? formatRules(rules) : 'NONE (0 rules)'
				}.`,
		);
	};

	assertFamily(
		FOCUS_RING_FAMILY_PX,
		'box-shadow-ring family (' +
			'button/badge/input/textarea/select/switch, ' +
			`DESIGN.md "Focus rings"):`,
	);
	assertFamily(CHECKBOX_RING_PX, 'checkbox box-shadow-ring family:');
};
