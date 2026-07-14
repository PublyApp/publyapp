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
 * W5-HARDEN (W5-VERIFY2): `ring-[#ffffff]` produced ZERO matches under the
 * old `ring-([\w-]+?)` pattern (`[` isn't a word/dash character), so an
 * arbitrary-value ring was invisible regardless of whether it won the real
 * merge. Now also matches `ring-[...]` (arbitrary value) and `ring-(--x)`
 * (Tailwind v4 CSS-variable shorthand), producing a `rawValue` token the
 * caller resolves with the same `resolveColor` used for every other value —
 * fail-closed (an unresolvable shape throws) instead of silently vanishing. */
/** Distinguishes a colour-shaped `ring-[...]` arbitrary value (hex, a colour
 * function, a `var()` reference, or a bare named colour keyword like
 * `white`) from a length-shaped one (`3px`, `0.5`) — both use identical
 * bracket syntax, and only the former is a ring-colour candidate. */
const ARBITRARY_RING_COLOR_VALUE_PATTERN =
	/^(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\)|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(.*\)|[a-zA-Z]+)$/;

const parseRingTokens = (
	mergedClassName: string,
	knownColorNames: ReadonlySet<string>,
): RingToken[] => {
	const pattern =
		/(?:^|\s)((?:[\w-]+:)*)ring-(\[[^\]]+\]|\((--[\w-]+)\)|[\w-]+?)(?:\/(\d+))?(?=\s|$)/g;
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
			// `ring-[<value>]` is ambiguous in real Tailwind: the same bracket
			// syntax sets ring WIDTH for a length (`ring-[3px]`) and ring COLOUR
			// for a colour (`ring-[#fff]`). Only a colour-shaped value is a
			// colour-token candidate; a length is correctly ignored, exactly
			// like `ring-3`/`ring-offset-2` already are via knownColorNames.
			if (ARBITRARY_RING_COLOR_VALUE_PATTERN.test(bracketValue)) {
				tokens.push({ variants, rawValue: bracketValue, alpha });
			}
		} else if (knownColorNames.has(rawColorGroup)) {
			tokens.push({ variants, color: rawColorGroup, alpha });
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
const FOCUS_RING_UTILITY_MARKER = 'focus-visible:ring';

const collectTsxFiles = (dir: string): string[] => {
	const results: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...collectTsxFiles(fullPath));
			continue;
		}
		if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
			results.push(fullPath);
		}
	}
	return results;
};

// W5-HARDEN (W5-VERIFY2): a hand-maintained consumer list is itself the
// defect this finding class keeps re-finding — `focus-visible:ring-primary/10`
// shipped on a real, focusable ROUTE consumer that this list never named,
// because nobody added it. Scanning the whole components/routes tree for any
// file whose source contains a static `focus-visible:ring` utility means an
// unlisted file can no longer be invisible; only button.tsx/badge.tsx are
// excluded, because their CVA variants are already exercised through the
// real `cn()`-merged pipeline below (this scan reads raw source text, so it
// cannot see a runtime-merged CVA variant's ring the way the variant-key
// loop does).
const STATIC_CONSUMER_EXCLUSIONS = new Set([
	path.join(uiDir, 'button.tsx'),
	path.join(uiDir, 'badge.tsx'),
]);

const discoveredConsumerPaths = [
	...collectTsxFiles(path.join(srcRootDir, 'components')),
	...collectTsxFiles(path.join(srcRootDir, 'routes')),
].filter(
	(absolutePath) =>
		!STATIC_CONSUMER_EXCLUSIONS.has(absolutePath) &&
		readFileSync(absolutePath, 'utf8').includes(FOCUS_RING_UTILITY_MARKER),
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
		const allProductFiles = [
			...collectTsxFiles(path.join(srcRootDir, 'components')),
			...collectTsxFiles(path.join(srcRootDir, 'routes')),
		];
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

		/** Resolves the winning ring token for a state and asserts it clears
		 * the contrast floor. `stateName` and `consumerLabel` are only for
		 * the assertion message. */
		const assertStateCompliant = (
			consumerLabel: string,
			mergedClassName: string,
			activeVariants: Set<string>,
			stateName: string,
		) => {
			const tokens = parseRingTokens(mergedClassName, knownColorNames);
			const winner = resolveWinningRingToken(tokens, activeVariants);
			if (!winner) {
				// No ring-colour utility applies while focus-visible is active in
				// this state (e.g. a consumer with no aria-invalid styling at
				// all) -- nothing to assert.
				return;
			}
			// W5-HARDEN: fail closed, not open. `winner.color` (a known semantic
			// token) always resolves; `winner.rawValue` (an arbitrary bracket
			// value or CSS-variable shorthand) is resolved through the SAME
			// `resolveColor` every other token value goes through — hex and
			// var() references succeed, anything else (a raw `oklch(...)`, an
			// unresolved custom property) THROWS, and that throw fails this test
			// instead of the token silently being skipped. A guard that quietly
			// can't parse a shape and treats that as "no violation" is the guard
			// this class of finding keeps re-breaking.
			const winnerRgb = winner.color
				? resolveKnownColorRgb(winner.color)
				: resolveColor(winner.rawValue as string, declarations, surfaceHex);
			const renderedRingRgb = composite(
				{ ...winnerRgb, a: winner.alpha },
				surfaceRgb,
			);
			const ratio = contrastRatio(renderedRingRgb, surfaceRgb);
			const winnerLabel = winner.color
				? `ring-${winner.color}`
				: `ring-[${winner.rawValue}]`;
			expect(
				ratio,
				`${consumerLabel} (${theme.name}, ${stateName}): winning ring token ` +
					`is ${winner.variants.join(':')}:${winnerLabel}` +
					(winner.alpha < 1 ? `/${Math.round(winner.alpha * 100)}` : '') +
					` -> ${ratio.toFixed(2)}:1`,
			).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
		};

		const FOCUS_ONLY =
			theme.name === 'dark'
				? new Set(['focus-visible', 'dark'])
				: new Set(['focus-visible']);
		const FOCUS_AND_INVALID =
			theme.name === 'dark'
				? new Set(['focus-visible', 'aria-invalid', 'dark'])
				: new Set(['focus-visible', 'aria-invalid']);

		for (const consumerPath of discoveredConsumerPaths) {
			const consumerLabel = path.relative(srcRootDir, consumerPath);
			const consumerSource = readFileSync(consumerPath, 'utf8');

			test(`${consumerLabel} renders a >= ${CONTRAST_FLOOR}:1 focus ring in ${theme.name} mode (focused only)`, () => {
				assertStateCompliant(
					consumerLabel,
					consumerSource,
					FOCUS_ONLY,
					'focused only',
				);
			});

			test(`${consumerLabel} renders a >= ${CONTRAST_FLOOR}:1 focus ring in ${theme.name} mode (focused + aria-invalid)`, () => {
				assertStateCompliant(
					consumerLabel,
					consumerSource,
					FOCUS_AND_INVALID,
					'focused + aria-invalid',
				);
			});
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
		// couldn't even see as a token (`[` isn't a word/dash character), and a
		// tie-break check proving the SAME-variant-chain, later-in-source
		// arbitrary value wins over an earlier compliant semantic ring — the
		// exact `focus-visible:ring-ring focus-visible:ring-[#ffffff]` shape
		// that shipped a white-on-white ring.
		test(`parseRingTokens resolves arbitrary bracket and CSS-variable-shorthand ring values in ${theme.name} mode`, () => {
			expect(
				parseRingTokens('focus-visible:ring-[#ffffff]', knownColorNames),
			).toEqual([
				{ variants: ['focus-visible'], rawValue: '#ffffff', alpha: 1 },
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

		test(`the same-variant-chain tie-break resolves to the LAST ring utility, matching real tailwind-merge order, in ${theme.name} mode`, () => {
			const tokens = parseRingTokens(
				'focus-visible:ring-ring focus-visible:ring-[#ffffff]',
				knownColorNames,
			);
			const winner = resolveWinningRingToken(
				tokens,
				new Set(['focus-visible']),
			);
			expect(winner).toEqual({
				variants: ['focus-visible'],
				rawValue: '#ffffff',
				alpha: 1,
			});
		});

		test(`a planted ring-on-surface-colour arbitrary ring value fails the contrast floor in ${theme.name} mode (W5-VERIFY2 evasion proof)`, () => {
			// Same shape as the real regression (`ring-ring` overridden by a
			// same-modifier-group `ring-[<arbitrary>]`) but using THIS theme's own
			// surface hex as the arbitrary value, so the evasion is exactly 1:1 —
			// guaranteed below the floor in both light and dark mode, unlike a
			// fixed literal like `#ffffff` (which is high-contrast against a dark
			// surface and wouldn't demonstrate anything in dark mode).
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
					'focus-visible:ring-[oklch(70%_0.1_90)]',
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
	}
});
