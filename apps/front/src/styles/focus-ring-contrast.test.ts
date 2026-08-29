import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

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

	// #824 (ui F3): the CSS keyword `transparent` is fully transparent — it
	// composites to the background at alpha 0 and bottoms any contrast ratio
	// out at 1:1. Modelling it explicitly (instead of discarding it at parse
	// time) is what makes a winning transparent ring fail the floor loudly.
	if (trimmed === 'transparent') {
		return { r: 0, g: 0, b: 0, a: 0 };
	}

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
		if (parsed.a < 1) {
			return composite(parsed, parseHex(backgroundHex));
		}
		return parsed;
	}

	throw new Error(`Unsupported colour value shape: ${trimmed}`);
};

const relativeLuminance = ({ r, g, b }: Rgb): number => {
	const linearize = (channel: number): number => {
		const c = channel / 255;
		if (c <= 0.03928) {
			return c / 12.92;
		}
		return ((c + 0.055) / 1.055) ** 2.4;
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

const containsFocusIndicatorUtility = (source: string): boolean =>
	FOCUS_INDICATOR_UTILITY_MARKERS.some((marker) => source.includes(marker));

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

describe('focus-ring contrast (W4-GUARDS ui-F1; #823 scope: token math + fail-closed tripwires)', () => {
	const appCssSource = readFileSync(appCssPath, 'utf8');
	const rootBlock = extractBlock(appCssSource, /^:root\s*\{/);
	const darkBlock = extractBlock(appCssSource, /^html\.dark\s*\{/);
	const allDeclarations = new Map([
		...extractDeclarations(rootBlock),
		...extractDeclarations(darkBlock),
	]);

	// W5-PROOF: the real `@theme inline { --color-<name>: var(--<target>); }`
	// map, so semantic colour names Tailwind actually generates utilities for
	// are resolvable here.
	const themeInlineBlock = extractBlock(appCssSource, /^@theme inline\s*\{/);
	const themeColorDeclarations = extractDeclarations(themeInlineBlock);

	// The `cva` variant definitions live in the sibling `*.variants.ts`
	// modules (react-doctor rung 2, #1417): a component file exports only
	// components, so the variant blocks are parsed from their actual home.
	const buttonSource = readFileSync(
		path.join(uiDir, 'button.variants.ts'),
		'utf8',
	);
	const badgeSource = readFileSync(
		path.join(uiDir, 'badge.variants.ts'),
		'utf8',
	);
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
	// runs without throwing. Since #823 this discovery no longer feeds a
	// class-string compliance sweep (that was the deleted simulation); it
	// feeds the fail-closed tripwires below and pins the fact that focusable
	// consumers exist OUTSIDE the primitives the e2e spec probes.
	test('the discovered consumer set is not scoped to src/components/ui/ alone (the class of miss that let a route consumer ship unguarded)', () => {
		const hasRouteConsumer = discoveredConsumerPaths.some((consumerPath) =>
			consumerPath.startsWith(path.join(srcRootDir, 'routes')),
		);
		expect(discoveredConsumerPaths.length).toBeGreaterThan(0);
		expect(hasRouteConsumer).toBe(true);
	});

	// W5-HARDEN: a ring colour set via inline `style=` is entirely outside
	// className-based scanning AND outside any static analysis this file can
	// do — rather than let that shape through unverified, fail the whole
	// suite if it's ever used anywhere in scope.
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

	// W5-HARDEN2 item 2C: a ring/focus utility built by runtime string
	// CONCATENATION or interpolation can never be resolved statically — there
	// is no complete literal utility string anywhere in source for this guard
	// (or Tailwind's own JIT scanner) to find. Rather than silently treat
	// "found nothing" as "compliant", fail the whole suite if that shape is
	// ever used anywhere in scope.
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

		// Resolved lazily: several theme colours unrelated to focus rings use
		// value shapes this token-math guard doesn't need to support, and
		// eagerly resolving all of them would fail on colours no ring utility
		// ever references.
		const ringRawValue = themeColorDeclarations.get('--color-ring');
		if (ringRawValue === undefined) {
			throw new Error(
				`Missing --color-ring entry in @theme inline (${theme.name} scan)`,
			);
		}
		const ringRgb = resolveColor(ringRawValue, declarations, surfaceHex);

		test(`--publy-focus-ring token alone clears ${CONTRAST_FLOOR}:1 against --publy-surface in ${theme.name} mode`, () => {
			const ratio = contrastRatio(ringRgb, surfaceRgb);
			expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
		});

		// W6-GUARDS: proves the token-math floor actually catches the REAL
		// shipped bug (ui F1) on PRE-FIX product code — the choice-chip's
		// pre-fix 30%-opacity outline color-mix, reproduced verbatim as it
		// shipped before this packet's `app.css` fix. Pure colour math, no
		// cascade model involved.
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
