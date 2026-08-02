import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';
import { compile } from 'tailwindcss';
import { describe, expect, test } from 'vitest';

import { resolveEffectiveDeclarations } from './css-cascade-test-support';
import {
	DESCRIPTION_SELECTORS,
	DRAWER_DESCRIPTION_CONSUMERS,
	type DrawerDescriptionConsumer,
} from './drawer-description-inventory';

const appCssPath = path.resolve(process.cwd(), 'src/styles/app.css');
// Comments are stripped before token extraction so a token name mentioned in
// prose cannot masquerade as a real declaration.
const appCssSource = readFileSync(appCssPath, 'utf8').replace(
	/\/\*[\s\S]*?\*\//g,
	'',
);

// Every consumer the call-site guard must find, and every consumer the
// browser guard must open live (round 5 I4). A drawer added to the app but
// missing from this inventory fails the enumeration test below; an inventory
// entry without a live browser case fails the e2e spec. One shared constant,
// never two copies.
const CONSUMERS: readonly DrawerDescriptionConsumer[] =
	DRAWER_DESCRIPTION_CONSUMERS;

const SMALL_TEXT_CONTRAST_FLOOR = 4.5;

// Shared with the browser spec via the inventory module (round 7 M5): every
// selector below must have a live browser measurement case there.
const SURFACE_TOKENS = [
	'--publy-surface',
	'--publy-surface-muted',
	'--publy-surface-raised',
] as const;

type Rgba = { r: number; g: number; b: number; a: number };

// One real parse of app.css, shared by the theme token maps, the contextual
// token fallback (round 8 M5) and nothing else — the utility resolution below
// re-parses each compiled candidate build.
const appCssRoot = postcss.parse(appCssSource, { from: undefined });

// Every `--custom-property: value;` declaration in a theme block — hex and
// rgba() colours, `var(--publy-*)` aliases, and everything else — so the
// guard can read the real overlay surface and the backdrop it composites
// over, not only the opaque surface tokens. Read from the postcss tree (not
// brace arithmetic) so a statement at-rule before the block or a brace in a
// comment cannot desynchronize the scan (round 8 M6).
const readDeclarations = (
	selector: ':root' | 'html.dark',
): Map<string, string> => {
	const declarations = new Map<string, string>();
	let found = false;
	appCssRoot.walkRules((rule) => {
		if (
			rule.selector
				.split(',')
				.map((entry) => entry.trim())
				.includes(selector)
		) {
			found = true;
			for (const node of rule.nodes) {
				if (node.type === 'decl' && node.prop.startsWith('--')) {
					declarations.set(node.prop, node.value.trim());
				}
			}
		}
	});
	if (!found) {
		throw new Error(`Missing ${selector} theme block`);
	}
	return declarations;
};

const LIGHT_DECLARATIONS = readDeclarations(':root');
const DARK_DECLARATIONS = readDeclarations('html.dark');

// Round 8 M5: tokens declared on a component rule rather than in
// :root/html.dark (e.g. `--publy-toast-accent` on `.publy-toast`,
// `--publy-icon-tile-fg` on `.publy-profile-icon-tile[data-tone='0']`) are
// legitimate app declarations, and the old resolver rejected them with a
// misleading "not declared" message. When a token is missing from both theme
// blocks and the Tailwind theme, fall back to its FIRST declaration in
// app.css — the base (unvarianted) context. A variant-gated value (a
// different toast tone, a different data-tone) cannot be modelled
// statically; the guard resolves the base declaration and the browser spec
// measures the real paints.
const CONTEXTUAL_DECLARATIONS = (() => {
	const declarations = new Map<string, string>();
	appCssRoot.walkDecls((decl) => {
		if (decl.prop.startsWith('--') && !declarations.has(decl.prop)) {
			declarations.set(decl.prop, decl.value.trim());
		}
	});
	return declarations;
})();

const parseColorValue = (raw: string, name: string): Rgba => {
	const trimmed = raw.trim();

	const hexMatch =
		/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(
			trimmed,
		);
	if (hexMatch) {
		const hex = hexMatch[1];
		if (hex.length === 3 || hex.length === 4) {
			const expanded = [...hex].map((digit) => digit + digit).join('');
			return {
				r: Number.parseInt(expanded.slice(0, 2), 16),
				g: Number.parseInt(expanded.slice(2, 4), 16),
				b: Number.parseInt(expanded.slice(4, 6), 16),
				a:
					hex.length === 4
						? Number.parseInt(expanded.slice(6, 8), 16) / 255
						: 1,
			};
		}
		return {
			r: Number.parseInt(hex.slice(0, 2), 16),
			g: Number.parseInt(hex.slice(2, 4), 16),
			b: Number.parseInt(hex.slice(4, 6), 16),
			a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
		};
	}

	// Comma-separated functional colour syntax with an optional alpha.
	const commaMatch =
		/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(
			trimmed,
		);
	if (commaMatch) {
		return {
			r: Number(commaMatch[1]),
			g: Number(commaMatch[2]),
			b: Number(commaMatch[3]),
			a: commaMatch[4] === undefined ? 1 : Number(commaMatch[4]),
		};
	}

	// Space-separated functional colour syntax with an optional alpha.
	const spaceMatch =
		/^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/.exec(
			trimmed,
		);
	if (spaceMatch) {
		return {
			r: Number(spaceMatch[1]),
			g: Number(spaceMatch[2]),
			b: Number(spaceMatch[3]),
			a: spaceMatch[4] === undefined ? 1 : Number(spaceMatch[4]),
		};
	}

	throw new Error(`Unparseable colour value for ${name}: ${raw}`);
};

// Tailwind's default theme ships its palette in oklch (e.g.
// `--color-red-500: oklch(63.7% 0.237 25.331)`). The app overrides its own
// semantic tokens in hex/rgba, but a built-in palette colour like
// `text-red-500` compiles to `var(--color-red-500)` and resolveColor must be
// able to resolve it, so oklch is converted to sRGB here (Björn Ottosson's
// OKLab → sRGB matrix) rather than bailing with an unparseable-value error.
const parseOklchColor = (raw: string, name: string): Rgba => {
	const match = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(
		raw.trim(),
	);
	if (match === null) {
		throw new Error(`Unparseable oklch colour value for ${name}: ${raw}`);
	}

	const lightness = Number(match[1]) / 100;
	const chroma = Number(match[2]);
	const hueRadians = (Number(match[3]) * Math.PI) / 180;
	const a = chroma * Math.cos(hueRadians);
	const b = chroma * Math.sin(hueRadians);

	const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
	const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
	const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
	const l = lPrime ** 3;
	const m = mPrime ** 3;
	const s = sPrime ** 3;

	const linear = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
	const toSrgb = (channel: number): number => {
		const clamped = Math.max(0, Math.min(1, channel));
		return clamped <= 0.0031308
			? 12.92 * clamped
			: 1.055 * clamped ** (1 / 2.4) - 0.055;
	};

	return {
		r: Math.round(toSrgb(linear[0]) * 255),
		g: Math.round(toSrgb(linear[1]) * 255),
		b: Math.round(toSrgb(linear[2]) * 255),
		a: 1,
	};
};

// Tailwind's default `@theme default` block, read as a token source so a
// built-in palette colour (`text-red-500` → `var(--color-red-500)`) can be
// resolved when the app's own `:root`/`html.dark` does not declare it. This
// is the round 5 I5 fallback: legitimately resolvable Tailwind utilities must
// not hard-fail, or the developer "fix" becomes weakening the guard.
const tailwindThemePath = fileURLToPath(
	import.meta.resolve('tailwindcss/theme.css'),
);
const tailwindThemeDeclarations = (() => {
	const themeSource = readFileSync(tailwindThemePath, 'utf8');
	const themeRoot = postcss.parse(themeSource, { from: undefined });
	const declarations = new Map<string, string>();
	let found = false;
	themeRoot.walkAtRules('theme', (atRule) => {
		if (atRule.params.trim() !== 'default') {
			return;
		}
		found = true;
		atRule.walkDecls((decl) => {
			if (decl.prop.startsWith('--')) {
				declarations.set(decl.prop, decl.value.trim());
			}
		});
	});
	if (!found) {
		throw new Error('Missing @theme default block in tailwindcss/theme.css');
	}
	return declarations;
})();

const parseColorDeclaration = (raw: string, name: string): Rgba => {
	const trimmed = raw.trim();
	if (/^oklch\(/.test(trimmed)) {
		return parseOklchColor(trimmed, name);
	}
	return parseColorValue(trimmed, name);
};

const resolveColor = (name: string, theme: 'light' | 'dark'): Rgba => {
	const visited = new Set<string>();
	const resolve = (tokenName: string): Rgba => {
		if (visited.has(tokenName)) {
			throw new Error(`Circular custom-property reference at ${tokenName}`);
		}
		visited.add(tokenName);

		const raw =
			theme === 'dark'
				? (DARK_DECLARATIONS.get(tokenName) ??
					LIGHT_DECLARATIONS.get(tokenName))
				: LIGHT_DECLARATIONS.get(tokenName);
		if (raw === undefined) {
			const tailwindRaw = tailwindThemeDeclarations.get(tokenName);
			if (tailwindRaw !== undefined) {
				return parseColorDeclaration(tailwindRaw, tokenName);
			}
			const contextualRaw = CONTEXTUAL_DECLARATIONS.get(tokenName);
			if (contextualRaw !== undefined) {
				// Round 8 M5 — see the CONTEXTUAL_DECLARATIONS comment above.
				const aliasMatch = /^var\((--[\w-]+)\)$/.exec(contextualRaw);
				if (aliasMatch) {
					return resolve(aliasMatch[1]);
				}
				return parseColorDeclaration(contextualRaw, tokenName);
			}
			throw new Error(
				`Token ${tokenName} is not declared in app.css or the Tailwind theme`,
			);
		}

		const aliasMatch = /^var\((--[\w-]+)\)$/.exec(raw);
		if (aliasMatch) {
			return resolve(aliasMatch[1]);
		}
		return parseColorDeclaration(raw, tokenName);
	};
	return resolve(name);
};

// Standard alpha compositing: `over` painted on top of `under`.
const alphaComposite = (over: Rgba, under: Rgba): Rgba => {
	const resultAlpha = over.a + under.a * (1 - over.a);
	if (resultAlpha === 0) {
		return { r: 0, g: 0, b: 0, a: 0 };
	}
	const compositeChannel = (
		overChannel: number,
		underChannel: number,
	): number =>
		(overChannel * over.a + underChannel * under.a * (1 - over.a)) /
		resultAlpha;
	return {
		r: compositeChannel(over.r, under.r),
		g: compositeChannel(over.g, under.g),
		b: compositeChannel(over.b, under.b),
		a: resultAlpha,
	};
};

// The opaque colour the drawer description text actually sits on. The drawer
// panel (`.publy-drawer`) paints `--publy-overlay-surface` at alpha 0.97,
// above the fixed scrim (`.publy-overlay-backdrop` paints `--publy-backdrop`)
// which sits on the app canvas (`--publy-background`, the `html`/shell
// background). Compositing in paint order reads the translucent overlay as
// the colour a real description sees instead of treating the declared rgba
// value as an opaque backdrop.
//
// At the current overlay alpha (0.97) the scrim and canvas contribute ~3% of
// the result — mutating either alone cannot move a verdict today (round 5 M9).
// They are still composed, not dropped: they become load-bearing the moment
// the overlay alpha falls, and the overlay's own colour is always load-bearing
// (a darker overlay is caught on the composited surface, never on the raw
// token). The canvas is `--publy-background` because every current drawer
// opens over that shell/marketing canvas.
const compositedDrawerBackground = (theme: 'light' | 'dark'): Rgba => {
	const scrimOverCanvas = alphaComposite(
		resolveColor('--publy-backdrop', theme),
		resolveColor('--publy-background', theme),
	);
	return alphaComposite(
		resolveColor('--publy-overlay-surface', theme),
		scrimOverCanvas,
	);
};

const relativeLuminance = ({ r, g, b }: Rgba): number => {
	const linearize = (channel: number): number => {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};

	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
};

const contrastRatio = (foreground: Rgba, background: Rgba): number => {
	const foregroundLuminance = relativeLuminance(foreground);
	const backgroundLuminance = relativeLuminance(background);
	const lighter = Math.max(foregroundLuminance, backgroundLuminance);
	const darker = Math.min(foregroundLuminance, backgroundLuminance);

	return (lighter + 0.05) / (darker + 0.05);
};

const tokenFromColorDeclaration = (selector: string): string => {
	const declarations = resolveEffectiveDeclarations(appCssSource, selector);
	const color = declarations.get('color');
	if (color === undefined) {
		throw new Error(`No color declaration resolves for ${selector}`);
	}
	const match = /var\((--publy-[\w-]+)\)/.exec(color);
	if (!match) {
		throw new Error(
			`${selector} color is not a --publy-* token reference: ${color}`,
		);
	}
	return match[1];
};

// ---- Call-site enumeration -------------------------------------------------
//
// `DrawerDescription` deliberately merges the caller's `className` onto the
// description element (drawer.tsx), so a token-only guard cannot see a
// consumer re-colouring the text with a utility class. This guard reads every
// `<DrawerDescription>` usage in the repository and verifies its *effective*
// colour (default primitive token, or the resolved utility override) still
// clears the floor on the composited drawer surface.
//
// SCOPE LIMITATION (round 5 B1): this guard reads only the description's own
// attributes. A colour override on a CHILD the description contains — a
// `<strong>`, a count, an emphasised fragment, a linked policy version — is
// invisible here and must NOT be implied covered. The browser spec
// (e2e/drawer-description-contrast.spec.ts) walks every descendant text node's
// computed colour and is the guard that actually covers children; the shared
// inventory below guarantees every drawer this guard covers is also opened
// live there.

const walkTsxFiles = (dir: string): string[] => {
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...walkTsxFiles(fullPath));
		} else if (
			entry.name.endsWith('.tsx') &&
			!entry.name.endsWith('.test.tsx') &&
			!entry.name.endsWith('.spec.tsx')
		) {
			files.push(fullPath);
		}
	}
	return files;
};

export const extractClassName = (
	attributes: string,
	file: string,
	line: number,
): string | null => {
	// Round 5 I3: an inline `style` that sets `color` is invisible to the
	// source model, even when a literal className is also present (the style
	// wins in the cascade). Non-colour styles (spacing, alignment) do not
	// change contrast, so only a `style` whose value names `color` fails closed.
	if (/\bstyle\s*=/.test(attributes) && /\bcolor\s*:/.test(attributes)) {
		throw new Error(
			`DrawerDescription at ${file}:${line} sets an inline style with a colour ` +
				'that the contrast guard cannot resolve — move the colour to a ' +
				'string-literal className so it can be verified against the 4.5:1 floor.',
		);
	}

	const literalMatch = /className\s*=\s*("([^"]*)"|'([^']*)')/.exec(attributes);
	if (literalMatch) {
		return literalMatch[2] ?? literalMatch[3];
	}
	if (/className\s*=/.test(attributes)) {
		throw new Error(
			`DrawerDescription at ${file}:${line} passes a non-literal className that ` +
				'the contrast guard cannot resolve — inline a string literal so an ' +
				'override can be verified against the 4.5:1 floor.',
		);
	}
	// Round 5 I2: a className smuggled through a prop spread (e.g.
	// `{...{ className: 'text-primary' }}` or `{...props}`) matches neither the
	// literal regex nor `/className\s*=/`. The guard already fails loudly on a
	// braces-wrapped literal, so this is the same fail-closed intent — a spread
	// can carry a colour override the source guard cannot see.
	if (attributes.includes('{...')) {
		throw new Error(
			`DrawerDescription at ${file}:${line} passes props through a spread that ` +
				'the contrast guard cannot resolve — inline a string-literal className ' +
				'so an override can be verified against the 4.5:1 floor.',
		);
	}
	return null;
};

type CallSite = {
	file: string;
	line: number;
	className: string | null;
};

// Round 8 M3: the module matcher used to gate on
// `/\/components\/ui\/drawer$/` against the raw specifier, so a RELATIVE
// import from a sibling in `src/components/ui/` (`./drawer`) escaped both
// guards entirely — the round-7 alias fix one level up the resolver. The
// specifier is now resolved against the importing file (like the bundler
// does) before matching, so `./drawer`, `../components/ui/drawer` and the
// `~/components/ui/drawer` alias all land on the same module.
const isDrawerModuleImport = (
	specifier: string,
	importerPath: string,
): boolean => {
	if (
		specifier === '~/components/ui/drawer' ||
		specifier === '~/components/ui/drawer.tsx'
	) {
		return true;
	}
	if (!specifier.startsWith('.')) {
		return false;
	}
	const resolved = path.posix.normalize(
		path.posix.join(path.posix.dirname(importerPath), specifier),
	);
	return /\/components\/ui\/drawer(?:\.tsx)?$/.test(resolved);
};

// Round 7 M4: the local JSX tag names that refer to `DrawerDescription` in a
// file — the plain named import plus every alias (`DrawerDescription as
// Description`) and the namespace of `import * as Drawer` (used as
// `<Drawer.DrawerDescription>`). Before this, an aliased import escaped the
// enumeration entirely: no source coverage, no inventory entry, no browser
// case — which is what turned the I1/I2 source-guard gaps into full escapes
// instead of browser-bounded ones. Round 8 M3: relative specifiers are
// resolved against the importing file, not matched literally.
export const drawerDescriptionTagNames = (
	source: string,
	file: string,
): string[] => {
	const tagNames = new Set<string>();

	for (const match of source.matchAll(
		/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g,
	)) {
		const modulePath = match[2];
		if (!isDrawerModuleImport(modulePath, file)) {
			continue;
		}
		for (const specifier of match[1].split(',')) {
			const imported = specifier.trim().replace(/^type\s+/, '');
			const aliasMatch = /^DrawerDescription\s+as\s+([A-Za-z_$][\w$]*)$/.exec(
				imported,
			);
			if (aliasMatch) {
				tagNames.add(aliasMatch[1]);
			} else if (/^DrawerDescription$/.test(imported)) {
				tagNames.add('DrawerDescription');
			}
		}
	}

	for (const match of source.matchAll(
		/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*['"]([^'"]+)['"]/g,
	)) {
		if (isDrawerModuleImport(match[2], file)) {
			tagNames.add(`${match[1]}.DrawerDescription`);
		}
	}

	return [...tagNames];
};

const findDrawerDescriptionCallSites = (): CallSite[] => {
	const srcRoot = path.resolve(process.cwd(), 'src');
	const callSites: CallSite[] = [];
	for (const file of walkTsxFiles(srcRoot)) {
		const source = readFileSync(file, 'utf8');
		for (const tagName of drawerDescriptionTagNames(source, file)) {
			const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const tagPattern = new RegExp(`<${escapedTagName}\\b([^>]*)(\\/?)>`, 'g');
			for (const match of source.matchAll(tagPattern)) {
				const attributes = match[1];
				const line = source.slice(0, match.index).split('\n').length;
				callSites.push({
					file,
					line,
					className: extractClassName(attributes, file, line),
				});
			}
		}
	}
	return callSites;
};

// Compile each literal class candidate against the app's REAL stylesheet —
// the same CSS the app ships (app.css plus its `tw-animate-css` and
// `shadcn/tailwind.css` imports), with `@tailwind utilities;` appended so the
// candidate-generated utilities are emitted (round 5 I5). Before this change
// the compiler input was only theme.css + `@theme inline`, so a legitimate
// app component class (`publy-type-helper`), a tw-animate utility
// (`animate-in`) or a Tailwind built-in palette colour (`text-red-500`)
// failed loudly — forcing the next developer to edit this guard to make a
// legitimate case pass, which is exactly how round 3's hole got in. The
// `text-*` namespace is overloaded (colour, font size, alignment, wrapping,
// ...), so generated CSS is still the authoritative way to distinguish a
// colour override from typography. A candidate that generates no rule at all
// fails closed by name; a candidate whose rule declares a colour resolves
// THAT colour. The primitive's compliant default is only ever measured for a
// class candidate that genuinely declares no colour (typography, animation) —
// never as a substitute for one the guard cannot read (round 7 I1: the walker
// used to answer "no colour" for every app component class in the first
// `@layer components` block and the call-site test then measured the default
// under the class's name).
// Locates the node_modules package root for a (possibly scoped) package by
// walking up from the app directory, mirroring Node's resolution. Used both to
// resolve app.css's `@import`s and to read package metadata (round 5 I6).
const findPackageRoot = (packageName: string): string => {
	let directory = path.resolve(process.cwd());
	for (;;) {
		const candidate = path.join(directory, 'node_modules', packageName);
		if (existsSync(path.join(candidate, 'package.json'))) {
			return candidate;
		}
		const parent = path.dirname(directory);
		if (parent === directory) {
			throw new Error(
				`Contrast guard cannot locate package ${packageName} for app.css`,
			);
		}
		directory = parent;
	}
};

const resolveAppStylesheetImport = (id: string): string => {
	if (id === 'tailwindcss') {
		return tailwindThemePath;
	}

	if (id === 'tw-animate-css') {
		const packageJson = JSON.parse(
			readFileSync(path.join(findPackageRoot(id), 'package.json'), 'utf8'),
		) as { style?: string; main?: string };
		const entry = packageJson.style ?? packageJson.main;
		if (entry === undefined) {
			throw new Error(`tw-animate-css has no style/main entry`);
		}
		return path.join(findPackageRoot(id), entry);
	}
	if (id === 'shadcn/tailwind.css') {
		return path.join(findPackageRoot('shadcn'), 'dist', 'tailwind.css');
	}

	throw new Error(
		`Contrast guard cannot resolve stylesheet import ${id} in app.css`,
	);
};

const loadAppStylesheet = async (
	id: string,
): Promise<{ path: string; base: string; content: string }> => {
	const resolved = resolveAppStylesheetImport(id);
	return {
		path: resolved,
		base: path.dirname(resolved),
		content: readFileSync(resolved, 'utf8'),
	};
};

const tailwindCompilerInput = `${appCssSource}\n@tailwind utilities;`;

// Escapes a utility class name the way the Tailwind compiler escapes it in a
// selector (`text-primary` → `text-primary`, an arbitrary-value utility whose
// brackets hold a colon → `\[…\:…\]`, `dark:text-primary` →
// `dark\:text-primary`). Only `[0-9A-Za-z_-]` survives unescaped; everything
// else is backslash-prefixed.
const escapeClassName = (utility: string): string =>
	utility.replace(/[^\x2d\x30-\x39\x41-\x5a\x5f\x61-\x7a]/g, (character) =>
		'\\'.concat(character),
	);

type CompiledUtilityStyle = {
	/** Last `color:` declaration emitted by the utility's own rules, if any. */
	color: string | null;
	/** Last `-webkit-text-fill-color:` declaration, if any — the property that
	 * actually paints text in WebKit/Blink when both are set (round 7 M7). */
	textFillColor: string | null;
	/** Last `opacity:` declaration emitted by the utility's own rules, if any. */
	opacity: string | null;
};

// ---- CSS resolution (round 9 rewrite) -------------------------------------
//
// The rule reader used to be a hand-rolled brace scanner, and three rounds of
// adversarial review found four parser defects in it (rounds 6-8: statement
// at-rule absorption, a `;`-consuming declaration regex, substring selector
// matching that let `:hover`/`@media` variants supply the resting colour, and
// native nesting blindness). It is now a real postcss parse of each compiled
// candidate build — at-rule containers, declaration-only at-rules, native
// nesting, braces inside strings and comments are all handled by the parser
// (precedent: scripts/check-zindex-guard.mjs in the sibling batch).
//
// What the parser does NOT decide — the guard's own policy:
//   1. EXACT selector matching (round 8 I1): a rule supplies the RESTING
//      style of a class only when one of its selector-list entries IS the
//      class itself (its final compound run equals `.class`). `.x:hover`,
//      `.x[data-active]`, `.x:focus-visible` are state variants — they never
//      paint at rest — so they are ignored, never last-wins.
//   2. CONDITIONAL at-rules (`@media`/`@supports`/`@container`) never supply
//      the resting colour either (round 8 I1): the suite measures fixed
//      viewports the source model cannot evaluate, mirroring the documented
//      policy of css-cascade-test-support.ts. `@layer` is not conditional —
//      it groups cascade priority, it does not gate applicability.
//   3. LAST-WINS across nesting (round 8 I2): Tailwind emits authored
//      nesting verbatim, so a rule nested inside a plain rule counts with
//      the full tree in source order — a later nested override wins exactly
//      as it does in the browser.
//   4. THEME-gated nesting (round 9): Tailwind's class-based `dark:` variant
//      compiles to `.dark\:text-primary { &:is(.dark *) { … } }`. The
//      nested `&:is(.dark *)` is a THEME gate, and the suite knows which
//      theme it measures (the browser spec toggles the real `.dark` class),
//      so it supplies the resting colour in the dark theme only — and is
//      ignored in light, where the browser would not paint it.
//   5. FAIL-CLOSED sweep (rounds 4+9): every colour declaration anywhere
//      under an exact-match rule — including inside a conditional at-rule —
//      must resolve; an unresolvable value (`text-primary/50`'s
//      `color-mix(…)` fallback, a named colour) throws by name instead of
//      letting the guard report the fallback colour the browser does not
//      paint. Resolvable conditional values still never supply the resting
//      colour (rule 2).
//   6. `!important` is a cascade-priority flag, not part of the value
//      (round 8 M5): postcss separates it, so
//      `color: var(--publy-foreground-muted) !important` resolves the same
//      colour as the plain declaration.

const CONDITIONAL_AT_RULES = new Set(['media', 'supports', 'container']);

/** Splits a selector list on top-level commas, ignoring commas nested inside
 * `(...)` or `[...]` (e.g. `:is(.a, .b)`, `[data-x='a,b']`). */
const splitSelectorList = (selector: string): string[] => {
	const entries: string[] = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < selector.length; index += 1) {
		const character = selector[index];
		if (character === '(' || character === '[') {
			depth += 1;
		} else if (character === ')' || character === ']') {
			depth -= 1;
		} else if (character === ',' && depth === 0) {
			entries.push(selector.slice(start, index));
			start = index + 1;
		}
	}
	entries.push(selector.slice(start));
	return entries
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
};

/** The final compound selector run of an individual (comma-free) selector —
 * the run whose tokens must match the actual target element, ignoring any
 * ancestor compounds joined by a combinator. */
const lastCompoundRun = (selector: string): string => {
	const withSpacedCombinators = selector.replace(/[>+~]/g, ' ');
	return (
		withSpacedCombinators
			.split(/\s+/)
			.filter((run) => run.length > 0)
			.slice(-1)[0] ?? ''
	);
};

/** True when `selector` (a possibly comma-separated list) targets the class
 * itself — the exact-match policy of round 8 I1, rule 1 above. */
const isExactClassSelector = (selector: string, needle: string): boolean =>
	splitSelectorList(selector).some(
		(entry) => lastCompoundRun(entry) === needle,
	);

/** Tailwind's class-based `dark:` variant nesting shape (rule 4 above). The
 * `&` is the parent selector — the class itself — so the nested rule is the
 * dark-theme gate of exactly that class. Covers both the bare gate
 * (`&:is(.dark)`) and the scoped form Tailwind v4 actually emits for
 * `@custom-variant dark (&:is(.dark *))` — `&:is(.dark *)`, plus the default
 * `&:where(.dark, .dark *)` spelling. */
const DARK_GATE_SELECTOR_PATTERN =
	/^&:(?:is|where)\(\s*\.dark(?:\s*\*\s*|\s*,\s*\.dark\s*\*)?\s*\)$/;

const isConditionalAtRuleAncestor = (node: postcss.Node): boolean => {
	let current = node.parent;
	while (current != null && current.type !== 'root') {
		if (current instanceof postcss.AtRule) {
			const name = current.name.toLowerCase();
			if (CONDITIONAL_AT_RULES.has(name)) {
				return true;
			}
		}
		current = current.parent;
	}
	return false;
};

const isRelevantProperty = (prop: string): boolean =>
	prop === 'color' || prop === 'opacity' || prop === '-webkit-text-fill-color';

/**
 * Resolves a utility's compiled CSS to the declarations that actually paint
 * at rest (see the policy block above). Exported so the synthetic-CSS tests
 * below can pin each policy clause directly. Throws `Unresolvable utility on
 * a DrawerDescription: <utility>` when no rule targets the class at all
 * (round 4), and `Unresolvable generated colour for <utility>: <value>` when
 * any colour declaration under the class's rules cannot be resolved
 * (fail-closed sweep, rule 5).
 */
export const compiledStyleFromCss = (
	compiledCss: string,
	utility: string,
	theme: 'light' | 'dark',
): CompiledUtilityStyle => {
	const root = postcss.parse(compiledCss, { from: undefined });
	const needle = `.${escapeClassName(utility)}`;

	let mentioned = false;
	root.walkRules((rule) => {
		if (rule.selector.includes(needle)) {
			mentioned = true;
		}
	});
	if (!mentioned) {
		throw new Error(`Unresolvable utility on a DrawerDescription: ${utility}`);
	}

	const resting = new Map<string, string>();
	const sweep: { prop: string; value: string }[] = [];

	const collectRuleDeclarations = (
		rule: postcss.Rule,
		supply: boolean,
	): void => {
		for (const node of rule.nodes ?? []) {
			if (
				!(node instanceof postcss.Declaration) ||
				!isRelevantProperty(node.prop)
			) {
				continue;
			}
			const value = node.value.trim();
			if (supply) {
				resting.set(node.prop, value);
			}
			sweep.push({ prop: node.prop, value });
		}
	};

	const visit = (node: postcss.Container, underExactMatch: boolean): void => {
		for (const child of node.nodes ?? []) {
			if (child instanceof postcss.Declaration) {
				if (underExactMatch && isRelevantProperty(child.prop)) {
					sweep.push({ prop: child.prop, value: child.value.trim() });
				}
				continue;
			}
			if (child instanceof postcss.AtRule) {
				visit(child, underExactMatch);
				continue;
			}
			if (!(child instanceof postcss.Rule)) {
				continue;
			}
			const exact = isExactClassSelector(child.selector, needle);
			const darkGate =
				underExactMatch && DARK_GATE_SELECTOR_PATTERN.test(child.selector);
			const conditional = isConditionalAtRuleAncestor(child);
			if (exact) {
				collectRuleDeclarations(child, !conditional);
				visit(child, true);
			} else if (darkGate) {
				collectRuleDeclarations(child, theme === 'dark' && !conditional);
				visit(child, true);
			} else {
				visit(child, underExactMatch);
			}
		}
	};
	visit(root, false);

	for (const declaration of sweep) {
		if (declaration.prop === 'opacity') {
			continue;
		}
		const value = declaration.value;
		if (value === 'currentcolor') {
			continue;
		}
		const variableMatch = /^var\((--[\w-]+)\)$/.exec(value);
		try {
			if (variableMatch) {
				resolveColor(variableMatch[1], theme);
			} else {
				parseColorValue(value, utility);
			}
		} catch (error) {
			throw new Error(
				`Unresolvable generated colour for ${utility}: ${value}`,
				{ cause: error },
			);
		}
	}

	const style: CompiledUtilityStyle = {
		color: null,
		textFillColor: null,
		opacity: null,
	};
	for (const [prop, value] of resting) {
		if (prop === 'color') {
			style.color = value;
		} else if (prop === 'opacity') {
			style.opacity = value;
		} else if (prop === '-webkit-text-fill-color') {
			style.textFillColor = value;
		}
	}
	return style;
};

const compiledUtilityStyleCache = new Map<
	string,
	Promise<CompiledUtilityStyle>
>();

// One compiler over the real app.css, shared by every utility build. Building
// per candidate against a single compiler is an order of magnitude faster than
// re-parsing the whole stylesheet per candidate.
let compilerPromise: Promise<Awaited<ReturnType<typeof compile>>> | null = null;
const getCompiler = (): Promise<Awaited<ReturnType<typeof compile>>> => {
	if (compilerPromise === null) {
		compilerPromise = compile(tailwindCompilerInput, {
			base: path.resolve(process.cwd(), 'src/styles'),
			loadStylesheet: async (id) => loadAppStylesheet(id),
		});
	}
	return compilerPromise;
};

const compiledStyleFromUtility = (
	utility: string,
	theme: 'light' | 'dark',
): Promise<CompiledUtilityStyle> => {
	const cacheKey = `${utility}|${theme}`;
	const cached = compiledUtilityStyleCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const compiled = (async (): Promise<CompiledUtilityStyle> => {
		const compiler = await getCompiler();
		const generatedCss = compiler.build([utility]);
		const cssWithoutBanner = generatedCss.replace(/^\/\*![\s\S]*?\*\/\s*/, '');
		return compiledStyleFromCss(cssWithoutBanner, utility, theme);
	})();
	compiledUtilityStyleCache.set(cacheKey, compiled);
	return compiled;
};

type ResolvedClassName = {
	/** The colour a colour utility declares, or null when the className
	 * declares none (typography utilities, app component classes without a
	 * colour declaration, ...). */
	color: Rgba | null;
	/** The alpha factor an `opacity-*` utility declares, or null. */
	opacity: number | null;
};

const resolveClassName = async (
	className: string,
	theme: 'light' | 'dark',
): Promise<ResolvedClassName> => {
	let resolved: Rgba | null = null;
	let opacity: number | null = null;
	for (const utility of className.split(/\s+/)) {
		if (utility === '') {
			continue;
		}

		const compiledStyle = await compiledStyleFromUtility(utility, theme);
		if (compiledStyle.opacity !== null) {
			const percentageMatch = /^([\d.]+)%$/.exec(compiledStyle.opacity);
			const parsedOpacity =
				percentageMatch === null
					? Number(compiledStyle.opacity)
					: Number(percentageMatch[1]) / 100;
			if (!Number.isFinite(parsedOpacity)) {
				throw new Error(
					`Unresolvable generated opacity for ${utility}: ${compiledStyle.opacity}`,
				);
			}
			opacity = parsedOpacity;
		}

		// `-webkit-text-fill-color` paints the text in WebKit/Blink instead of
		// `color` when both are set (round 7 M7). `currentcolor` is its
		// default: an explicit no-op override, not a blind spot. Every value
		// that reaches this point has already survived the parser's
		// fail-closed sweep (round 9 rule 5), so an unresolvable colour throws
		// in compiledStyleFromCss by name instead of here.
		const overrideDeclaration =
			compiledStyle.textFillColor ?? compiledStyle.color;
		if (
			overrideDeclaration === null ||
			overrideDeclaration === 'currentcolor'
		) {
			continue;
		}

		const variableMatch = /^var\((--[\w-]+)\)$/.exec(overrideDeclaration);
		resolved = variableMatch
			? resolveColor(variableMatch[1], theme)
			: parseColorValue(overrideDeclaration, utility);
	}
	return { color: resolved, opacity };
};

// Round 5 "fourth door": an `opacity-*` utility does not change `color`, but
// it paints the text at that alpha over the surface, collapsing the effective
// contrast. Fold it into the foreground's alpha — whether that foreground is
// the resolved utility colour or, for a BARE `opacity-*` (which softens the
// existing colour), the primitive's default (round 7 I2).
const withOpacity = (color: Rgba, opacity: number | null): Rgba =>
	opacity !== null && opacity < 1 ? { ...color, a: color.a * opacity } : color;

// The effective painted colour of a (possibly translucent) foreground over the
// given background, which is what the contrast ratio must be computed against.
const effectiveForeground = (foreground: Rgba, background: Rgba): Rgba =>
	foreground.a >= 1 ? foreground : alphaComposite(foreground, background);

const CALL_SITES = findDrawerDescriptionCallSites();

describe('drawer description text contrast (#1043)', () => {
	test.each(['light', 'dark'] as const)(
		'resolves every semantic text colour through the real Tailwind theme in %s mode',
		async (theme) => {
			const resolution = await resolveClassName('text-primary text-sm', theme);
			expect(resolution.color).toEqual(resolveColor('--primary', theme));
		},
	);

	test('ignores generated typography utilities without mistaking them for colours', async () => {
		const resolution = await resolveClassName(
			'text-sm text-center text-balance',
			'light',
		);
		expect(resolution.color).toBeNull();
		expect(resolution.opacity).toBeNull();
	});

	test('fails closed when Tailwind cannot resolve a className utility', async () => {
		await expect(async () =>
			resolveClassName('text-unrecognised-colour', 'light'),
		).rejects.toThrow(
			'Unresolvable utility on a DrawerDescription: text-unrecognised-colour',
		);
	});

	test('names a generated utility whose colour token cannot be resolved', async () => {
		const unresolvedToken = '--publy-' + 'not-declared';
		const unresolvedUtility = `text-(${unresolvedToken})`;
		await expect(async () =>
			resolveClassName(unresolvedUtility, 'light'),
		).rejects.toThrow(
			`Unresolvable generated colour for ${unresolvedUtility}: ` +
				`var(${unresolvedToken})`,
		);
	});

	// Round 7 I1: the round-6 "non-colour utility" test pinned the walker's
	// blindness — it asserted that app component classes in the first
	// `@layer components` block resolve NO colour, when each of them declares
	// one in app.css. The table below asserts every such class resolves the
	// colour it actually declares. `animate-in`/`fade-in` (tw-animate
	// utilities with genuinely no colour declaration) stay colourless — the
	// inverse direction, asserted together so neither can regress.
	test.each([
		['publy-type-helper', '--publy-foreground-subtle'],
		['publy-field-helper', '--publy-foreground-subtle'],
		['publy-type-eyebrow', '--publy-foreground-subtle'],
		['publy-field-error', '--publy-danger'],
		['publy-toast-description', '--publy-foreground-secondary'],
		['publy-drawer-description', '--publy-foreground-secondary'],
		['publy-danger-zone-row-description', '--publy-foreground-secondary'],
		['publy-marketing-eyebrow', '--publy-foreground-muted'],
	] as const)(
		'resolves the real colour %s declares in app.css',
		async (utility, token) => {
			const resolution = await resolveClassName(utility, 'light');
			expect(resolution.color).toEqual(resolveColor(token, 'light'));
			expect(resolution.opacity).toBeNull();
		},
	);

	test.each(['animate-in', 'fade-in'] as const)(
		'resolves the real tw-animate class %s as genuinely non-colour',
		async (utility) => {
			const resolution = await resolveClassName(utility, 'light');
			expect(resolution.color).toBeNull();
			expect(resolution.opacity).toBeNull();
		},
	);

	test('resolves a Tailwind built-in palette colour without weakening fail-closed', async () => {
		// Pinned against an INDEPENDENT source of truth (round 7 M3): a real
		// Chromium paints oklch(63.7% 0.237 25.331) — Tailwind v4's default
		// red-500 — as rgb(251, 44, 54) (#fb2c36), matching Tailwind's docs
		// value. The conversion must match the browser, not merely itself.
		expect((await resolveClassName('text-red-500', 'light')).color).toEqual({
			r: 251,
			g: 44,
			b: 54,
			a: 1,
		});
		// A genuinely unknown utility still throws by name.
		await expect(async () =>
			resolveClassName('text-quantum-42', 'light'),
		).rejects.toThrow(
			'Unresolvable utility on a DrawerDescription: text-quantum-42',
		);
	});

	// Round 5 "fourth door": `opacity-*` paints the text translucent without
	// changing `color`, collapsing the effective contrast. The guard must fold
	// it in, not report the opaque colour.
	test('folds an opacity utility into the measured foreground', async () => {
		const resolution = await resolveClassName(
			'text-primary opacity-50',
			'light',
		);
		const color = resolution.color;
		expect(color).not.toBeNull();
		if (color !== null) {
			expect(withOpacity(color, resolution.opacity).a).toBeCloseTo(0.5, 5);
		}
	});

	// Round 7 I2: a BARE `opacity-*` — the class an author writes to soften
	// the existing colour — declares no colour utility at all, so the fold
	// must apply to the primitive's default. Otherwise the call-site guard
	// reports the opaque default and the text paints at ~2.6:1.
	test('folds a bare opacity utility into the primitive default', async () => {
		const primitiveToken = tokenFromColorDeclaration(
			'.publy-drawer-description',
		);
		for (const theme of ['light', 'dark'] as const) {
			const resolution = await resolveClassName('opacity-50', theme);
			expect(resolution.color).toBeNull();
			expect(resolution.opacity).toBeCloseTo(0.5, 5);
			const background = compositedDrawerBackground(theme);
			const foreground = withOpacity(
				resolveColor(primitiveToken, theme),
				resolution.opacity,
			);
			expect(
				contrastRatio(effectiveForeground(foreground, background), background),
				`bare opacity-50 on the primitive default in ${theme} theme`,
			).toBeLessThan(SMALL_TEXT_CONTRAST_FLOOR);
		}
	});

	// Round 7 M7: `-webkit-text-fill-color` paints the text in WebKit/Blink
	// instead of `color` — reachable through an arbitrary-property utility. It
	// must win over a coexisting colour utility exactly as it would in the
	// browser, while `currentcolor` (its default) stays a no-op rather than
	// reddening a class that merely wrote the default explicitly.
	test('-webkit-text-fill-color overrides a colour utility in the measured foreground', async () => {
		const resolution = await resolveClassName(
			'text-primary [-webkit-text-fill-color:#' + 'ff0000]',
			'light',
		);
		expect(resolution.color).toEqual({ r: 255, g: 0, b: 0, a: 1 });
	});

	test('-webkit-text-fill-color:currentcolor is a no-op override', async () => {
		const resolution = await resolveClassName(
			'text-primary [-webkit-text-fill-color:' + 'currentcolor]',
			'light',
		);
		expect(resolution.color).toEqual(resolveColor('--primary', 'light'));
	});

	// Pins the round-4 utility-resolution behaviours so the real app.css
	// compiler input (round 5 I5) cannot regress them: semantic tokens still
	// resolve, arbitrary hex values still resolve exactly, and the genuinely
	// unresolvable colour shapes still fail closed by name. Two pins changed
	// with the round-9 parser rewrite, each because the OLD pin encoded the
	// old walker's blindness rather than a browser fact:
	//   - `dark:text-primary` used to resolve --primary in the LIGHT theme
	//     because the substring walker treated the nested `&:is(.dark *)`
	//     rule as the class itself. The rule is a THEME gate: in light mode
	//     the browser paints the default, so the class now resolves no
	//     resting colour in light — and --primary in dark, where it actually
	//     paints (round 9 rule 4).
	//   - `text-primary!` used to throw because the value regex could not
	//     read `!important` values. `!important` is a cascade-priority flag,
	//     not part of the value — the class paints --primary exactly like
	//     `text-primary` (round 8 M5), and the five app classes of M5 fail
	//     closed on the same shape.
	// The design-system guard scans every src/ file for raw colour literals, so
	// these two FIXTURE utilities — which exist to prove that raw colours are
	// still RESOLVED correctly — are built by concatenation rather than written
	// as one literal. Otherwise the guard would flag its own test fixtures.
	const rawHexUtility = 'text-[#' + '777777]';
	const rawNamedUtility = '[' + 'color' + ':' + 'red]';

	test('keeps the round-4 resolution behaviours intact', async () => {
		expect((await resolveClassName('text-foreground', 'light')).color).toEqual(
			resolveColor('--foreground', 'light'),
		);
		expect(
			(await resolveClassName('text-muted-foreground', 'light')).color,
		).toEqual(resolveColor('--muted-foreground', 'light'));
		expect((await resolveClassName(rawHexUtility, 'light')).color).toEqual({
			r: 0x77,
			g: 0x77,
			b: 0x77,
			a: 1,
		});
		expect(
			(await resolveClassName('dark:text-primary', 'light')).color,
		).toBeNull();
		expect((await resolveClassName('dark:text-primary', 'dark')).color).toEqual(
			resolveColor('--primary', 'dark'),
		);
		expect((await resolveClassName('text-primary!', 'light')).color).toEqual(
			resolveColor('--primary', 'light'),
		);
		for (const utility of ['text-primary/50', rawNamedUtility]) {
			await expect(async () =>
				resolveClassName(utility, 'light'),
			).rejects.toThrow('Unresolvable generated colour');
		}
	});

	// ---- Synthetic-CSS policy pins (round 9 rewrite) -----------------------
	//
	// compiledStyleFromCss is exported so each clause of the resting-style
	// policy can be pinned on a minimal synthetic stylesheet, independently of
	// the real app.css. Each test here reproduces a round-8 review scenario
	// verbatim: the old substring walker answered with the WRONG colour (the
	// variant's) for every one of these inputs and read green while the text
	// painted 2.51:1.
	test('a :hover variant never supplies the resting colour (round 8 I1)', () => {
		const style = compiledStyleFromCss(
			'.x { color: var(--publy-foreground-subtle); }\n' +
				'.x:hover { color: var(--publy-foreground); }',
			'x',
			'light',
		);
		expect(style.color).toBe('var(--publy-foreground-subtle)');
	});

	test('an attribute variant never supplies the resting colour (round 8 I1)', () => {
		const style = compiledStyleFromCss(
			'.x { color: var(--publy-foreground-subtle); }\n' +
				".x[data-active='true'] { color: var(--publy-foreground); }",
			'x',
			'light',
		);
		expect(style.color).toBe('var(--publy-foreground-subtle)');
	});

	test('a @media-nested rule never supplies the resting colour (round 8 I1)', () => {
		const style = compiledStyleFromCss(
			'.x { color: var(--publy-foreground-subtle); }\n' +
				'@media (max-width: 767px) { .x { color: var(--publy-foreground); } }',
			'x',
			'light',
		);
		expect(style.color).toBe('var(--publy-foreground-subtle)');
	});

	test('a @supports-nested rule never supplies the resting colour (round 8 I1)', () => {
		const style = compiledStyleFromCss(
			'.x { color: var(--publy-foreground-subtle); }\n' +
				'@supports (display: grid) { .x { color: var(--publy-foreground); } }',
			'x',
			'light',
		);
		expect(style.color).toBe('var(--publy-foreground-subtle)');
	});

	test('a rule nested inside a plain rule resolves its colour (round 8 I2)', () => {
		const style = compiledStyleFromCss(
			'.parent { .x { color: #ff0000; } }',
			'x',
			'light',
		);
		expect(style.color).toBe('#ff0000');
	});

	test('last-wins honours source order across nesting (round 8 I2)', () => {
		const style = compiledStyleFromCss(
			'.x { color: #111111; }\n' + '.parent { .x { color: #ff0000; } }',
			'x',
			'light',
		);
		expect(style.color).toBe('#ff0000');
	});

	test('a statement at-rule does not absorb the following rule (round 8 M6)', () => {
		const style = compiledStyleFromCss(
			'@layer properties;\n.x { color: #ff0000; }',
			'x',
			'light',
		);
		expect(style.color).toBe('#ff0000');
	});

	test('a themed dark gate supplies the resting colour in dark mode only (round 9 rule 4)', () => {
		const gated =
			'.dark\\:x { &:is(.dark *) { color: var(--publy-foreground); } }';
		expect(compiledStyleFromCss(gated, 'dark:x', 'light').color).toBeNull();
		expect(compiledStyleFromCss(gated, 'dark:x', 'dark').color).toBe(
			'var(--publy-foreground)',
		);
	});

	test('an !important declaration resolves the same colour as the plain one (round 8 M5)', () => {
		const style = compiledStyleFromCss(
			'.x { color: var(--publy-foreground-muted) !important; }',
			'x',
			'light',
		);
		expect(style.color).toBe('var(--publy-foreground-muted)');
	});

	test('a relative ./drawer import is enumerated (round 8 M3)', () => {
		const source = "import { DrawerDescription } from './drawer';";
		const file = path.join('src', 'components', 'ui', '_fixture.tsx');
		expect(drawerDescriptionTagNames(source, file)).toEqual([
			'DrawerDescription',
		]);
	});

	test('a relative import of a different module is not enumerated (round 8 M3)', () => {
		const source = "import { Foo } from './foo';";
		const file = path.join('src', 'components', 'ui', '_fixture.tsx');
		expect(drawerDescriptionTagNames(source, file)).toEqual([]);
	});

	// Round 8 M5: the round-7 declaration regex fail-closed five app classes —
	// five on `!important` values (the important flag is cascade priority, not
	// part of the colour) and two on legitimate CONTEXTUAL tokens declared on
	// a component rule rather than in :root/html.dark. All seven must resolve
	// through the REAL pipeline now, and each must resolve the colour it
	// actually declares — not silently null.
	test.each([
		['app-shell-tenant-pill', '--publy-foreground-muted'],
		['app-shell-workspace-pill', '--publy-foreground-muted'],
		['app-shell-topbar-action-btn', '--publy-foreground-muted'],
		['app-shell-workspace', '--publy-foreground'],
		['publy-toast-icon', '--publy-toast-accent'],
		['publy-profile-icon-tile', '--publy-icon-tile-fg'],
	] as const)(
		'resolves the round-8 M5 class %s through the real pipeline',
		async (utility, token) => {
			const resolution = await resolveClassName(utility, 'light');
			expect(resolution.color).toEqual(resolveColor(token, 'light'));
		},
	);

	test('app-shell-topbar resolves no colour — it declares none (round 8 M5)', async () => {
		// The round-7 substring walker leaked the SIBLING
		// `.app-shell-topbar-action-btn`'s `!important` value into this class
		// and fail-closed on it. The class itself declares no color; the
		// exact-match resolver must not throw, and must not invent one.
		const resolution = await resolveClassName('app-shell-topbar', 'light');
		expect(resolution.color).toBeNull();
	});

	// Round 5 I2: a className smuggled through a prop spread must fail closed
	// by name instead of being measured as the compliant default.
	test('fails closed on a className arriving through a prop spread', () => {
		expect(() =>
			extractClassName(' {...{ className: "text-primary" }}', 'a.tsx', 1),
		).toThrow('cannot resolve');
		expect(() => extractClassName(' {...props} ', 'a.tsx', 2)).toThrow(
			'cannot resolve',
		);
		// A plain literal still resolves.
		expect(extractClassName(' className="text-primary"', 'a.tsx', 3)).toBe(
			'text-primary',
		);
	});

	// Round 5 I3: an inline style that sets `color` is invisible to the source
	// model and must fail closed; a non-colour style stays allowed.
	test('fails closed on an inline style that sets color', () => {
		expect(() =>
			extractClassName(
				' className="x" style={{ color: "var(--publy-primary)" }}',
				'a.tsx',
				1,
			),
		).toThrow('inline style');
		expect(
			extractClassName(' className="x" style={{ marginTop: 8 }}', 'a.tsx', 2),
		).toBe('x');
	});

	// Round 5 I6: the app compiles CSS with @tailwindcss/vite's pinned
	// `tailwindcss`, while the guard compiles with apps/front's direct devDep.
	// Nothing may let those two drift apart — a vite bump without a matching
	// devDep bump would silently give the guard a compiler the app no longer
	// uses.
	test('the guard and the app compile with the same tailwindcss version', () => {
		const directVersion = (
			JSON.parse(
				readFileSync(
					path.join(findPackageRoot('tailwindcss'), 'package.json'),
					'utf8',
				),
			) as { version: string }
		).version;
		const vitePackageJson = JSON.parse(
			readFileSync(
				path.join(findPackageRoot('@tailwindcss/vite'), 'package.json'),
				'utf8',
			),
		) as { dependencies: { tailwindcss: string } };
		expect(directVersion).toBe(vitePackageJson.dependencies.tailwindcss);
	});

	test.each(DESCRIPTION_SELECTORS)(
		'%s clears the 4.5:1 small-text floor on every opaque surface and the composited drawer surface in both themes',
		(selector) => {
			const token = tokenFromColorDeclaration(selector);

			for (const theme of ['light', 'dark'] as const) {
				const foreground = resolveColor(token, theme);
				for (const surfaceToken of SURFACE_TOKENS) {
					expect(
						contrastRatio(foreground, resolveColor(surfaceToken, theme)),
						`${selector} on ${surfaceToken} in ${theme} theme`,
					).toBeGreaterThanOrEqual(SMALL_TEXT_CONTRAST_FLOOR);
				}
				expect(
					contrastRatio(foreground, compositedDrawerBackground(theme)),
					`${selector} on the composited drawer surface in ${theme} theme`,
				).toBeGreaterThanOrEqual(SMALL_TEXT_CONTRAST_FLOOR);
			}
		},
	);

	test('enumerates exactly the real DrawerDescription call sites, tied to the browser inventory', () => {
		// The enumeration must find every real consumer AND nothing extra, so a
		// glob/parse regression can never silently empty the call-site guard and
		// a new drawer cannot be forgotten in the shared inventory (round 5 I4).
		// Files are compared as a set, then each file's OCCURRENCE COUNT is
		// checked against the inventory (round 7 M6): a second, compliant
		// description in an existing file — a nested confirm dialog — fails
		// with a message naming the file and the remedy instead of a confusing
		// list diff.
		const enumerated = new Map<string, number>();
		for (const callSite of CALL_SITES) {
			const relative = callSite.file.replace(
				path.resolve(process.cwd()) + path.sep,
				'',
			);
			enumerated.set(relative, (enumerated.get(relative) ?? 0) + 1);
		}

		const inventory = new Map<string, number>();
		for (const consumer of CONSUMERS) {
			inventory.set(consumer.file, (inventory.get(consumer.file) ?? 0) + 1);
		}

		expect([...enumerated.keys()].sort()).toEqual([...inventory.keys()].sort());

		for (const [file, expectedCount] of inventory) {
			const foundCount = enumerated.get(file) ?? 0;
			expect(
				foundCount,
				`${file} has ${foundCount} DrawerDescription call site(s) but the ` +
					`browser inventory lists ${expectedCount} — add one inventory ` +
					'entry (distinct testId) per call site and one e2e drawer opener ' +
					'for each',
			).toBe(expectedCount);
		}

		const testIds = CONSUMERS.map((consumer) => consumer.testId);
		expect(new Set(testIds).size).toBe(testIds.length);
	});

	test.each(
		CALL_SITES.map(
			(callSite, index) =>
				[index, callSite.file, callSite.line, callSite] as const,
		),
	)(
		'every DrawerDescription call site keeps 4.5:1 on the composited drawer surface (site #%i: %s:%s)',
		async (_index, _file, _line, callSite) => {
			const primitiveToken = tokenFromColorDeclaration(
				'.publy-drawer-description',
			);

			for (const theme of ['light', 'dark'] as const) {
				const defaultForeground = resolveColor(primitiveToken, theme);
				const resolution =
					callSite.className === null
						? null
						: await resolveClassName(callSite.className, theme);
				// A className that resolves NO colour override (typography
				// utilities, animation classes, ...) keeps the primitive's
				// default — a resolution, not a silent substitution (round 7
				// I1): a class that DOES declare a colour now resolves that
				// colour, so the fallback is only reachable when the className
				// genuinely declares none. A bare `opacity-*` (round 7 I2)
				// declares no colour but softens whichever colour paints —
				// folded in below.
				const baseForeground =
					resolution === null || resolution.color === null
						? defaultForeground
						: resolution.color;
				const foreground = withOpacity(
					baseForeground,
					resolution === null ? null : resolution.opacity,
				);
				const background = compositedDrawerBackground(theme);
				expect(
					contrastRatio(
						effectiveForeground(foreground, background),
						background,
					),
					`${callSite.file}:${callSite.line} (className: ${callSite.className}) in ${theme} theme`,
				).toBeGreaterThanOrEqual(SMALL_TEXT_CONTRAST_FLOOR);
			}
		},
	);
});
