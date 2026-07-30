/**
 * #992/#975 review follow-up (round 2, IMPORTANT findings A and B): two
 * source-reading regression tests each resolved a CSS selector with a
 * non-global regex and accepted the FIRST matching rule block in app.css.
 * In real CSS, a later rule at the same specificity wins per declaration —
 * so a later duplicate rule for the same selector silently overrides an
 * earlier one, and neither test could see it. Both reviewer mutations that
 * exploited this appended exactly that: a second, later block for the same
 * exact selector that changes only some of the original's declarations.
 *
 * This module collects EVERY top-level rule block whose selector is an
 * exact match for the given selector text (not a compound selector merely
 * containing it, and not a longer selector that merely starts with it), in
 * file order, and resolves each CSS property independently to whichever
 * declaration for it appeared LAST — which is exactly the cascade behaviour
 * for repeated rules at equal specificity.
 *
 * This is deliberately a NARROW, honestly-limited model, not a CSS engine.
 * Known limits, left unhandled on purpose (implementing them convincingly
 * would just be building an undertested CSS engine of its own):
 *  - selector SPECIFICITY is not computed at all. A compound selector that
 *    contains this selector as one of its classes (e.g.
 *    `.foo.publy-profile-detail-tile-pin`) is not detected as a competing,
 *    higher-specificity rule, and a same-specificity rule declared FIRST in
 *    a compound form is not distinguished from one declared as the exact
 *    class alone.
 *  - `!important` is not honoured — an earlier `!important` declaration
 *    that should always win is instead overridden by a later plain one.
 *  - `@media`/`@supports`/`@layer` conditions are not evaluated. A rule
 *    inside a media query that does not currently match the viewport is
 *    still treated as if it always applies.
 *  - only the given CSS source string is scanned; rules in any other
 *    stylesheet are invisible to this resolver.
 * Wherever any of those limits could matter for a specific check, prefer a
 * real-browser (Playwright + `getComputedStyle`) assertion instead — see
 * `e2e/profile-icon-picker-pin-contrast.spec.ts`, which asserts the real
 * computed cascade for the same rule this module also backs in
 * `profile-icon-picker-pin-contrast.test.ts`.
 */

const escapeRegExpLiteral = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Finds every top-level `{ ... }` block whose selector is an EXACT match
 * for `selector` (allowing it to appear anywhere in a comma-separated
 * selector list), in source order. Rejects a selector that merely starts
 * with `selector` (e.g. a `-impostor`-style suffix) by requiring a
 * non-identifier boundary immediately after the matched text. */
const findExactSelectorRuleBodies = (
	source: string,
	selector: string,
): string[] => {
	const escaped = escapeRegExpLiteral(selector);
	// Allow the selector to be preceded by start-of-string/whitespace/`{`/`}`/
	// a selector-list comma, and followed (after optional whitespace) by
	// either the rule's opening `{`, or a `,` continuing a selector list —
	// both bounded so a longer, unrelated selector sharing this prefix is
	// never mistaken for an exact match.
	const ruleRegex = new RegExp(
		`(?:^|[\\s,{}])${escaped}(?![\\w-])\\s*(?:,[^{]*)?\\{([^}]*)\\}`,
		'g',
	);

	const bodies: string[] = [];
	let match: RegExpExecArray | null;
	while ((match = ruleRegex.exec(source)) !== null) {
		bodies.push(match[1]);
	}

	return bodies;
};

/** Parses a rule body's `property: value;` declarations, in order. */
const parseDeclarations = (body: string): [string, string][] => {
	const declarations: [string, string][] = [];
	for (const rawDeclaration of body.split(';')) {
		const declaration = rawDeclaration.trim();
		if (!declaration) {
			continue;
		}
		const separatorIndex = declaration.indexOf(':');
		if (separatorIndex === -1) {
			continue;
		}
		const property = declaration.slice(0, separatorIndex).trim();
		const value = declaration.slice(separatorIndex + 1).trim();
		declarations.push([property, value]);
	}
	return declarations;
};

/**
 * Resolves the effective (last-declaration-wins) set of CSS declarations
 * for every top-level rule that exactly matches `selector` in `source`.
 * Throws if the selector has no matching rule at all, mirroring the
 * fail-loudly behaviour of the tests this replaces.
 */
export const resolveEffectiveDeclarations = (
	source: string,
	selector: string,
): Map<string, string> => {
	const bodies = findExactSelectorRuleBodies(source, selector);
	if (bodies.length === 0) {
		throw new Error(`No rule found for selector ${selector}`);
	}

	const declarations = new Map<string, string>();
	for (const body of bodies) {
		for (const [property, value] of parseDeclarations(body)) {
			// Later blocks/declarations overwrite earlier ones for the same
			// property — this IS the cascade behaviour for repeated rules at
			// equal specificity (see the module doc comment for the limits).
			declarations.set(property, value);
		}
	}

	return declarations;
};

/** How many distinct top-level rule blocks exactly match `selector` — handy
 * for a test asserting that a reviewer-style duplicate rule is itself
 * detected, rather than only checking the resolved value. */
export const countExactSelectorRules = (
	source: string,
	selector: string,
): number => findExactSelectorRuleBodies(source, selector).length;
