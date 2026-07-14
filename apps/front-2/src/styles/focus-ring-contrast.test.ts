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
import { readFileSync } from 'node:fs';
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

type RingColorKind = 'ring' | 'destructive';

type RingToken = {
	/** The chained variant/modifier prefixes gating this utility, e.g.
	 * `dark:aria-invalid:focus-visible:ring-ring` -> ['dark', 'aria-invalid', 'focus-visible']. */
	variants: string[];
	color: RingColorKind;
	/** Opacity suffix (`/NN`), or 1 when the utility carries no suffix (opaque). */
	alpha: number;
};

/** Parses every `[...:]ring-(ring|destructive)[/NN]` utility out of a final,
 * merged className string. Deliberately ignores non-ring-color utilities
 * (`ring-3`, `ring-[3px]`, border colours) — this test's scope is the
 * rendered focus-ring *colour*, matching the finding. */
const parseRingTokens = (mergedClassName: string): RingToken[] => {
	const pattern =
		/(?:^|\s)((?:[\w-]+:)*)ring-(ring|destructive)(?:\/(\d+))?(?=\s|$)/g;
	const tokens: RingToken[] = [];
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(mergedClassName))) {
		const [, chain, color, alphaText] = match;
		const variants = chain.split(':').filter(Boolean);
		tokens.push({
			variants,
			color: color as RingColorKind,
			alpha: alphaText ? Number.parseInt(alphaText, 10) / 100 : 1,
		});
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

/** Non-CVA consumers: a single static className recipe (no `variant` prop
 * affecting the ring), read straight from source. */
const STATIC_CONSUMERS = [
	'input.tsx',
	'textarea.tsx',
	'checkbox.tsx',
	'switch.tsx',
	'tabs.tsx',
	'drawer.tsx',
	'confirm-dialog.tsx',
	'select.tsx',
] as const;

describe('focus-ring contrast (W4-GUARDS ui-F1, hardened W5-UI ui-F1)', () => {
	const appCssSource = readFileSync(appCssPath, 'utf8');
	const rootBlock = extractBlock(appCssSource, /^:root\s*\{/);
	const darkBlock = extractBlock(appCssSource, /^html\.dark\s*\{/);
	const allDeclarations = new Map([
		...extractDeclarations(rootBlock),
		...extractDeclarations(darkBlock),
	]);

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

	for (const theme of THEMES) {
		const themeBlock = theme.name === 'light' ? rootBlock : darkBlock;
		const themeDeclarations = extractDeclarations(themeBlock);
		// Overlay theme-scoped overrides on top of root fallbacks (mirrors how
		// html.dark actually cascades over :root in the browser).
		const declarations = new Map([...allDeclarations, ...themeDeclarations]);
		const ringTokenValue = declarations.get('--publy-focus-ring');
		const destructiveTokenValue = declarations.get('--destructive');
		const surfaceHex = declarations.get(theme.surfaceToken);
		if (
			ringTokenValue === undefined ||
			destructiveTokenValue === undefined ||
			surfaceHex === undefined
		) {
			throw new Error(`Missing token for ${theme.name} theme`);
		}
		if (!HEX_PATTERN.test(surfaceHex)) {
			throw new Error(
				`Expected surface token to be a hex literal: ${surfaceHex}`,
			);
		}
		const surfaceRgb = parseHex(surfaceHex);
		const ringRgb = resolveColor(ringTokenValue, declarations, surfaceHex);
		const destructiveRgb = resolveColor(
			destructiveTokenValue,
			declarations,
			surfaceHex,
		);

		const colorRgb: Record<RingColorKind, Rgb> = {
			ring: ringRgb,
			destructive: destructiveRgb,
		};

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
			const tokens = parseRingTokens(mergedClassName);
			const winner = resolveWinningRingToken(tokens, activeVariants);
			if (!winner) {
				// No ring-colour utility applies while focus-visible is active in
				// this state (e.g. a consumer with no aria-invalid styling at
				// all) -- nothing to assert.
				return;
			}
			const renderedRingRgb = composite(
				{ ...colorRgb[winner.color], a: winner.alpha },
				surfaceRgb,
			);
			const ratio = contrastRatio(renderedRingRgb, surfaceRgb);
			expect(
				ratio,
				`${consumerLabel} (${theme.name}, ${stateName}): winning ring token ` +
					`is ${winner.variants.join(':')}:ring-${winner.color}` +
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

		for (const consumer of STATIC_CONSUMERS) {
			const consumerSource = readFileSync(path.join(uiDir, consumer), 'utf8');

			test(`${consumer} renders a >= ${CONTRAST_FLOOR}:1 focus ring in ${theme.name} mode (focused only)`, () => {
				assertStateCompliant(
					consumer,
					consumerSource,
					FOCUS_ONLY,
					'focused only',
				);
			});

			test(`${consumer} renders a >= ${CONTRAST_FLOOR}:1 focus ring in ${theme.name} mode (focused + aria-invalid)`, () => {
				assertStateCompliant(
					consumer,
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
	}
});
