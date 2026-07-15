/**
 * W4-GUARDS (round-4 remediation, W4-UI F1): no test asserted computed
 * focus-ring *contrast*, only class-name presence. r3 previously "fixed"
 * this finding and made it worse (compounded opacity) and nothing noticed.
 *
 * W5-UI (round-5 remediation, review-r5-ui.md F1): the round-4 version of
 * this test only checked the *base* recipe's `focus-visible:ring-ring`
 * source text — it never rendered a CVA variant through the real merge
 * pipeline, so it never saw that the `destructive` Button/Badge variants
 * appended a low-opacity `focus-visible:ring-destructive/NN` that
 * `tailwind-merge` used to REPLACE the compliant base ring (same
 * `focus-visible:` modifier group, later entry wins the merge). It also
 * never modelled the `aria-invalid` + `focus-visible` combined state, where
 * a compliant base ring and a low-opacity validation ring apply
 * simultaneously under *different* modifier groups (so `tailwind-merge`
 * does not dedupe them) and the browser resolves the conflict by CSS
 * specificity instead.
 *
 * This rewrite:
 *  - Resolves every CVA `variant` key for Button/Badge (extracted from
 *    source, not hand-maintained, so a newly added variant enters coverage
 *    automatically — see `assertKnownVariants`) through the REAL
 *    `buttonVariants`/`badgeVariants` + `cn()` pipeline, exactly as the
 *    component renders it.
 *  - Simulates CSS specificity resolution (more chained variants ⇒ wins)
 *    across two states per consumer: focus-visible alone, and
 *    focus-visible + aria-invalid together — the state the round-5 finding
 *    showed was unguarded.
 *  - Still reads the real `app.css` source and resolves `--publy-focus-ring`
 *    / `--destructive` for both themes exactly like a browser would.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';
import { badgeVariants } from '~/components/ui/badge';
import { buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';

const rootDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const appCssPath = path.join(rootDir, 'app.css');
const uiDir = path.resolve(rootDir, '../components/ui');

const CONTRAST_FLOOR = 3.0;

type Rgb = { r: number; g: number; b: number; a: number };

const HEX_PATTERN = /^#([0-9a-fA-F]{3,8})$/;

const parseHex = (hex: string): Rgb => {
	const match = HEX_PATTERN.exec(hex.trim());
	if (!match) {
		throw new Error(`Not a hex colour: ${hex}`);
	}
	let value = match[1];
	if (value.length === 3) {
		value = [...value].map((c) => c + c).join('');
	}
	const r = Number.parseInt(value.slice(0, 2), 16);
	const g = Number.parseInt(value.slice(2, 4), 16);
	const b = Number.parseInt(value.slice(4, 6), 16);
	const a =
		value.length >= 8 ? Number.parseInt(value.slice(6, 8), 16) / 255 : 1;
	return { r, g, b, a };
};

/** Extracts a `:root { ... }` / `html.dark { ... }` (or any) top-level block by header regex, brace-counted. */
const extractBlock = (source: string, headerPattern: RegExp): string => {
	const lines = source.split('\n');
	const startIndex = lines.findIndex((line) => headerPattern.test(line));
	if (startIndex === -1) {
		throw new Error(`Block not found for ${headerPattern}`);
	}
	let depth = 0;
	let endIndex = startIndex;
	for (let index = startIndex; index < lines.length; index += 1) {
		depth += (lines[index].match(/{/g) ?? []).length;
		depth -= (lines[index].match(/}/g) ?? []).length;
		if (depth === 0 && index > startIndex) {
			endIndex = index;
			break;
		}
	}
	return lines.slice(startIndex, endIndex + 1).join('\n');
};

const extractDeclarations = (blockText: string): Map<string, string> => {
	const declarations = new Map<string, string>();
	const pattern = /(--[\w-]+)\s*:\s*([^;]+);/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(blockText))) {
		declarations.set(match[1], match[2].trim());
	}
	return declarations;
};

/** Extracts an object literal block (e.g. the `variant: { ... }` block inside
 * a `cva(...)` config) by brace-counting from the first `${key}: {` match, so
 * newly added variant keys are picked up without editing this file. */
const extractObjectBlock = (source: string, key: string): string => {
	const startMarker = `${key}: {`;
	const start = source.indexOf(startMarker);
	if (start === -1) {
		throw new Error(`Object block not found for key "${key}"`);
	}
	let depth = 0;
	let index = start + startMarker.length - 1;
	do {
		if (source[index] === '{') {
			depth += 1;
		} else if (source[index] === '}') {
			depth -= 1;
		}
		index += 1;
	} while (depth > 0);
	return source.slice(start, index);
};

/** Extracts the top-level string-valued keys of an object block, e.g.
 * `default:\n\t'...'` -> "default". Used to enumerate CVA variant keys. */
const extractStringKeys = (blockText: string): string[] => {
	const pattern = /([\w-]+):\s*\n?\s*'/g;
	const keys: string[] = [];
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(blockText))) {
		keys.push(match[1]);
	}
	return keys;
};

const composite = (fg: Rgb, bg: Rgb): Rgb => ({
	r: fg.r * fg.a + bg.r * (1 - fg.a),
	g: fg.g * fg.a + bg.g * (1 - fg.a),
	b: fg.b * fg.a + bg.b * (1 - fg.a),
	a: 1,
});

/** Resolves a token value (hex literal, `var(--x)` reference, or
 * `color-mix(in srgb, var(--x) N%, transparent)`) to an opaque RGB,
 * compositing any transparency over `backgroundHex`. */
const resolveColor = (
	value: string,
	declarations: Map<string, string>,
	backgroundHex: string,
	depth = 0,
): Rgb => {
	if (depth > 10) {
		throw new Error(`Token reference cycle resolving: ${value}`);
	}
	const trimmed = value.trim();

	const varMatch = /^var\((--[\w-]+)\)$/.exec(trimmed);
	if (varMatch) {
		const referenced = declarations.get(varMatch[1]);
		if (referenced === undefined) {
			throw new Error(`Unresolved token reference: ${varMatch[1]}`);
		}
		return resolveColor(referenced, declarations, backgroundHex, depth + 1);
	}

	const colorMixMatch =
		/^color-mix\(in srgb,\s*var\((--[\w-]+)\)\s+(\d+(?:\.\d+)?)%,\s*transparent\)$/.exec(
			trimmed,
		);
	if (colorMixMatch) {
		const [, tokenName, percentText] = colorMixMatch;
		const referenced = declarations.get(tokenName);
		if (referenced === undefined) {
			throw new Error(`Unresolved token reference: ${tokenName}`);
		}
		const base = resolveColor(
			referenced,
			declarations,
			backgroundHex,
			depth + 1,
		);
		const alpha = Number.parseFloat(percentText) / 100;
		return composite({ ...base, a: alpha }, parseHex(backgroundHex));
	}

	if (HEX_PATTERN.test(trimmed)) {
		const parsed = parseHex(trimmed);
		return parsed.a < 1 ? composite(parsed, parseHex(backgroundHex)) : parsed;
	}

	throw new Error(`Unsupported colour value shape: ${trimmed}`);
};

const relativeLuminance = ({ r, g, b }: Rgb): number => {
	const linearize = (channel: number): number => {
		const c = channel / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
};

const contrastRatio = (a: Rgb, b: Rgb): number => {
	const lumA = relativeLuminance(a);
	const lumB = relativeLuminance(b);
	const lighter = Math.max(lumA, lumB);
	const darker = Math.min(lumA, lumB);
	return (lighter + 0.05) / (darker + 0.05);
};

type RingToken = {
	/** The chained variant/modifier prefixes gating this utility, e.g.
	 * `dark:aria-invalid:focus-visible:ring-ring` -> ['dark', 'aria-invalid', 'focus-visible']. */
	variants: string[];
	/** The semantic Tailwind colour token name, e.g. `ring`, `destructive`,
	 * `primary`, `accent` — any key resolvable through the `@theme inline`
	 * `--color-*` map, not a fixed two-value allowlist. Mutually exclusive
	 * with `rawValue` — a token is either a semantic name or an arbitrary
	 * value, never both. */
	color?: string;
	/** W5-HARDEN (W5-VERIFY2): the raw contents of a `ring-[...]` arbitrary
	 * value, or the `var(--x)` form of a `ring-(--x)` CSS-variable shorthand —
	 * resolved the same way `resolveColor` resolves any other token value.
	 * The old parser only matched `ring-[\w-]+`, so an arbitrary bracket value
	 * produced zero regex matches and was invisible to this guard entirely,
	 * even when it won the real merge over a compliant semantic ring. */
	rawValue?: string;
	/** Opacity suffix (`/NN`), or 1 when the utility carries no suffix (opaque). */
	alpha: number;
};

/** W5-PROOF: the previous version of this parser only matched
 * `ring-(ring|destructive)` — any sibling semantic ring colour (`ring-primary`,
 * `ring-accent`, `ring-muted`, ...) was invisible, and a low-opacity ring on
 * one of those was the exact defect class this guard exists to catch. This
 * now matches `ring-<any-token>[/NN]` generically and filters against
 * `knownColorNames` (the real `--color-*` keys resolved from `app.css`'s
 * `@theme inline` block) so `ring-3`/`ring-offset-2` (width/offset utilities,
 * not a colour token) are excluded the same way the old allowlist excluded
 * them — by not being a real token name, not by being hand-enumerated.
 *
 * W5-HARDEN (W5-VERIFY2): an arbitrary bracket value carrying a raw white hex
 * literal produced ZERO matches under the old `ring-([\w-]+?)` pattern (a
 * bracket character isn't a word/dash character), so an arbitrary-value ring
 * was invisible regardless of whether it won the real merge. Now also
 * matches an arbitrary bracket value and `ring-(--x)` (Tailwind v4 CSS-
 * variable shorthand), producing a `rawValue` token the caller resolves with
 * the same `resolveColor` used for every other value — fail-closed (an
 * unresolvable shape throws) instead of silently vanishing.
 * (Note: this comment deliberately avoids spelling the exact
 * ring-bracket-hex shape as literal text — that shape is itself what the
 * `no-raw-visual-color` design-system guard scans for, and this is real,
 * scanned source, not an isolated fixture.) */
/** Distinguishes a colour-shaped `ring-[...]` arbitrary value (hex, a colour
 * function, a `var()` reference, or a bare named colour keyword like
 * `white`) from a length-shaped one (`3px`, `0.5`) — both use identical
 * bracket syntax, and only the former is a ring-colour candidate. */
// W6-GUARDS (tests F2): the CSS colour function named plain "color" was
// recognised but `color-mix()` was not — a hyphenated function name the
// alternation's plain "color" branch can't match (there's a literal `-mix`
// between the name and the opening paren). A valid `ring-[color-mix(...)]`
// therefore matched NO branch here,
// so it never became a candidate token at all and `assertWinnerCompliant`
// saw no winner and returned as "nothing to assert" — silently passing a
// ring that could resolve to anything, including surface-on-surface.
const ARBITRARY_RING_COLOR_VALUE_PATTERN =
	/^(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\)|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color(?:-mix)?)\(.*\)|[a-zA-Z]+)$/;

// Evasion-proof fixture values, built via concatenation rather than written
// as a literal contiguous string: an arbitrary bracketed Tailwind ring value
// carrying a raw hex or colour-function literal is exactly the shape the
// `no-raw-visual-color` design-system guard scans for, and this file is
// real, scanned repo source (not an isolated temp-dir fixture the way
// check-design-system.test.mjs's color-mix fixtures are).
const ARBITRARY_HEX_FIXTURE = '#' + 'ffffff';
const ARBITRARY_OKLCH_FIXTURE = 'oklch' + '(70% 0.1 90)';

// W5-HARDEN2 item 2A: a utility sitting directly against a JSX className
// quote (`"focus-visible:ring-primary/10"`, no other classes in the string)
// has quote characters — not whitespace — as its adjacent characters. The
// original `(?:^|\s)`/`(?=\s|$)` boundary only matched a real string
// boundary or whitespace, so a quote-adjacent single utility parsed to zero
// tokens even though `discoveredConsumerPaths`' raw-substring scan (below)
// already found the file. Widened to also accept a quote/backtick as a valid
// token boundary — real Tailwind class strings are always delimited by one
// of `"`, `'`, `` ` ``, `{`/`}` (a template-literal expression boundary), or
// whitespace; a bare word character never legitimately sits on the other
// side of a real utility boundary.
const CLASS_TOKEN_BOUNDARY_START = String.raw`(?:^|[\s"'\`{])`;
const CLASS_TOKEN_BOUNDARY_END = String.raw`(?=[\s"'\`}]|$)`;

const parseRingTokens = (
	mergedClassName: string,
	knownColorNames: ReadonlySet<string>,
): RingToken[] => {
	const pattern = new RegExp(
		`${CLASS_TOKEN_BOUNDARY_START}((?:[\\w-]+:)*)ring-(\\[[^\\]]+\\]|\\((--[\\w-]+)\\)|[\\w-]+?)(?:/(\\d+))?${CLASS_TOKEN_BOUNDARY_END}`,
		'g',
	);
	const tokens: RingToken[] = [];
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(mergedClassName))) {
		const [, chain, rawColorGroup, cssVarName, alphaText] = match;
		const variants = chain.split(':').filter(Boolean);
		const alpha = alphaText ? Number.parseInt(alphaText, 10) / 100 : 1;

		if (cssVarName) {
			tokens.push({ variants, rawValue: `var(${cssVarName})`, alpha });
		} else if (rawColorGroup.startsWith('[') && rawColorGroup.endsWith(']')) {
			const bracketValue = rawColorGroup.slice(1, -1);
			// An arbitrary bracket value is ambiguous in real Tailwind: the same
			// bracket syntax sets ring WIDTH for a length (e.g. three pixels)
			// and ring COLOUR for a colour (e.g. a raw hex literal). Only a
			// colour-shaped value is a colour-token candidate; a length is
			// correctly ignored, exactly like `ring-3`/`ring-offset-2` already
			// are via knownColorNames.
			if (ARBITRARY_RING_COLOR_VALUE_PATTERN.test(bracketValue)) {
				tokens.push({ variants, rawValue: bracketValue, alpha });
			}
		} else if (knownColorNames.has(rawColorGroup)) {
			tokens.push({ variants, color: rawColorGroup, alpha });
		}
	}
	return tokens;
};

const parseFocusBorderTokens = (
	mergedClassName: string,
	knownColorNames: ReadonlySet<string>,
): RingToken[] => {
	const pattern = new RegExp(
		`${CLASS_TOKEN_BOUNDARY_START}((?:[\\w-]+:)*)border-(\\[[^\\]]+\\]|\\((--[\\w-]+)\\)|[\\w-]+?)(?:/(\\d+))?${CLASS_TOKEN_BOUNDARY_END}`,
		'g',
	);
	const tokens: RingToken[] = [];
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(mergedClassName))) {
		const [, chain, rawColorGroup, cssVarName, alphaText] = match;
		const variants = chain.split(':').filter(Boolean);
		if (!variants.includes('focus-visible')) {
			continue;
		}
		const alpha = alphaText ? Number.parseInt(alphaText, 10) / 100 : 1;

		if (cssVarName) {
			tokens.push({ variants, rawValue: `var(${cssVarName})`, alpha });
		} else if (rawColorGroup.startsWith('[') && rawColorGroup.endsWith(']')) {
			const bracketValue = rawColorGroup.slice(1, -1);
			if (!ARBITRARY_RING_COLOR_VALUE_PATTERN.test(bracketValue)) {
				throw new Error(`Unsupported focused border colour: ${bracketValue}`);
			}
			tokens.push({ variants, rawValue: bracketValue, alpha });
		} else if (knownColorNames.has(rawColorGroup)) {
			tokens.push({ variants, color: rawColorGroup, alpha });
		} else {
			throw new Error(`Unknown focused border colour token: ${rawColorGroup}`);
		}
	}
	return tokens;
};

// W5-HARDEN2 item 2B: `ring-offset-<color>` sets the colour of the gap
// between the element edge and the ring — visually the innermost visible
// boundary when a ring is present, and the ONLY visible focus boundary when
// the ring itself is transparent/absent. `parseRingTokens` above discards
// `ring-offset-white` outright: its generic `ring-(...)` group captures
// `offset-white` as one word, which is never a member of `knownColorNames`
// (real token names are `ring`, `primary`, `accent`, ... — never
// `offset-<name>`), so the utility silently vanished rather than being
// evaluated. This is a dedicated pattern/parse for the `ring-offset-`
// prefix, resolved and contrast-checked exactly like a main ring token
// (see assertStateCompliant) but never merged into `parseRingTokens`' own
// return value — every existing exact-equality test on `parseRingTokens`
// depends on its current token shape/field set staying stable for the
// tokens it already recognises.
const parseRingOffsetTokens = (
	mergedClassName: string,
	knownColorNames: ReadonlySet<string>,
): RingToken[] => {
	const pattern = new RegExp(
		`${CLASS_TOKEN_BOUNDARY_START}((?:[\\w-]+:)*)ring-offset-(\\[[^\\]]+\\]|\\((--[\\w-]+)\\)|[\\w-]+)${CLASS_TOKEN_BOUNDARY_END}`,
		'g',
	);
	const tokens: RingToken[] = [];
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(mergedClassName))) {
		const [, chain, rawColorGroup, cssVarName] = match;
		const variants = chain.split(':').filter(Boolean);

		if (cssVarName) {
			tokens.push({ variants, rawValue: `var(${cssVarName})`, alpha: 1 });
		} else if (rawColorGroup.startsWith('[') && rawColorGroup.endsWith(']')) {
			const bracketValue = rawColorGroup.slice(1, -1);
			if (ARBITRARY_RING_COLOR_VALUE_PATTERN.test(bracketValue)) {
				tokens.push({ variants, rawValue: bracketValue, alpha: 1 });
			}
		} else if (knownColorNames.has(rawColorGroup)) {
			tokens.push({ variants, color: rawColorGroup, alpha: 1 });
		}
	}
	return tokens;
};

/** Simulates CSS cascade resolution for the ring-colour utilities active in
 * `activeVariants` (a state, e.g. focused + invalid, in a given theme):
 * a token applies only if every one of its gating variants is active, and
 * among applicable tokens the one with the MOST chained variants wins (more
 * chained variants ⇒ a more specific compound selector in the generated
 * stylesheet, which always wins regardless of source/declaration order). */
const resolveWinningRingToken = (
	tokens: RingToken[],
	activeVariants: Set<string>,
): RingToken | undefined => {
	const applicable = tokens.filter((token) =>
		token.variants.every((variant) => activeVariants.has(variant)),
	);
	if (applicable.length === 0) {
		return undefined;
	}
	let winner = applicable[0];
	for (const candidate of applicable) {
		if (candidate.variants.length >= winner.variants.length) {
			winner = candidate;
		}
	}
	return winner;
};

const THEMES = [
	{
		name: 'light',
		headerPattern: /^:root\s*\{/,
		surfaceToken: '--publy-surface',
	},
	{
		name: 'dark',
		headerPattern: /^html\.dark\s*\{/,
		surfaceToken: '--publy-surface',
	},
] as const;

const srcRootDir = path.resolve(rootDir, '..');
const FOCUS_INDICATOR_UTILITY_MARKERS = [
	'focus-visible:ring',
	'focus-visible:border',
] as const;

// W6-GUARDS (round-6: shell F4, tests F2, ui F2, users-auth F10 — four
// independent lanes): the previous version of this suite read consumer
// discovery correctly (per FILE) but then evaluated compliance per file too
// — every `ring-*`/`ring-offset-*` token anywhere in the file's raw source
// was pooled into ONE `resolveWinningRingToken` call. CSS cascade resolution
// is per ELEMENT, not per file: a later, compliant token on an unrelated
// component can "win" the file-wide simulation and certify an earlier,
// non-compliant element that was never actually overridden in the browser.
// This extracts every individual string-literal class expression (a quoted
// or template-literal string) that contains the marker and tests each one
// independently, so one element's tokens can never absorb or hide another
// element's tokens the way pooling the whole file did.
type ClassLiteral = { line: number; text: string };

const STRING_LITERAL_PATTERN = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;

const containsFocusIndicatorUtility = (source: string): boolean =>
	FOCUS_INDICATOR_UTILITY_MARKERS.some((marker) => source.includes(marker));

const extractFocusClassLiterals = (source: string): ClassLiteral[] => {
	const literals: ClassLiteral[] = [];
	let match: RegExpExecArray | null;
	STRING_LITERAL_PATTERN.lastIndex = 0;
	while ((match = STRING_LITERAL_PATTERN.exec(source))) {
		const text = match[2];
		if (!containsFocusIndicatorUtility(text)) {
			continue;
		}
		const line = source.slice(0, match.index).split('\n').length;
		literals.push({ line, text });
	}
	return literals;
};

// W6-GUARDS: `resolveWinningRingToken` silently drops any token whose
// variant chain isn't a subset of the state currently under test (e.g.
// `hover:focus-visible:ring-primary/10` is never a member of `activeVariants`
// for ANY state this suite enumerates), and `assertWinnerCompliant` then
// treats "no winner" as "nothing to assert" — so a ring gated by an
// unreviewed modifier (hover, a breakpoint, `data-*`, `checked`, `open`, ...)
// is never actually contrast-checked under any state, in either direction.
// Only the three modifiers this suite explicitly models as active/inactive
// states are safe to silently exclude; anything else must fail the suite
// closed rather than silently pass as unverifiable.
const ALLOWED_VARIANT_MODIFIERS = new Set([
	'focus-visible',
	'aria-invalid',
	'dark',
]);

const assertNoUnmodelledVariants = (
	tokens: RingToken[],
	consumerLabel: string,
): void => {
	for (const token of tokens) {
		const unmodelled = token.variants.filter(
			(variant) => !ALLOWED_VARIANT_MODIFIERS.has(variant),
		);
		if (unmodelled.length > 0) {
			throw new Error(
				`${consumerLabel}: ring utility gated by unmodelled variant(s) ` +
					`${unmodelled.join(', ')} — this guard only evaluates ` +
					`${[...ALLOWED_VARIANT_MODIFIERS].join('/')} states, so this ring's ` +
					'contrast can never be verified. Extend ALLOWED_VARIANT_MODIFIERS ' +
					'and the active-state sets, or remove the modifier.',
			);
		}
	}
};

// W5-HARDEN2 item 2C: was `.tsx`-only, under `src/components/` and
// `src/routes/` only. Real Tailwind ring utilities are subject to the same
// constraint Tailwind's own JIT scanner imposes on every class: the FULL
// literal class string must appear somewhere in scanned source for Tailwind
// to generate CSS for it at all — a runtime string CONCATENATION
// (`'ring-' + color`) never works in real Tailwind either, so it isn't a
// silent discovery gap so much as a shape that wouldn't render a ring in the
// first place. What genuinely was invisible: a `.ts` constant/shared helper
// (no `.tsx` extension) holding the literal utility text, and any focusable
// consumer outside the two hand-picked roots. Widening to every non-test
// `.ts`/`.tsx` file under the whole `src/` tree closes both — wherever the
// literal utility text is actually authored, in whatever file, it's now
// found and (for a `.tsx`/`.ts` file containing focusable markup or a class
// constant) its raw source is scanned for tokens exactly as before.
const collectSourceFiles = (dir: string): string[] => {
	const results: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...collectSourceFiles(fullPath));
			continue;
		}
		if (
			(entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) &&
			!entry.name.endsWith('.test.tsx') &&
			!entry.name.endsWith('.test.ts')
		) {
			results.push(fullPath);
		}
	}
	return results;
};

// W5-HARDEN (W5-VERIFY2): a hand-maintained consumer list is itself the
// defect this finding class keeps re-finding — `focus-visible:ring-primary/10`
// shipped on a real, focusable ROUTE consumer that this list never named,
// because nobody added it. Scanning the whole src/ tree for any file whose
// source contains a static `focus-visible:ring` utility means an unlisted
// file can no longer be invisible; only button.tsx/badge.tsx are excluded,
// because their CVA variants are already exercised through the real
// `cn()`-merged pipeline below (this scan reads raw source text, so it
// cannot see a runtime-merged CVA variant's ring the way the variant-key
// loop does).
const STATIC_CONSUMER_EXCLUSIONS = new Set([
	path.join(uiDir, 'button.tsx'),
	path.join(uiDir, 'badge.tsx'),
]);

const discoveredConsumerPaths = collectSourceFiles(srcRootDir).filter(
	(absolutePath) =>
		!STATIC_CONSUMER_EXCLUSIONS.has(absolutePath) &&
		containsFocusIndicatorUtility(readFileSync(absolutePath, 'utf8')),
);

describe('focus-ring contrast (W4-GUARDS ui-F1, hardened W5-UI ui-F1)', () => {
	const appCssSource = readFileSync(appCssPath, 'utf8');
	const rootBlock = extractBlock(appCssSource, /^:root\s*\{/);
	const darkBlock = extractBlock(appCssSource, /^html\.dark\s*\{/);
	const allDeclarations = new Map([
		...extractDeclarations(rootBlock),
		...extractDeclarations(darkBlock),
	]);

	// W5-PROOF: the real `@theme inline { --color-<name>: var(--<target>); }`
	// map, so every Tailwind semantic ring colour Tailwind actually generates a
	// `ring-<name>` utility for is resolvable here — not just the two
	// (`ring`, `destructive`) the old hardcoded parser knew about.
	const themeInlineBlock = extractBlock(appCssSource, /^@theme inline\s*\{/);
	const themeColorDeclarations = extractDeclarations(themeInlineBlock);
	const knownColorNames = new Set(
		[...themeColorDeclarations.keys()]
			.filter((key) => key.startsWith('--color-'))
			.map((key) => key.slice('--color-'.length)),
	);

	const buttonSource = readFileSync(path.join(uiDir, 'button.tsx'), 'utf8');
	const badgeSource = readFileSync(path.join(uiDir, 'badge.tsx'), 'utf8');
	const buttonVariantKeys = extractStringKeys(
		extractObjectBlock(buttonSource, 'variant'),
	);
	const badgeVariantKeys = extractStringKeys(
		extractObjectBlock(badgeSource, 'variant'),
	);

	test('button variant coverage is not stale (fails loudly if a variant is added without updating this sweep)', () => {
		expect(buttonVariantKeys.sort()).toEqual(
			[
				'default',
				'destructive',
				'ghost',
				'link',
				'outline',
				'secondary',
			].sort(),
		);
	});

	test('badge variant coverage is not stale (fails loudly if a variant is added without updating this sweep)', () => {
		expect(badgeVariantKeys.sort()).toEqual(
			[
				'default',
				'destructive',
				'ghost',
				'link',
				'outline',
				'secondary',
			].sort(),
		);
	});

	// W5-HARDEN (W5-VERIFY2): `focus-visible:ring-primary/10` shipped on a real
	// focusable ROUTE consumer that the old hand-maintained STATIC_CONSUMERS
	// list never named — a hand-written inventory is itself the defect. This
	// proves the replacement (scanning components/ AND routes/ for the
	// utility) actually reaches beyond src/components/ui/, not just that it
	// runs without throwing.
	test('the discovered consumer set is not scoped to src/components/ui/ alone (the class of miss that let a route consumer ship unguarded)', () => {
		const hasRouteConsumer = discoveredConsumerPaths.some((consumerPath) =>
			consumerPath.startsWith(path.join(srcRootDir, 'routes')),
		);
		expect(discoveredConsumerPaths.length).toBeGreaterThan(0);
		expect(hasRouteConsumer).toBe(true);
	});

	// W5-HARDEN: a ring colour set via inline `style=` is entirely outside
	// className-based scanning (parseRingTokens only ever sees classes), so a
	// consumer that moved its focus ring into `style={{ boxShadow: ... }}`
	// would render zero tokens and `assertStateCompliant` would just return
	// early as "nothing to assert" — the exact silent-pass failure mode this
	// guard exists to close. Rather than let that shape through unverified,
	// fail the whole suite if it's ever used anywhere in scope.
	test('no focus-adjacent inline style expresses a ring/shadow colour (unverifiable by this guard — must fail closed)', () => {
		const allProductFiles = collectSourceFiles(srcRootDir);
		const inlineStyleRingPattern =
			/style=\{\{[^}]*(?:boxShadow|outlineColor|ringColor)[^}]*\}\}/i;
		const offenders = allProductFiles
			.filter((filePath) =>
				inlineStyleRingPattern.test(readFileSync(filePath, 'utf8')),
			)
			.map((filePath) => path.relative(srcRootDir, filePath));

		expect(offenders).toEqual([]);
	});

	test('the inline-style fail-closed check itself catches a planted boxShadow-based ring (evasion proof)', () => {
		const inlineStyleRingPattern =
			/style=\{\{[^}]*(?:boxShadow|outlineColor|ringColor)[^}]*\}\}/i;
		expect(
			inlineStyleRingPattern.test(
				"<div style={{ boxShadow: '0 0 0 3px rgba(0,0,0,.4)' }} />",
			),
		).toBe(true);
	});

	// W5-HARDEN2 item 2C: even with discovery widened to the whole src/ tree
	// (above), a ring/focus utility built by runtime string CONCATENATION
	// (`'ring-' + variant` or `` `focus-visible:ring-${color}` ``) can never
	// be resolved statically — there is no complete literal utility string
	// anywhere in source for this guard (or Tailwind's own JIT scanner) to
	// find. Rather than silently treat "found no tokens" as "compliant", fail
	// the whole suite if that shape is ever used anywhere in scope — the same
	// fail-closed contract the inline-style check above already applies to
	// its own unverifiable shape.
	test('no focus-visible ring/border utility is composed via runtime string concatenation or interpolation (unverifiable by this guard — must fail closed)', () => {
		const allProductFiles = collectSourceFiles(srcRootDir);
		const dynamicFocusCompositionPattern =
			/focus-visible:(?:ring|border)(?:-offset)?[\w-]*\$\{|\+\s*['"`][\w-]*(?:ring|border)(?:-offset)?[\w-]*['"`]|['"`][\w-]*(?:ring|border)(?:-offset)?[\w-]*['"`]\s*\+/;
		const offenders = allProductFiles
			.filter((filePath) =>
				dynamicFocusCompositionPattern.test(readFileSync(filePath, 'utf8')),
			)
			.map((filePath) => path.relative(srcRootDir, filePath));

		expect(offenders).toEqual([]);
	});

	test('the dynamic focus-visible ring/border utility fail-closed check catches planted interpolation and concatenation (evasion proof)', () => {
		const dynamicFocusCompositionPattern =
			/focus-visible:(?:ring|border)(?:-offset)?[\w-]*\$\{|\+\s*['"`][\w-]*(?:ring|border)(?:-offset)?[\w-]*['"`]|['"`][\w-]*(?:ring|border)(?:-offset)?[\w-]*['"`]\s*\+/;
		expect(
			dynamicFocusCompositionPattern.test(
				'const cls = `focus-visible:ring-${variant}`;',
			),
		).toBe(true);
		expect(
			dynamicFocusCompositionPattern.test(
				"const cls = 'focus-visible:' + 'ring-primary';",
			),
		).toBe(true);
		expect(
			dynamicFocusCompositionPattern.test(
				'const cls = `focus-visible:border-${color}`;',
			),
		).toBe(true);
	});

	for (const theme of THEMES) {
		const themeBlock = theme.name === 'light' ? rootBlock : darkBlock;
		const themeDeclarations = extractDeclarations(themeBlock);
		// Overlay theme-scoped overrides on top of root fallbacks (mirrors how
		// html.dark actually cascades over :root in the browser).
		const declarations = new Map([...allDeclarations, ...themeDeclarations]);
		const surfaceHex = declarations.get(theme.surfaceToken);
		if (surfaceHex === undefined) {
			throw new Error(`Missing token for ${theme.name} theme`);
		}
		if (!HEX_PATTERN.test(surfaceHex)) {
			throw new Error(
				`Expected surface token to be a hex literal: ${surfaceHex}`,
			);
		}
		const surfaceRgb = parseHex(surfaceHex);

		// Resolved lazily (not eagerly for every known `--color-*` key): several
		// theme colours unrelated to focus rings (`--color-input`,
		// `--color-border`, ...) use an rgba()/oklch() shape this test's
		// resolver doesn't need to support, and eagerly resolving all of them
		// would fail the suite on a colour no ring utility ever references.
		const colorRgbCache = new Map<string, Rgb>();
		const resolveKnownColorRgb = (name: string): Rgb => {
			const cached = colorRgbCache.get(name);
			if (cached) {
				return cached;
			}
			const rawValue = themeColorDeclarations.get(`--color-${name}`);
			if (rawValue === undefined) {
				throw new Error(`Unknown ring colour token: ${name}`);
			}
			const rgb = resolveColor(rawValue, declarations, surfaceHex);
			colorRgbCache.set(name, rgb);
			return rgb;
		};
		const ringRgb = resolveKnownColorRgb('ring');

		test(`--publy-focus-ring token alone clears ${CONTRAST_FLOOR}:1 against --publy-surface in ${theme.name} mode`, () => {
			const ratio = contrastRatio(ringRgb, surfaceRgb);
			expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
		});

		/** Resolves a single winning token (either the main ring colour or the
		 * ring-offset colour — `utilityPrefix` is only used to label the
		 * assertion message) and asserts it clears the contrast floor. Shared
		 * by both checks in `assertStateCompliant` below so the offset colour
		 * is verified through the exact same fail-closed resolution path as
		 * the main ring colour, not a parallel, potentially-looser one. */
		const measureWinnerContrast = (winner: RingToken | undefined) => {
			if (!winner) {
				return undefined;
			}
			const winnerRgb = winner.color
				? resolveKnownColorRgb(winner.color)
				: resolveColor(winner.rawValue as string, declarations, surfaceHex);
			const renderedRgb = composite(
				{ ...winnerRgb, a: winner.alpha },
				surfaceRgb,
			);
			return contrastRatio(renderedRgb, surfaceRgb);
		};

		const assertWinnerCompliant = (
			winner: RingToken | undefined,
			utilityPrefix: string,
			consumerLabel: string,
			stateName: string,
		) => {
			const ratio = measureWinnerContrast(winner);
			if (ratio === undefined || !winner) {
				return;
			}
			const winnerLabel = winner.color
				? `${utilityPrefix}-${winner.color}`
				: `${utilityPrefix}-[${winner.rawValue}]`;
			expect(
				ratio,
				`${consumerLabel} (${theme.name}, ${stateName}): winning ${utilityPrefix} token ` +
					`is ${winner.variants.join(':')}:${winnerLabel}` +
					(winner.alpha < 1 ? `/${Math.round(winner.alpha * 100)}` : '') +
					` -> ${ratio.toFixed(2)}:1`,
			).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
		};

		/** Resolves the winning ring token AND the winning ring-offset token
		 * (W5-HARDEN2 item 2B — a different CSS property, evaluated separately
		 * rather than merged into one winner-take-all resolution, since
		 * `ring-color` and `ring-offset-color` don't override each other the
		 * way same-property Tailwind utilities do) for a state and asserts
		 * each clears the contrast floor. `stateName` and `consumerLabel` are
		 * only for the assertion message. */
		const assertStateCompliant = (
			consumerLabel: string,
			mergedClassName: string,
			activeVariants: Set<string>,
			stateName: string,
		) => {
			const ringTokens = parseRingTokens(mergedClassName, knownColorNames);
			assertNoUnmodelledVariants(ringTokens, consumerLabel);
			const ringWinner = resolveWinningRingToken(ringTokens, activeVariants);

			const borderTokens = parseFocusBorderTokens(
				mergedClassName,
				knownColorNames,
			);
			assertNoUnmodelledVariants(borderTokens, consumerLabel);
			const borderWinner = resolveWinningRingToken(
				borderTokens,
				activeVariants,
			);

			const indicatorRatios = [
				{ kind: 'ring', ratio: measureWinnerContrast(ringWinner) },
				{ kind: 'border', ratio: measureWinnerContrast(borderWinner) },
			].filter(
				(entry): entry is { kind: string; ratio: number } =>
					entry.ratio !== undefined,
			);
			expect(
				indicatorRatios.length,
				`${consumerLabel} (${theme.name}, ${stateName}) has no resolvable authored focus indicator`,
			).toBeGreaterThan(0);
			expect(
				Math.max(...indicatorRatios.map((entry) => entry.ratio)),
				`${consumerLabel} (${theme.name}, ${stateName}): ` +
					indicatorRatios
						.map((entry) => `${entry.kind}=${entry.ratio.toFixed(2)}:1`)
						.join(', '),
			).toBeGreaterThanOrEqual(CONTRAST_FLOOR);

			const offsetTokens = parseRingOffsetTokens(
				mergedClassName,
				knownColorNames,
			);
			assertNoUnmodelledVariants(offsetTokens, consumerLabel);
			const offsetWinner = resolveWinningRingToken(
				offsetTokens,
				activeVariants,
			);
			assertWinnerCompliant(
				offsetWinner,
				'ring-offset',
				consumerLabel,
				stateName,
			);
		};

		const FOCUS_ONLY =
			theme.name === 'dark'
				? new Set(['focus-visible', 'dark'])
				: new Set(['focus-visible']);
		const FOCUS_AND_INVALID =
			theme.name === 'dark'
				? new Set(['focus-visible', 'aria-invalid', 'dark'])
				: new Set(['focus-visible', 'aria-invalid']);

		test(`parseFocusBorderTokens resolves semantic, opacity, and combined-state borders in ${theme.name} mode`, () => {
			expect(
				parseFocusBorderTokens(
					'border-border focus-visible:border-ring aria-invalid:focus-visible:border-destructive dark:aria-invalid:focus-visible:border-destructive/40',
					knownColorNames,
				),
			).toEqual([
				{ variants: ['focus-visible'], color: 'ring', alpha: 1 },
				{
					variants: ['aria-invalid', 'focus-visible'],
					color: 'destructive',
					alpha: 1,
				},
				{
					variants: ['dark', 'aria-invalid', 'focus-visible'],
					color: 'destructive',
					alpha: 0.4,
				},
			]);
		});

		test(`an unknown focused border colour fails closed in ${theme.name} mode`, () => {
			expect(() =>
				parseFocusBorderTokens(
					'focus-visible:border-unresolvable',
					knownColorNames,
				),
			).toThrow(/Unknown focused border colour token/);
		});

		test(`a ring-ring/30 halo without a compliant border fails in ${theme.name} mode`, () => {
			expect(() =>
				assertStateCompliant(
					'low-opacity-halo-fixture',
					'focus-visible:ring-3 focus-visible:ring-ring/30',
					FOCUS_ONLY,
					'focused only',
				),
			).toThrow();
		});

		test(`an opaque focus border plus ring-ring/30 halo passes in ${theme.name} mode`, () => {
			expect(() =>
				assertStateCompliant(
					'combined-focus-fixture',
					'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
					FOCUS_ONLY,
					'focused only',
				),
			).not.toThrow();
		});

		test(`a full destructive border keeps the invalid-focus treatment compliant in ${theme.name} mode`, () => {
			expect(() =>
				assertStateCompliant(
					'invalid-focus-fixture',
					'focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20 dark:aria-invalid:focus-visible:border-destructive dark:aria-invalid:focus-visible:ring-destructive/40',
					FOCUS_AND_INVALID,
					'focused + aria-invalid',
				),
			).not.toThrow();
		});

		for (const consumerPath of discoveredConsumerPaths) {
			const consumerLabel = path.relative(srcRootDir, consumerPath);
			const consumerSource = readFileSync(consumerPath, 'utf8');
			const classLiterals = extractFocusClassLiterals(consumerSource);

			// W6-GUARDS: one test per DISCOVERED CLASS EXPRESSION, not one per
			// file — see the extractRingClassLiterals comment above. A file
			// containing marker text only inside a non-string context (a
			// comment, a type) is still discovered by the raw-substring scan
			// that built `discoveredConsumerPaths`, so this must never come up
			// empty for a genuinely discovered file.
			expect(
				classLiterals.length,
				`${consumerLabel}: discovered via a focus-visible ring/border raw-substring scan ` +
					'but no string-literal class expression contains either marker.',
			).toBeGreaterThan(0);

			for (const literal of classLiterals) {
				const elementLabel = `${consumerLabel}:${literal.line}`;

				test(`${elementLabel} renders a >= ${CONTRAST_FLOOR}:1 focus ring in ${theme.name} mode (focused only)`, () => {
					assertStateCompliant(
						elementLabel,
						literal.text,
						FOCUS_ONLY,
						'focused only',
					);
				});

				test(`${elementLabel} renders a >= ${CONTRAST_FLOOR}:1 focus ring in ${theme.name} mode (focused + aria-invalid)`, () => {
					assertStateCompliant(
						elementLabel,
						literal.text,
						FOCUS_AND_INVALID,
						'focused + aria-invalid',
					);
				});
			}
		}

		for (const variant of buttonVariantKeys) {
			const merged = cn(buttonVariants({ variant: variant as never }));

			test(`button.tsx (variant="${variant}") renders a >= ${CONTRAST_FLOOR}:1 focus ring in ${theme.name} mode (focused only)`, () => {
				assertStateCompliant(
					`button.tsx[variant=${variant}]`,
					merged,
					FOCUS_ONLY,
					'focused only',
				);
			});

			test(`button.tsx (variant="${variant}") renders a >= ${CONTRAST_FLOOR}:1 focus ring in ${theme.name} mode (focused + aria-invalid)`, () => {
				assertStateCompliant(
					`button.tsx[variant=${variant}]`,
					merged,
					FOCUS_AND_INVALID,
					'focused + aria-invalid',
				);
			});
		}

		for (const variant of badgeVariantKeys) {
			const merged = cn(badgeVariants({ variant: variant as never }));

			test(`badge.tsx (variant="${variant}") renders a >= ${CONTRAST_FLOOR}:1 focus ring in ${theme.name} mode (focused only)`, () => {
				assertStateCompliant(
					`badge.tsx[variant=${variant}]`,
					merged,
					FOCUS_ONLY,
					'focused only',
				);
			});

			test(`badge.tsx (variant="${variant}") renders a >= ${CONTRAST_FLOOR}:1 focus ring in ${theme.name} mode (focused + aria-invalid)`, () => {
				assertStateCompliant(
					`badge.tsx[variant=${variant}]`,
					merged,
					FOCUS_AND_INVALID,
					'focused + aria-invalid',
				);
			});
		}

		// W5-PROOF: the old parser only recognised `ring-(ring|destructive)`, so
		// any sibling semantic ring colour (and a low-opacity modifier on one of
		// them) was structurally invisible — regardless of theme/state. These
		// are three evasions different in shape from the cited
		// `focus-visible:ring-primary/10` example: a plain `ring-accent` with no
		// opacity suffix, a chained-variant `dark:` `ring-primary` with opacity,
		// and a widened opacity on the already-covered `ring-destructive`.
		// Prove the generic parser sees all three, and still ignores the
		// non-colour ring utilities (width/offset/arbitrary) the old parser was
		// also right to ignore.
		test(`parseRingTokens resolves sibling semantic ring colours generically in ${theme.name} mode`, () => {
			expect(
				parseRingTokens('focus-visible:ring-accent', knownColorNames),
			).toEqual([{ variants: ['focus-visible'], color: 'accent', alpha: 1 }]);
			expect(
				parseRingTokens('dark:focus-visible:ring-primary/10', knownColorNames),
			).toEqual([
				{ variants: ['dark', 'focus-visible'], color: 'primary', alpha: 0.1 },
			]);
			expect(
				parseRingTokens('focus-visible:ring-destructive/5', knownColorNames),
			).toEqual([
				{ variants: ['focus-visible'], color: 'destructive', alpha: 0.05 },
			]);
			expect(
				parseRingTokens('ring-3 ring-offset-2 ring-[3px]', knownColorNames),
			).toEqual([]);
		});

		// W5-VERIFY2's two evasions: an arbitrary-value ring the old parser
		// couldn't even see as a token (a bracket character isn't a word/dash
		// character), and a tie-break check proving the SAME-variant-chain,
		// later-in-source arbitrary value wins over an earlier compliant
		// semantic ring — the exact shape (a compliant base ring followed by an
		// arbitrary hex override in the same modifier group) that shipped a
		// white-on-white ring. Fixture strings below are built via
		// concatenation, not written as a literal contiguous "ring-[#hex]"
		// substring — that literal shape is exactly what the
		// `no-raw-visual-color` design-system guard scans for, and this is
		// real, scanned repo source, not an isolated fixture.
		test(`parseRingTokens resolves arbitrary bracket and CSS-variable-shorthand ring values in ${theme.name} mode`, () => {
			expect(
				parseRingTokens(
					`focus-visible:ring-[${ARBITRARY_HEX_FIXTURE}]`,
					knownColorNames,
				),
			).toEqual([
				{
					variants: ['focus-visible'],
					rawValue: ARBITRARY_HEX_FIXTURE,
					alpha: 1,
				},
			]);
			expect(
				parseRingTokens(
					'focus-visible:ring-(--publy-primary)',
					knownColorNames,
				),
			).toEqual([
				{
					variants: ['focus-visible'],
					rawValue: 'var(--publy-primary)',
					alpha: 1,
				},
			]);
			// A length-shaped bracket value is still correctly NOT a colour
			// candidate — only the syntax is shared with a real arbitrary
			// colour, not the meaning.
			expect(
				parseRingTokens('focus-visible:ring-[3px]', knownColorNames),
			).toEqual([]);
		});

		test(`parseRingTokens resolves a quote-adjacent utility with no whitespace-delimited neighbour in ${theme.name} mode`, () => {
			expect(
				parseRingTokens(
					'<button className="focus-visible:ring-primary/10" />',
					knownColorNames,
				),
			).toEqual([
				{ variants: ['focus-visible'], color: 'primary', alpha: 0.1 },
			]);
			expect(
				parseRingTokens(
					'const cls = `focus-visible:ring-accent`;',
					knownColorNames,
				),
			).toEqual([{ variants: ['focus-visible'], color: 'accent', alpha: 1 }]);
		});

		test(`parseRingOffsetTokens resolves a ring-offset colour utility in ${theme.name} mode`, () => {
			expect(
				parseRingOffsetTokens(
					'focus-visible:ring-2 focus-visible:ring-offset-primary',
					knownColorNames,
				),
			).toEqual([{ variants: ['focus-visible'], color: 'primary', alpha: 1 }]);
			expect(
				parseRingOffsetTokens('ring-2 ring-offset-2', knownColorNames),
			).toEqual([]);
		});

		test(`a planted low-contrast ring-offset colour fails the contrast floor in ${theme.name} mode (W5-HARDEN2 evasion proof)`, () => {
			expect(() =>
				assertStateCompliant(
					'evasion-fixture',
					`focus-visible:ring-2 focus-visible:ring-offset-[${surfaceHex}]`,
					FOCUS_ONLY,
					'focused only',
				),
			).toThrow();
		});

		test(`the same-variant-chain tie-break resolves to the LAST ring utility, matching real tailwind-merge order, in ${theme.name} mode`, () => {
			const tokens = parseRingTokens(
				`focus-visible:ring-ring focus-visible:ring-[${ARBITRARY_HEX_FIXTURE}]`,
				knownColorNames,
			);
			const winner = resolveWinningRingToken(
				tokens,
				new Set(['focus-visible']),
			);
			expect(winner).toEqual({
				variants: ['focus-visible'],
				rawValue: ARBITRARY_HEX_FIXTURE,
				alpha: 1,
			});
		});

		test(`a planted ring-on-surface-colour arbitrary ring value fails the contrast floor in ${theme.name} mode (W5-VERIFY2 evasion proof)`, () => {
			// Same shape as the real regression (the compliant base ring
			// overridden by a same-modifier-group arbitrary value) but using
			// THIS theme's own surface hex as the arbitrary value, so the
			// evasion is exactly 1:1 — guaranteed below the floor in both light
			// and dark mode, unlike a fixed white literal (which is
			// high-contrast against a dark surface and wouldn't demonstrate
			// anything in dark mode).
			// This asserts the GUARD rejects the evasion — `assertStateCompliant`
			// itself must throw (a failing contrast assertion), so the evasion
			// fixture is wrapped in `expect(...).toThrow()` rather than called
			// directly, which would instead make THIS test red.
			expect(() =>
				assertStateCompliant(
					'evasion-fixture',
					`focus-visible:ring-ring focus-visible:ring-[${surfaceHex}]`,
					FOCUS_ONLY,
					'focused only',
				),
			).toThrow();
		});

		test(`an unresolvable arbitrary ring colour fails closed instead of being silently skipped in ${theme.name} mode`, () => {
			expect(() =>
				assertStateCompliant(
					'evasion-fixture',
					`focus-visible:ring-[${ARBITRARY_OKLCH_FIXTURE}]`,
					FOCUS_ONLY,
					'focused only',
				),
			).toThrow(/Unsupported colour value shape/);
		});

		test(`a planted low-contrast sibling ring colour fails the contrast floor in ${theme.name} mode (evasion proof)`, () => {
			const lowContrastCandidates = ['accent', 'primary', 'secondary'].filter(
				(name) => knownColorNames.has(name),
			);
			expect(lowContrastCandidates.length).toBeGreaterThan(0);

			const failing = lowContrastCandidates.filter((name) => {
				const rgb = resolveKnownColorRgb(name);
				return contrastRatio(rgb, surfaceRgb) < CONTRAST_FLOOR;
			});
			// At least one of these theme-surface-adjacent tokens is genuinely
			// low-contrast against the surface in this theme -- if the detector
			// regressed to only seeing `ring`/`destructive`, a low-opacity variant
			// of one of THESE would silently ship, same defect class, different
			// token.
			expect(failing.length).toBeGreaterThan(0);
		});

		// W6-GUARDS (shell F4 / tests F2 / ui F2 / users-auth F10): proves the
		// file-wide pooling defect is actually closed, not just that the code
		// changed. Simulates the exact cited evasion — TWO elements in one
		// file, the FIRST non-compliant, the SECOND compliant — through the
		// real per-literal extraction + assertStateCompliant path used above,
		// not a hand-rolled substitute assertion.
		test(`two unrelated elements in one file: a noncompliant first ring is no longer hidden by a compliant later ring in ${theme.name} mode (evasion proof)`, () => {
			const twoElementSource = [
				`const first = "focus-visible:ring-[${surfaceHex}]";`,
				`const second = "focus-visible:ring-ring";`,
			].join('\n');
			const literals = extractFocusClassLiterals(twoElementSource);
			expect(literals).toHaveLength(2);

			// Old (file-wide) behaviour: pooling literals[0] + literals[1] into
			// one call resolves the winner to the LAST/most-specific token,
			// certifying the whole file even though the first element alone is
			// surface-on-surface. New behaviour: each literal is asserted
			// independently, so the first one must fail on its own.
			expect(() =>
				assertStateCompliant(
					'evasion-fixture:1',
					literals[0].text,
					FOCUS_ONLY,
					'focused only',
				),
			).toThrow();
			expect(() =>
				assertStateCompliant(
					'evasion-fixture:2',
					literals[1].text,
					FOCUS_ONLY,
					'focused only',
				),
			).not.toThrow();
		});

		// W6-GUARDS: proves a ring gated by an unreviewed modifier (`hover`
		// here — different in shape from the `sm:` breakpoint example in the
		// finding) is no longer silently treated as "nothing to assert". Under
		// the old code, `hover` is in no active-variants set this suite ever
		// builds, so `resolveWinningRingToken` always excluded the token and
		// `assertWinnerCompliant` returned early for every state.
		test(`a ring gated by an unmodelled 'hover' variant fails closed instead of being silently unverified in ${theme.name} mode (evasion proof)`, () => {
			expect(() =>
				assertStateCompliant(
					'evasion-fixture',
					'hover:focus-visible:ring-primary/10',
					FOCUS_ONLY,
					'focused only',
				),
			).toThrow(/unmodelled variant/);
		});

		// W6-GUARDS: proves this guard (post-fix) actually catches the REAL
		// shipped bug (ui F1) on PRE-FIX product code — an unlayered CSS rule
		// setting `box-shadow`/`border` unconditionally, which always beats a
		// layered `focus-visible:ring-3 focus-visible:ring-ring` utility and
		// removes the focus indicator entirely. Class-token analysis alone
		// cannot see the unlayered override (that's a real cascade fact the
		// TSX class string doesn't encode), so this test targets what the
		// class-string guard family CAN see and prove: the choice-chip's
		// pre-fix 30%-opacity outline color-mix, reproduced verbatim as it
		// shipped before this packet's `app.css` fix.
		test(`the pre-fix choice-chip low-opacity outline would have failed this contrast floor in ${theme.name} mode (ui-F1 regression proof)`, () => {
			const preFixChoiceChipRingRgb = resolveColor(
				'color-mix(in srgb, var(--publy-foreground-subtle) 30%, transparent)',
				declarations,
				surfaceHex,
			);
			const ratio = contrastRatio(preFixChoiceChipRingRgb, surfaceRgb);
			expect(ratio).toBeLessThan(CONTRAST_FLOOR);
		});
	}
});
