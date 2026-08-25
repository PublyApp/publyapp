/**
 * #992/#975 review follow-up.
 *
 * Round 2 (findings A and B): two source-reading regression tests each
 * resolved a CSS selector with a non-global regex and accepted the FIRST
 * matching rule block in app.css. In real CSS, a later rule at the same
 * specificity wins per declaration — so a later duplicate rule for the same
 * selector silently overrides an earlier one, and neither test could see it.
 * Both reviewer mutations that exploited this appended exactly that: a
 * second, later block for the same exact selector that changes only some of
 * the original's declarations. Fixed by collecting every top-level rule
 * whose selector is an EXACT match and resolving last-declaration-wins per
 * property (`findExactSelectorRuleBodies` / `countExactSelectorRules`,
 * unchanged below).
 *
 * Round 3 (BLOCKER/IMPORTANT "the #975 cascade resolver's blind spots are
 * reachable"): that fix was still a narrow model with three honestly
 * documented but trivially reachable holes. The reviewer defeated it three
 * ways against the shared `SEARCH_CANCEL_SELECTOR` rule — the one check with
 * NO real-browser backstop, because a prior investigation confirmed headless
 * AND headed Chromium/Linux (Xvfb) give byte-identical screenshots and
 * identical ARIA snapshots whether `::-webkit-search-cancel-button`
 * suppression is present or absent:
 *  - a higher-specificity selector appending another class to the target
 *    was invisible (no specificity model at all);
 *  - an `!important` declaration placed before a later plain one lost to the
 *    plain one (source order, not importance, decided the winner);
 *  - wrapping the sole rule in a non-matching `@media` query was still
 *    resolved as if it always applied (no conditional-at-rule awareness).
 *
 * This module now resolves all three, within a deliberately bounded scope
 * (still not a general CSS engine):
 *  - SPECIFICITY: computed per matching selector as
 *    `id-count * 100 + (class + attribute + pseudo-class) * 10 +
 *    (type + pseudo-element) * 1`, counted ONLY over the simple-selector
 *    tokens in the LAST compound run of that individual selector (the run
 *    that must match the actual target element) — i.e. a selector list entry
 *    is treated as competing for the target the moment its final compound
 *    run's tokens are a superset of the target selector's own tokens. This
 *    correctly ranks `.foo.publy-profile-detail-tile-pin` above
 *    `.publy-profile-detail-tile-pin` alone (the exact reviewer attack), and
 *    correctly leaves an unrelated selector that merely mentions the target
 *    class inside a longer, non-superset compound unmatched. It does NOT
 *    add the specificity contributed by earlier compounds in a
 *    descendant/child/sibling selector (e.g. `body .foo` is scored the same
 *    as `.foo`, not one rank higher) — a real but narrower and much less
 *    likely attack shape than a plain compound append. The search-cancel
 *    invariant does not rely on this model; its source-wide and compiled-CSS
 *    policy lives in scripts/search-cancel-css-policy.mjs.
 *  - `!important`: parsed per declaration; if ANY `!important` declaration
 *    exists for a property, only `!important` declarations compete for it
 *    (by specificity, then source order); otherwise only plain declarations
 *    do. This is the real, spec-defined two-pass cascade rule for importance
 *    (ignoring cascade layers/origins, which this file's rules do not use in
 *    a way that would change these outcomes).
 *  - CONDITIONAL AT-RULES: a rule nested inside ANY `@media`, `@supports`, or
 *    `@container` is excluded from resolution entirely — this source-level
 *    resolver has no notion of a real viewport/feature set to evaluate the
 *    condition against, so it cannot safely assume a conditional rule
 *    applies. If the ONLY rule(s) for a selector are conditional, resolution
 *    now fails loudly (same error as "no rule found") instead of silently
 *    treating the conditional rule as unconditional — which is exactly what
 *    turns the reviewer's "wrap the sole rule in a non-matching `@media`"
 *    mutation into a hard failure. `@layer` is NOT treated as conditional
 *    (it groups cascade priority, it does not gate applicability at all —
 *    both target rules in this file legitimately live inside
 *    `@layer components`), so ordinary `@layer`-nested rules resolve
 *    normally.
 *
 * Wherever any of the remaining limits could matter for a specific check,
 * prefer a real-browser (Playwright + `getComputedStyle`) assertion instead
 * — see `e2e/profile-icon-picker-pin-contrast.spec.ts`, which asserts the
 * real computed cascade against the LIVE component for the pin (closing its
 * specificity blind spot completely, since the live element's real class
 * list is what a real stylesheet author would actually have to out-specify).
 * The search-cancel-button selector has no such backstop — see
 * search-input.test.tsx.
 */

const escapeRegExpLiteral = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Finds every top-level `{ ... }` block whose selector is an EXACT match
 * for `selector` (allowing it to appear anywhere in a comma-separated
 * selector list), in source order. Rejects a selector that merely starts
 * with `selector` (e.g. a `-impostor`-style suffix) by requiring a
 * non-identifier boundary immediately after the matched text. Deliberately
 * unchanged from round 2: this exact-match-only helper backs the "is this
 * selector duplicated" sanity checks, which want no specificity/compound
 * matching at all. */
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

/** How many distinct top-level rule blocks exactly match `selector` — handy
 * for a test asserting that a reviewer-style duplicate rule is itself
 * detected, rather than only checking the resolved value. */
export const countExactSelectorRules = (
	source: string,
	selector: string,
): number => findExactSelectorRuleBodies(source, selector).length;

type ParsedDeclaration = {
	property: string;
	value: string;
	important: boolean;
};

/** Parses a rule body's `property: value[ !important];` declarations, in
 * order. */
const parseDeclarations = (body: string): ParsedDeclaration[] => {
	const declarations: ParsedDeclaration[] = [];
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
		let value = declaration.slice(separatorIndex + 1).trim();

		const importantMatch = /^(.*?)\s*!\s*important$/i.exec(value);
		const important = importantMatch !== null;
		if (importantMatch) {
			value = importantMatch[1].trim();
		}

		declarations.push({ property, value, important });
	}
	return declarations;
};

type ParsedRule = {
	selectorList: string;
	body: string;
	sourceIndex: number;
	/** Lower-cased names of every at-rule this rule is nested inside, from
	 * outermost to innermost (e.g. `['layer']`, `['media']`, `[]` for a
	 * top-level rule). */
	enclosingAtRules: string[];
};

const CONDITIONAL_AT_RULES = new Set(['media', 'supports', 'container']);

/**
 * Single-pass parse of every plain (non-`@`) rule in `source`, tracking
 * at-rule nesting (so callers can tell a rule genuinely nested in
 * `@layer components` apart from one gated behind `@media`/`@supports`/
 * `@container`). Handles comments and quoted strings so braces inside them
 * don't desynchronize the scan. Does not need to handle native CSS nesting
 * (a rule directly inside another plain rule) — this file doesn't use it.
 */
const parseStylesheetRules = (source: string): ParsedRule[] => {
	const rules: ParsedRule[] = [];
	const atRuleStack: string[] = [];
	const length = source.length;
	let index = 0;
	let segmentStart = 0;

	while (index < length) {
		const char = source[index];

		if (char === '/' && source[index + 1] === '*') {
			const end = source.indexOf('*/', index + 2);
			index = end === -1 ? length : end + 2;
			continue;
		}

		if (char === '"' || char === "'") {
			const quote = char;
			let cursor = index + 1;
			while (cursor < length && source[cursor] !== quote) {
				cursor += source[cursor] === '\\' ? 2 : 1;
			}
			index = cursor + 1;
			continue;
		}

		if (char === '{') {
			const header = source.slice(segmentStart, index).trim();

			if (header.startsWith('@')) {
				const atNameMatch = /^@([\w-]+)/.exec(header);
				atRuleStack.push(atNameMatch ? atNameMatch[1].toLowerCase() : '');
				index += 1;
				segmentStart = index;
				continue;
			}

			if (header.length > 0) {
				let depth = 1;
				let cursor = index + 1;
				while (cursor < length && depth > 0) {
					if (source[cursor] === '{') {
						depth += 1;
					} else if (source[cursor] === '}') {
						depth -= 1;
						if (depth === 0) {
							break;
						}
					}
					cursor += 1;
				}

				rules.push({
					selectorList: header,
					body: source.slice(index + 1, cursor),
					sourceIndex: index,
					enclosingAtRules: [...atRuleStack],
				});

				index = cursor + 1;
				segmentStart = index;
				continue;
			}

			// Empty header before `{` (malformed/edge case) — just step past it.
			index += 1;
			segmentStart = index;
			continue;
		}

		if (char === '}') {
			atRuleStack.pop();
			index += 1;
			segmentStart = index;
			continue;
		}

		index += 1;
	}

	return rules;
};

type SimpleSelectorToken = {
	kind:
		| 'id'
		| 'class'
		| 'attribute'
		| 'pseudo-class'
		| 'pseudo-element'
		| 'type';
	text: string;
};

const SPECIFICITY_WEIGHTS = {
	id: 100,
	class: 10,
	attribute: 10,
	'pseudo-class': 10,
	'pseudo-element': 1,
	type: 1,
} satisfies Record<SimpleSelectorToken['kind'], number>;

/** Tokenizes ONE compound selector run (no combinators/whitespace) into its
 * simple selectors — classes, an id, attribute selectors, pseudo-classes,
 * pseudo-elements, and type selectors. Unrecognized characters are skipped
 * defensively rather than throwing, since this only needs to support the
 * selector shapes this repo's app.css actually uses. */
const tokenizeCompoundSelector = (compound: string): SimpleSelectorToken[] => {
	const tokens: SimpleSelectorToken[] = [];
	let index = 0;
	const length = compound.length;

	while (index < length) {
		const rest = compound.slice(index);

		const classMatch = /^\.[\w-]+/.exec(rest);
		if (compound[index] === '.' && classMatch) {
			tokens.push({ kind: 'class', text: classMatch[0] });
			index += classMatch[0].length;
			continue;
		}

		const idMatch = /^#[\w-]+/.exec(rest);
		if (compound[index] === '#' && idMatch) {
			tokens.push({ kind: 'id', text: idMatch[0] });
			index += idMatch[0].length;
			continue;
		}

		if (compound[index] === '[') {
			const end = compound.indexOf(']', index);
			if (end === -1) {
				break;
			}
			tokens.push({ kind: 'attribute', text: compound.slice(index, end + 1) });
			index = end + 1;
			continue;
		}

		if (compound[index] === ':') {
			if (compound[index + 1] === ':') {
				const pseudoElementMatch = /^::[\w-]+/.exec(rest);
				if (pseudoElementMatch) {
					tokens.push({
						kind: 'pseudo-element',
						text: pseudoElementMatch[0],
					});
					index += pseudoElementMatch[0].length;
					continue;
				}
			}
			const pseudoClassMatch = /^:[\w-]+(\([^)]*\))?/.exec(rest);
			if (pseudoClassMatch) {
				tokens.push({ kind: 'pseudo-class', text: pseudoClassMatch[0] });
				index += pseudoClassMatch[0].length;
				continue;
			}
		}

		const typeMatch = /^[A-Za-z*][\w-]*/.exec(rest);
		if (typeMatch) {
			tokens.push({ kind: 'type', text: typeMatch[0] });
			index += typeMatch[0].length;
			continue;
		}

		// Unrecognized character (stray combinator remnant, etc.) — skip it.
		index += 1;
	}

	return tokens;
};

const specificityOf = (tokens: SimpleSelectorToken[]): number => {
	let total = 0;
	for (const token of tokens) {
		total += SPECIFICITY_WEIGHTS[token.kind];
	}
	return total;
};

/** Splits a selector list (or a single selector's combinator chain) on a
 * top-level separator character, ignoring separators nested inside `(...)`
 * or `[...]` (e.g. a comma inside `:not(.a, .b)`, or a space inside
 * `[data-x='a b']`). */
const splitTopLevel = (text: string, separator: RegExp): string[] => {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (char === '(' || char === '[') {
			depth += 1;
		} else if (char === ')' || char === ']') {
			depth -= 1;
		} else if (depth === 0 && separator.test(char)) {
			parts.push(text.slice(start, index));
			start = index + 1;
		}
	}
	parts.push(text.slice(start));

	const trimmedParts = parts.map((part) => part.trim());
	return trimmedParts.filter((part) => part.length > 0);
};

/** The final compound selector run of an individual (comma-free) selector —
 * the run whose tokens must match the actual target element, ignoring any
 * ancestor compounds joined by a combinator. */
const lastCompoundRun = (selector: string): string => {
	const withSpacedCombinators = selector.replace(/[>+~]/g, ' ');
	const runs = splitTopLevel(withSpacedCombinators, /\s/);
	return runs[runs.length - 1] ?? '';
};

const tokenTextSet = (tokens: SimpleSelectorToken[]): Set<string> =>
	new Set(tokens.map((token) => token.text));

/** True if every token in `target` also appears in `candidate` (candidate
 * may carry additional tokens — that's exactly the higher-specificity
 * "append another class" shape this exists to catch). */
const isSupersetOf = (
	candidate: SimpleSelectorToken[],
	target: SimpleSelectorToken[],
): boolean => {
	const candidateTexts = tokenTextSet(candidate);
	return target.every((token) => candidateTexts.has(token.text));
};

type MatchedDeclaration = ParsedDeclaration & {
	specificity: number;
	sourceIndex: number;
};

/** Every declaration, across every rule in `source` that targets `selector`
 * (exact match OR a higher-specificity compound built on top of it), that
 * is NOT nested inside a conditional at-rule (`@media`/`@supports`/
 * `@container`; `@layer` nesting is fine). */
const findMatchedDeclarations = (
	source: string,
	selector: string,
): MatchedDeclaration[] => {
	const targetTokens = tokenizeCompoundSelector(selector);
	const matches: MatchedDeclaration[] = [];

	for (const rule of parseStylesheetRules(source)) {
		if (
			rule.enclosingAtRules.some((atRule) => CONDITIONAL_AT_RULES.has(atRule))
		) {
			continue;
		}

		let bestSpecificity: number | null = null;
		for (const individualSelector of splitTopLevel(rule.selectorList, /,/)) {
			const candidateTokens = tokenizeCompoundSelector(
				lastCompoundRun(individualSelector),
			);
			if (!isSupersetOf(candidateTokens, targetTokens)) {
				continue;
			}

			const specificity = specificityOf(candidateTokens);
			if (bestSpecificity === null || specificity > bestSpecificity) {
				bestSpecificity = specificity;
			}
		}

		if (bestSpecificity === null) {
			continue;
		}

		for (const declaration of parseDeclarations(rule.body)) {
			matches.push({
				...declaration,
				specificity: bestSpecificity,
				sourceIndex: rule.sourceIndex,
			});
		}
	}

	return matches;
};

/**
 * Resolves the EFFECTIVE set of CSS declarations that apply to `selector` in
 * `source` — the real cascade winner per property, honouring specificity
 * (including a higher-specificity compound selector built on top of the
 * target class), `!important`, and unconditional-vs-conditional at-rule
 * nesting (see the module doc comment for the exact, bounded scope). Throws
 * if no unconditional rule matches at all, mirroring the fail-loudly
 * behaviour of the tests this replaces — including when every matching rule
 * for `selector` is nested inside a non-matching `@media`/`@supports`/
 * `@container` and therefore excluded.
 */
export const resolveEffectiveDeclarations = (
	source: string,
	selector: string,
): Map<string, string> => {
	const matches = findMatchedDeclarations(source, selector);
	if (matches.length === 0) {
		throw new Error(`No rule found for selector ${selector}`);
	}

	const byProperty = new Map<string, MatchedDeclaration[]>();
	for (const declaration of matches) {
		const existing = byProperty.get(declaration.property) ?? [];
		existing.push(declaration);
		byProperty.set(declaration.property, existing);
	}

	const declarations = new Map<string, string>();
	for (const [property, candidates] of byProperty) {
		const importantCandidates = candidates.filter((c) => c.important);
		// Per the CSS cascade: if ANY `!important` declaration exists for this
		// property, only `!important` declarations compete for it; a plain
		// declaration — no matter how it's specified or how late it appears —
		// cannot beat one.
		const contenders =
			importantCandidates.length > 0 ? importantCandidates : candidates;

		let winner = contenders[0];
		for (const candidate of contenders.slice(1)) {
			const winsOnSpecificity = candidate.specificity > winner.specificity;
			const tiesOnSpecificity = candidate.specificity === winner.specificity;
			if (
				winsOnSpecificity ||
				(tiesOnSpecificity && candidate.sourceIndex > winner.sourceIndex)
			) {
				winner = candidate;
			}
		}

		declarations.set(property, winner.value);
	}

	return declarations;
};
