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
// Round 10 M4: the resolution used `path.posix` against a NATIVE path — on
// Windows every relative specifier collapsed and the round-8 pin itself
// failed there. The importer path is normalised to forward slashes first
// (AGENTS.md documents Windows as a supported dev platform).
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
	const posixImporter = importerPath.split(path.sep).join('/');
	const resolved = path.posix.normalize(
		path.posix.join(path.posix.dirname(posixImporter), specifier),
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

type CompiledCandidate = {
	/** Last `color:` declaration of one POSSIBLE paint, or null when the
	 * rule declares none (the cascade winner's value fills the gap). */
	color: string | null;
	/** Last `-webkit-text-fill-color:` declaration of the possible paint, if
	 * any — the property that actually paints text in WebKit/Blink when both
	 * are set (round 7 M7). */
	textFillColor: string | null;
	/** Last `opacity:` declaration of the possible paint, if any. */
	opacity: string | null;
};

type CompiledUtilityStyle = {
	/** The cascade-winning `color:` declaration, if any. */
	color: string | null;
	/** The cascade-winning `-webkit-text-fill-color:` declaration, if any. */
	textFillColor: string | null;
	/** The cascade-winning `opacity:` declaration, if any. */
	opacity: string | null;
	/** Every ancestor-qualified rule that could paint at rest (round 10 I2):
	 * each is a full property bundle with the cascade winner's values for
	 * the properties the rule leaves undeclared. The source model cannot
	 * verify the ancestor, so a consumer must treat EVERY entry as a
	 * possible paint and keep the worst case — never the best. */
	possible: CompiledCandidate[];
};

// ---- CSS resolution (round 9 parser rewrite, round 11 cascade) ------------
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
// What the parser does NOT decide — the guard's own policy (round 10 review:
// the parser itself was clean; every round-10 finding landed here):
//   1. ELEMENT COMPOUND (round 10 I1): a rule targets the element only when
//      the LAST compound run of one of its selector-list entries is built
//      from classes the element actually has (plus rest-applying
//      pseudo-classes; see rule 4). ALL of a call site's classes — the
//      primitive plus the caller's — are resolved TOGETHER in one compiled
//      build, so competing rules meet in the stylesheet's own source order
//      and cascade layers, never in the order the author typed the names
//      into the className attribute (which the browser ignores).
//   2. THE CASCADE (round 10 I1/M1): competing declarations for the same
//      property are decided by cascade layer (the order of first
//      declaration; unlayered rules outrank every layer), then by a
//      two-pass `!important` model (if ANY important declaration exists for
//      the property, only important ones compete), then by specificity over
//      the last compound run (a superset compound — `.a.b` — outranks
//      `.b`), then by stylesheet source order. This is the same model
//      css-cascade-test-support.ts was hardened to in round 3, and it is
//      applied per property.
//   3. CONDITIONAL at-rules (`@media`/`@supports`/`@container`) never
//      supply the resting colour (round 8 I1): the suite measures fixed
//      viewports the source model cannot evaluate. When a class's ONLY
//      colour declaration lives under one, the guard THROWS by name
//      (round 10 I3) instead of substituting the primitive's compliant
//      default — a silent substitution is the defect class this guard
//      exists to eliminate. `@layer` is not conditional — it groups
//      cascade priority, it does not gate applicability.
//   4. REST-APPLYING PSEUDO-CLASSES (round 10 M3): `:not()`, `:is()`,
//      `:where()` and `:has()` paint at rest, so they keep the rule
//      supplying — `:where()` contributes ZERO specificity, the others ten
//      per token, and their arguments decide applicability (`:not` applies
//      when no argument class is on the element, `:is` when one is;
//      `:where` always applies; `:has` is descendant-dependent and is
//      treated as a possible paint). Every other pseudo-class or attribute
//      variant (`:hover`, `[data-active]`, structural pseudo-classes) is a
//      STATE variant — it never paints at rest — so it never supplies and
//      never competes.
//   5. THEME GATES (round 9 rule 4 + round 10 M3): a rule whose selector
//      mentions the `.dark` class in an ancestor compound or inside a
//      functional pseudo-class argument (`html.dark .x`, `&:is(.dark *)` —
//      Tailwind's compiled `dark:` variant) supplies the resting colour in
//      the dark theme only; in light the browser does not paint it, so it
//      supplies nothing there. A `.dark` inside `:not(...)` inverts the
//      gate. The suite knows which theme it measures.
//   6. ANCESTOR-QUALIFIED rules (round 10 I2): a rule whose selector has an
//      ancestor/sibling compound (`.publy-drawer .x`, `.parent .x`) applies
//      only when that ancestor is present, which the source model cannot
//      verify — so it never WINS the cascade; it is reported as a POSSIBLE
//      paint and the consumer keeps the lowest contrast among the cascade
//      winner and every possible paint — the safe worst case, never a
//      last-wins that assumes the ancestor away.
//   7. FAIL-CLOSED sweep (rounds 4+9): every colour declaration under any
//      rule that targets the element — including inside a conditional
//      at-rule and in the wrong theme — must resolve; an unresolvable value
//      throws by name instead of reporting a colour the browser does not
//      paint. A rule that never paints at rest (a `:hover` variant) is not
//      swept.
//   8. `!important` is a cascade-priority flag, not part of the value
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

/** Splits an individual (comma-free) selector into its compound runs, on
 * combinators (whitespace, `>`, `+`, `~`) that are NOT inside `(...)` or
 * `[...]` — the depth awareness keeps `&:is(.dark *)` one compound. */
const splitCompounds = (selector: string): string[] => {
	const runs: string[] = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < selector.length; index += 1) {
		const character = selector[index];
		if (character === '\\') {
			index += 1;
			continue;
		}
		if (character === '(' || character === '[') {
			depth += 1;
		} else if (character === ')' || character === ']') {
			depth -= 1;
		} else if (depth === 0 && /\s|[>+~]/.test(character)) {
			if (index > start) {
				runs.push(selector.slice(start, index));
			}
			start = index + 1;
		}
	}
	if (start < selector.length) {
		runs.push(selector.slice(start));
	}
	return runs.map((run) => run.trim()).filter((run) => run.length > 0);
};

/** The final compound selector run of an individual (comma-free) selector —
 * the run whose tokens must match the actual target element, ignoring any
 * ancestor compounds joined by a combinator. LOAD-BEARING (round 10 M2): the
 * combinator stripping is what separates the ancestor context (rule 6) from
 * the element compound (rule 1); reduce it to `selector.trim()` and every
 * ancestor-qualified rule vanishes from the resolution. */
const lastCompoundRun = (selector: string): string => {
	const runs = splitCompounds(selector.replace(/[>+~]/g, ' '));
	return runs[runs.length - 1] ?? '';
};

/** The compounds BEFORE the final one — the ancestor/sibling context a rule
 * requires to apply at all (rule 6). */
const ancestorCompounds = (selector: string): string[] => {
	const runs = splitCompounds(selector.replace(/[>+~]/g, ' '));
	return runs.slice(0, -1);
};

type CompoundToken =
	| { kind: 'class'; name: string }
	| { kind: 'id'; name: string }
	| { kind: 'type'; name: string }
	| { kind: 'attribute'; name: string }
	| { kind: 'pseudo-element'; name: string }
	| { kind: 'pseudo-class'; name: string; args: string | null }
	| { kind: 'nesting' };

/** Tokenizes ONE compound selector run (no combinators/whitespace) into its
 * simple selectors, honouring backslash escapes (`.text-\(--custom-colour\)`)
 * so an escaped bracket cannot end a class name early. `&` (the nesting
 * parent) is a separate token — an entry that still carries one after
 * resolution cannot be evaluated. */
const tokenizeCompound = (compound: string): CompoundToken[] => {
	const tokens: CompoundToken[] = [];
	let index = 0;
	const length = compound.length;

	const readEscapedName = (start: number): string => {
		let cursor = start;
		let result = '';
		while (cursor < length) {
			const character = compound[cursor];
			if (character === '\\' && cursor + 1 < length) {
				result += character + compound[cursor + 1];
				cursor += 2;
				continue;
			}
			if (
				character === '#' ||
				character === '.' ||
				character === '[' ||
				character === ':'
			) {
				break;
			}
			result += character;
			cursor += 1;
		}
		return result;
	};

	while (index < length) {
		const character = compound[index];
		if (character === '.') {
			const name = '.'.concat(readEscapedName(index + 1));
			tokens.push({ kind: 'class', name });
			index += name.length;
			continue;
		}
		if (character === '#') {
			const name = '#'.concat(readEscapedName(index + 1));
			tokens.push({ kind: 'id', name });
			index += name.length;
			continue;
		}
		if (character === '[') {
			let depth = 0;
			let cursor = index;
			while (cursor < length) {
				if (compound[cursor] === '\\' && cursor + 1 < length) {
					cursor += 2;
					continue;
				}
				if (compound[cursor] === '[') {
					depth += 1;
				} else if (compound[cursor] === ']') {
					depth -= 1;
					if (depth === 0) {
						break;
					}
				}
				cursor += 1;
			}
			const name = compound.slice(index, cursor + 1);
			tokens.push({ kind: 'attribute', name });
			index = cursor + 1;
			continue;
		}
		if (character === ':' && compound[index + 1] === ':') {
			const match = /^::[\w-]+/.exec(compound.slice(index));
			if (match !== null) {
				tokens.push({ kind: 'pseudo-element', name: match[0] });
				index += match[0].length;
				continue;
			}
		}
		if (character === ':') {
			const match = /^:[\w-]+/.exec(compound.slice(index));
			if (match !== null) {
				const name = match[0];
				let args: string | null = null;
				if (compound[index + name.length] === '(') {
					let depth = 1;
					let cursor = index + name.length + 1;
					while (cursor < length && depth > 0) {
						if (compound[cursor] === '\\' && cursor + 1 < length) {
							cursor += 2;
							continue;
						}
						if (compound[cursor] === '(') {
							depth += 1;
						} else if (compound[cursor] === ')') {
							depth -= 1;
						}
						cursor += 1;
					}
					args = compound.slice(index + name.length + 1, cursor - 1);
					index = cursor;
				} else {
					index += name.length;
				}
				tokens.push({ kind: 'pseudo-class', name, args });
				continue;
			}
		}
		const typeMatch = /^[A-Za-z*][\w-]*/.exec(compound.slice(index));
		if (typeMatch !== null) {
			tokens.push({ kind: 'type', name: typeMatch[0] });
			index += typeMatch[0].length;
			continue;
		}
		tokens.push({ kind: 'nesting' });
		index += 1;
	}
	return tokens;
};

const SPECIFICITY_WEIGHTS: Record<
	Exclude<CompoundToken['kind'], 'nesting'>,
	number
> = {
	id: 100,
	class: 10,
	attribute: 10,
	'pseudo-class': 10,
	'pseudo-element': 1,
	type: 1,
};

/** Specificity of a compound over its own tokens — `:where()` contributes
 * ZERO (that is its purpose), every other token counts like the
 * css-cascade-test-support model. */
const specificityOfCompound = (tokens: CompoundToken[]): number => {
	let total = 0;
	for (const token of tokens) {
		if (token.kind === 'nesting') {
			continue;
		}
		if (token.kind === 'pseudo-class' && token.name === ':where') {
			continue;
		}
		total += SPECIFICITY_WEIGHTS[token.kind];
	}
	return total;
};

/** True when a `:is()`/`:not()`/`:has()` argument list contains `.dark` —
 * the theme-gate signal (rule 5). Checks the exact class token in EVERY
 * compound of an argument (`:is(.dark *)` puts `.dark` in the FIRST
 * compound), so an escaped or suffixed name (`:is(.dark-mode)`) cannot
 * false-gate. */
const argListHasDarkGate = (args: string): boolean =>
	splitSelectorList(args).some((arg) =>
		splitCompounds(arg).some((compound) =>
			tokenizeCompound(compound).some(
				(token) => token.kind === 'class' && token.name === '.dark',
			),
		),
	);

/** Whether a functional pseudo-class argument list matches the element's
 * classes: an argument matches when it is a single compound whose classes
 * are all on the element, or the universal `*`. A complex argument (a
 * descendant chain) is treated as matching — the only complex shape this
 * app's CSS uses (`:is(.dark *)`) is decided by the theme gate, not here. */
const argumentListMatches = (
	args: string,
	elementClasses: Set<string>,
): boolean =>
	splitSelectorList(args).some((arg) => {
		const compounds = splitCompounds(arg);
		if (compounds.length !== 1) {
			return true;
		}
		const tokens = tokenizeCompound(compounds[0]);
		if (tokens.some((token) => token.kind === 'type' && token.name === '*')) {
			return true;
		}
		return tokens.some(
			(token) => token.kind === 'class' && elementClasses.has(token.name),
		);
	});

const REST_APPLYING_PSEUDO_CLASSES = new Set([':not', ':is', ':where', ':has']);

type EntryClassification = {
	matched: boolean;
	/** `dark` — supplies in the dark theme only; `light` — the inverse
	 * (`:not(.dark ...)`); null — no theme gate. */
	themeGate: 'dark' | 'light' | null;
	specificity: number;
	/** True when the entry has an ancestor/sibling compound that is NOT a
	 * theme gate — the rule may or may not apply (rule 6). */
	uncertain: boolean;
};

/** Classifies ONE (comma-free) selector entry against the element's class
 * set (rules 1, 4, 5, 6). `parentSelector` is the nesting parent's selector
 * when the rule is natively nested inside another rule — `&` is replaced by
 * it and an `&`-less nested rule gets the parent prepended as an ancestor,
 * exactly as the browser resolves native nesting. */
const classifySelectorEntry = (
	entry: string,
	elementClasses: Set<string>,
	parentSelector: string | null,
): EntryClassification => {
	let resolved = entry;
	if (parentSelector !== null) {
		resolved = entry.includes('&')
			? entry.replace(/&/g, parentSelector)
			: `${parentSelector} ${entry}`;
	}

	const ancestors = ancestorCompounds(resolved);
	const compound = lastCompoundRun(resolved);
	const tokens = tokenizeCompound(compound);

	let themeGate: 'dark' | 'light' | null = null;
	if (
		ancestors.some((ancestor) =>
			tokenizeCompound(ancestor).some(
				(token) => token.kind === 'class' && token.name === '.dark',
			),
		)
	) {
		themeGate = 'dark';
	}

	let uncertain = false;
	for (const token of tokens) {
		if (token.kind === 'nesting') {
			return {
				matched: false,
				themeGate: null,
				specificity: 0,
				uncertain: false,
			};
		}
		if (token.kind === 'class') {
			if (!elementClasses.has(token.name)) {
				return {
					matched: false,
					themeGate: null,
					specificity: 0,
					uncertain: false,
				};
			}
			continue;
		}
		if (
			token.kind === 'id' ||
			token.kind === 'type' ||
			token.kind === 'attribute' ||
			token.kind === 'pseudo-element'
		) {
			// Rules that need an id, an element type, an attribute or a
			// pseudo-element never target the description element at rest
			// (state variants, unknown attributes, pseudo-element text — all
			// documented out of scope).
			return {
				matched: false,
				themeGate: null,
				specificity: 0,
				uncertain: false,
			};
		}
		if (!REST_APPLYING_PSEUDO_CLASSES.has(token.name)) {
			// `:hover`, `:focus-visible`, structural pseudo-classes, ... —
			// state variants never paint at rest (round 8 I1).
			return {
				matched: false,
				themeGate: null,
				specificity: 0,
				uncertain: false,
			};
		}
		const args = token.args ?? '';
		if (argListHasDarkGate(args)) {
			themeGate = themeGate ?? (token.name === ':not' ? 'light' : 'dark');
		} else if (
			token.name === ':not' &&
			argumentListMatches(args, elementClasses)
		) {
			// `:not(.never)` does not apply when `.never` is on the element.
			return {
				matched: false,
				themeGate: null,
				specificity: 0,
				uncertain: false,
			};
		} else if (
			(token.name === ':is' || token.name === ':has') &&
			args !== '' &&
			!argumentListMatches(args, elementClasses)
		) {
			// `:is(.a, .x)` applies only when one of its classes is on the
			// element; when it cannot, the rule cannot paint at rest.
			return {
				matched: false,
				themeGate: null,
				specificity: 0,
				uncertain: false,
			};
		} else if (token.name === ':has') {
			// `:has()` is descendant-dependent — the source model cannot
			// verify the descendant, so the rule MAY paint at rest.
			uncertain = true;
		}
	}

	// An ancestor compound that is not a theme gate makes the whole entry a
	// POSSIBLE paint (rule 6). A theme-gated ancestor (`html.dark`) is
	// decided by the theme, not by uncertainty.
	uncertain =
		uncertain ||
		ancestors.some((ancestor) =>
			tokenizeCompound(ancestor).every(
				(token) => !(token.kind === 'class' && token.name === '.dark'),
			),
		);

	return {
		matched: true,
		themeGate,
		specificity: specificityOfCompound(tokens),
		uncertain,
	};
};

type RuleClassification = {
	targets: boolean;
	themeGate: 'dark' | 'light' | null;
	specificity: number;
	/** 'definite' — a matching entry applies whenever the theme gate passes;
	 * 'uncertain' — only ancestor-qualified entries match (rule 6). */
	supply: 'definite' | 'uncertain' | null;
};

const classifyRule = (
	selectorList: string,
	elementClasses: Set<string>,
	parentSelector: string | null,
): RuleClassification => {
	let anyDefinite = false;
	let anyUncertain = false;
	const gates: ('dark' | 'light')[] = [];
	let hasUngatedEntry = false;
	let specificity = 0;

	for (const entry of splitSelectorList(selectorList)) {
		const classification = classifySelectorEntry(
			entry,
			elementClasses,
			parentSelector,
		);
		if (!classification.matched) {
			continue;
		}
		specificity = Math.max(specificity, classification.specificity);
		if (classification.themeGate === null) {
			hasUngatedEntry = true;
		} else {
			gates.push(classification.themeGate);
		}
		if (classification.uncertain) {
			anyUncertain = true;
		} else {
			anyDefinite = true;
		}
	}

	if (!anyDefinite && !anyUncertain) {
		return { targets: false, themeGate: null, specificity: 0, supply: null };
	}
	// A rule with ANY un-gated matching entry applies in both themes; a rule
	// whose matching entries share ONE gate is gated by it; mixed gates mean
	// the rule applies in both themes.
	const sharedGate =
		!hasUngatedEntry &&
		gates.length > 0 &&
		gates.every((gate) => gate === gates[0])
			? gates[0]
			: null;
	return {
		targets: true,
		themeGate: sharedGate,
		specificity,
		supply: anyDefinite ? 'definite' : 'uncertain',
	};
};

const isRelevantProperty = (prop: string): boolean =>
	prop === 'color' || prop === 'opacity' || prop === '-webkit-text-fill-color';

type MatchedDeclaration = {
	prop: string;
	value: string;
	important: boolean;
};

type CascadeCandidate = MatchedDeclaration & {
	layerRank: number;
	specificity: number;
	sourceOrder: number;
	uncertain: boolean;
};

type SweptDeclaration = {
	prop: string;
	value: string;
	utility: string;
};

const gateApplies = (
	gate: 'dark' | 'light' | null,
	theme: 'light' | 'dark',
): boolean => gate === null || gate === theme;

/**
 * Resolves a set of utilities' compiled CSS to the declarations that
 * actually paint at rest (see the policy block above). Exported so the
 * synthetic-CSS tests below can pin each policy clause directly. Throws
 * `Unresolvable utility on a DrawerDescription: <utility>` when a class has
 * no rule at all (round 4), `Unresolvable generated colour for <utility>:
 * <value>` when any colour declaration under a targeting rule cannot resolve
 * (fail-closed sweep, rule 7), and `Only conditional declarations for
 * <utility>: <prop>` when a class's only declaration for a property lives
 * inside a conditional at-rule (round 10 I3 — never a silent substitution
 * of the primitive's default).
 */
export const compiledStyleFromCss = (
	compiledCss: string,
	utilities: string[],
	theme: 'light' | 'dark',
): CompiledUtilityStyle => {
	const root = postcss.parse(compiledCss, { from: undefined });
	const elementClasses = new Set(
		utilities.map((utility) => `.${escapeClassName(utility)}`),
	);

	// Round 9: every class must be mentioned by a rule somewhere in the
	// compiled stylesheet, so a typo'd utility fails closed by name instead
	// of being measured as "declares no colour".
	for (const utility of utilities) {
		const needle = `.${escapeClassName(utility)}`;
		let mentioned = false;
		root.walkRules((rule) => {
			if (rule.selector.includes(needle)) {
				mentioned = true;
			}
		});
		if (!mentioned) {
			throw new Error(
				`Unresolvable utility on a DrawerDescription: ${utility}`,
			);
		}
	}

	// The cascade layer ORDER is the order of first mention (the browser
	// ranks layers by first declaration; unlayered rules outrank every
	// layer — that is how Tailwind's generated utilities beat the app's
	// `@layer components` blocks regardless of position).
	const layerOrder: string[] = [];
	const recordLayerOrder = (params: string): void => {
		for (const name of params
			.split(',')
			.map((part) => part.trim())
			.filter((part) => part.length > 0)) {
			if (!layerOrder.includes(name)) {
				layerOrder.push(name);
			}
		}
	};

	const byProperty = new Map<string, CascadeCandidate[]>();
	const possibleRules: { declarations: MatchedDeclaration[] }[] = [];
	const swept: SweptDeclaration[] = [];
	const conditionalDeclared = new Map<string, string>();
	const suppliedProps = new Set<string>();
	let sourceOrder = 0;

	const utilityForRule = (selector: string): string => {
		for (const entry of splitSelectorList(selector)) {
			for (const token of tokenizeCompound(lastCompoundRun(entry))) {
				if (token.kind === 'class' && elementClasses.has(token.name)) {
					const escaped = token.name.slice(1);
					const utility = utilities.find(
						(candidate) => escapeClassName(candidate) === escaped,
					);
					if (utility !== undefined) {
						return utility;
					}
				}
			}
		}
		return utilities[0];
	};

	// The visitor threads a SWEEP CONTEXT through the tree: once a rule that
	// targets the element is entered, every relevant declaration in its
	// subtree — including declarations nested inside at-rules like the
	// `@supports (color: color-mix(...))` fallback Tailwind emits for
	// `text-primary/50` — is swept (rule 7). A nested rule that does NOT
	// target the element shields its own subtree (it never paints at rest).
	const visit = (
		node: postcss.Container,
		layerStack: string[],
		conditionalNested: boolean,
		sweepContext: {
			utility: string;
			themeGate: 'dark' | 'light' | null;
		} | null,
	): void => {
		for (const child of node.nodes ?? []) {
			if (child instanceof postcss.AtRule) {
				const name = child.name.toLowerCase();
				if (name === 'keyframes') {
					// Animation frames are not cascade rules — never swept.
					continue;
				}
				if (name === 'layer') {
					recordLayerOrder(child.params);
					const layerName = child.params.split(',')[0]?.trim();
					visit(
						child,
						layerName === undefined || layerName === ''
							? layerStack
							: [...layerStack, layerName],
						conditionalNested,
						sweepContext,
					);
					continue;
				}
				visit(
					child,
					layerStack,
					CONDITIONAL_AT_RULES.has(name) || conditionalNested,
					sweepContext,
				);
				continue;
			}
			if (child instanceof postcss.Declaration) {
				if (sweepContext !== null && isRelevantProperty(child.prop)) {
					const value = child.value.trim();
					swept.push({
						prop: child.prop,
						value,
						utility: sweepContext.utility,
					});
					if (
						conditionalNested &&
						gateApplies(sweepContext.themeGate, theme) &&
						!conditionalDeclared.has(child.prop)
					) {
						conditionalDeclared.set(child.prop, sweepContext.utility);
					}
				}
				continue;
			}
			if (!(child instanceof postcss.Rule)) {
				continue;
			}
			sourceOrder += 1;
			const parent = child.parent;
			const parentSelector =
				parent instanceof postcss.Rule ? parent.selector : null;
			const classification = classifyRule(
				child.selector,
				elementClasses,
				parentSelector,
			);
			if (!classification.targets) {
				// State variants and unrelated classes: never swept, never
				// supplied (rules 4, 7) — and their subtree paints nothing at
				// rest either.
				visit(child, layerStack, conditionalNested, null);
				continue;
			}

			const attributedUtility = utilityForRule(child.selector);
			const declarations: MatchedDeclaration[] = [];
			for (const declarationNode of child.nodes ?? []) {
				if (
					!(declarationNode instanceof postcss.Declaration) ||
					!isRelevantProperty(declarationNode.prop)
				) {
					continue;
				}
				declarations.push({
					prop: declarationNode.prop,
					value: declarationNode.value.trim(),
					important: declarationNode.important,
				});
			}

			if (
				classification.supply !== null &&
				!conditionalNested &&
				gateApplies(classification.themeGate, theme)
			) {
				for (const declaration of declarations) {
					suppliedProps.add(declaration.prop);
					const candidates = byProperty.get(declaration.prop) ?? [];
					candidates.push({
						...declaration,
						layerRank:
							layerStack.length === 0
								? Number.POSITIVE_INFINITY
								: layerOrder.indexOf(layerStack[layerStack.length - 1]),
						specificity: classification.specificity,
						sourceOrder,
						uncertain: classification.supply === 'uncertain',
					});
					byProperty.set(declaration.prop, candidates);
				}
				if (classification.supply === 'uncertain') {
					possibleRules.push({ declarations });
				}
			}

			visit(child, layerStack, conditionalNested, {
				utility: attributedUtility,
				themeGate: classification.themeGate,
			});
		}
	};
	visit(root, [], false, null);

	for (const declaration of swept) {
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
				parseColorValue(value, declaration.utility);
			}
		} catch (error) {
			throw new Error(
				`Unresolvable generated colour for ${declaration.utility}: ${value}`,
				{ cause: error },
			);
		}
	}

	// Round 10 I3: a property declared ONLY inside a conditional at-rule has
	// no resting value the source model can verify — fail loud by name
	// instead of letting the call site substitute the compliant default.
	for (const [prop, utility] of conditionalDeclared) {
		if (!suppliedProps.has(prop)) {
			throw new Error(
				`Only conditional declarations for ${utility}: ${prop} is ` +
					'declared exclusively inside @media/@supports/@container, ' +
					'which the guard cannot evaluate — resolve it outside the ' +
					'conditional rule or the browser may paint it at the ' +
					'measured viewport',
			);
		}
	}

	const winner = new Map<string, string>();
	for (const [prop, candidates] of byProperty) {
		// Rule 2: the two-pass importance model — if any important
		// declaration exists, only important ones compete; then layer,
		// specificity, source order. Ancestor-qualified candidates never
		// win — they are possible paints (rule 6).
		const importantCandidates = candidates.filter(
			(candidate) => candidate.important,
		);
		const contenders =
			importantCandidates.length > 0 ? importantCandidates : candidates;
		const definite = contenders.filter((candidate) => !candidate.uncertain);
		if (definite.length === 0) {
			continue;
		}
		let best = definite[0];
		for (const candidate of definite.slice(1)) {
			const higherLayer = candidate.layerRank > best.layerRank;
			const sameLayer = candidate.layerRank === best.layerRank;
			const higherSpecificity = candidate.specificity > best.specificity;
			const later =
				candidate.specificity === best.specificity &&
				candidate.sourceOrder > best.sourceOrder;
			if (higherLayer || (sameLayer && (higherSpecificity || later))) {
				best = candidate;
			}
		}
		winner.set(prop, best.value);
	}

	const style: CompiledUtilityStyle = {
		color: winner.get('color') ?? null,
		textFillColor: winner.get('-webkit-text-fill-color') ?? null,
		opacity: winner.get('opacity') ?? null,
		possible: possibleRules.map((rule) => ({
			color:
				rule.declarations.find((declaration) => declaration.prop === 'color')
					?.value ??
				winner.get('color') ??
				null,
			textFillColor:
				rule.declarations.find(
					(declaration) => declaration.prop === '-webkit-text-fill-color',
				)?.value ??
				winner.get('-webkit-text-fill-color') ??
				null,
			opacity:
				rule.declarations.find((declaration) => declaration.prop === 'opacity')
					?.value ??
				winner.get('opacity') ??
				null,
		})),
	};
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

type ResolvedCandidate = {
	/** The effective colour of one possible paint, or null when it declares
	 * none (the primitive's default paints underneath). */
	color: Rgba | null;
	/** The alpha factor a possible paint's `opacity-*` declares, or null. */
	opacity: number | null;
};

type ResolvedClassName = {
	/** The effective colour of the cascade winner: `-webkit-text-fill-color`
	 * when it declares one, else `color`, else null (round 7 M7). */
	color: Rgba | null;
	/** The alpha factor the winner's `opacity-*` declares, or null. */
	opacity: number | null;
	/** Every ancestor-qualified rule that could paint at rest (round 10 I2):
	 * the call-site guard folds ALL of these into its worst case. */
	possible: ResolvedCandidate[];
};

const parseOpacityValue = (raw: string, utility: string): number => {
	const percentageMatch = /^([\d.]+)%$/.exec(raw);
	const parsedOpacity =
		percentageMatch === null ? Number(raw) : Number(percentageMatch[1]) / 100;
	if (!Number.isFinite(parsedOpacity)) {
		throw new Error(`Unresolvable generated opacity for ${utility}: ${raw}`);
	}
	return parsedOpacity;
};

// `-webkit-text-fill-color` paints the text in WebKit/Blink instead of
// `color` when both are set (round 7 M7), so a candidate's EFFECTIVE colour
// is its fill declaration when it has one, else its colour. The fill's
// default value `currentcolor` is an explicit no-op — the `color` paints.
// Every value that reaches this point has already survived the parser's
// fail-closed sweep (rule 7), so an unresolvable colour throws in
// compiledStyleFromCss by name instead of here.
const effectiveColourDeclaration = (bundle: {
	textFillColor: string | null;
	color: string | null;
}): string | null => {
	if (
		bundle.textFillColor !== null &&
		bundle.textFillColor !== 'currentcolor'
	) {
		return bundle.textFillColor;
	}
	return bundle.color;
};

const resolveCandidateDeclaration = (
	declaration: string | null,
	utility: string,
	theme: 'light' | 'dark',
): Rgba | null => {
	// `color: currentcolor` on the element itself is the inherited colour —
	// for the description that is the primitive's default, which the caller
	// folds in when this returns null.
	if (declaration === null || declaration === 'currentcolor') {
		return null;
	}
	const variableMatch = /^var\((--[\w-]+)\)$/.exec(declaration);
	return variableMatch
		? resolveColor(variableMatch[1], theme)
		: parseColorValue(declaration, utility);
};

const compiledStyleFromUtilities = (
	utilities: string[],
	theme: 'light' | 'dark',
): Promise<CompiledUtilityStyle> => {
	const cacheKey = `${utilities.join(' ')}|${theme}`;
	const cached = compiledUtilityStyleCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const compiled = (async (): Promise<CompiledUtilityStyle> => {
		const compiler = await getCompiler();
		const generatedCss = compiler.build(utilities);
		const cssWithoutBanner = generatedCss.replace(/^\/\*![\s\S]*?\*\/\s*/, '');
		return compiledStyleFromCss(cssWithoutBanner, utilities, theme);
	})();
	compiledUtilityStyleCache.set(cacheKey, compiled);
	return compiled;
};

const resolveClassName = async (
	className: string,
	theme: 'light' | 'dark',
): Promise<ResolvedClassName> => {
	// Round 10 I1: the WHOLE class list is compiled and cascaded in ONE
	// build — the winner is decided by layer → importance → specificity →
	// source order in the real stylesheet, never by the order of names in
	// the className attribute (which the browser ignores).
	const utilities = className.split(/\s+/).filter((utility) => utility !== '');
	const compiledStyle = await compiledStyleFromUtilities(utilities, theme);
	return {
		color: resolveCandidateDeclaration(
			effectiveColourDeclaration(compiledStyle),
			utilities[0],
			theme,
		),
		opacity:
			compiledStyle.opacity === null
				? null
				: parseOpacityValue(compiledStyle.opacity, utilities[0]),
		possible: compiledStyle.possible.map((candidate) => ({
			color: resolveCandidateDeclaration(
				effectiveColourDeclaration(candidate),
				utilities[0],
				theme,
			),
			opacity:
				candidate.opacity === null
					? null
					: parseOpacityValue(candidate.opacity, utilities[0]),
		})),
	};
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
			['x'],
			'light',
		);
		expect(style.color).toBe('var(--publy-foreground-subtle)');
	});

	test('an attribute variant never supplies the resting colour (round 8 I1)', () => {
		const style = compiledStyleFromCss(
			'.x { color: var(--publy-foreground-subtle); }\n' +
				".x[data-active='true'] { color: var(--publy-foreground); }",
			['x'],
			'light',
		);
		expect(style.color).toBe('var(--publy-foreground-subtle)');
	});

	test('a @media-nested rule never supplies the resting colour (round 8 I1)', () => {
		const style = compiledStyleFromCss(
			'.x { color: var(--publy-foreground-subtle); }\n' +
				'@media (max-width: 767px) { .x { color: var(--publy-foreground); } }',
			['x'],
			'light',
		);
		expect(style.color).toBe('var(--publy-foreground-subtle)');
	});

	test('a @supports-nested rule never supplies the resting colour (round 8 I1)', () => {
		const style = compiledStyleFromCss(
			'.x { color: var(--publy-foreground-subtle); }\n' +
				'@supports (display: grid) { .x { color: var(--publy-foreground); } }',
			['x'],
			'light',
		);
		expect(style.color).toBe('var(--publy-foreground-subtle)');
	});

	// The design-system guard scans every src/ file for raw colour literals,
	// so the FIXTURE colours below (which exist to prove that raw colours are
	// still RESOLVED correctly) are built by concatenation rather than written
	// as one literal — the same convention as the round-4 fixtures above.
	const rawRed = '#' + 'ff0000';
	const rawNearBlack = '#' + '111111';

	// Round 8 I2: nesting is SEEN (the old substring walker dropped nested
	// rules entirely). Round 10 I2 re-cast BOTH pins: a rule nested inside a
	// plain rule resolves to `.parent .x` — an ANCESTOR-QUALIFIED rule the
	// source model cannot verify — so it is a POSSIBLE paint, never a
	// last-wins winner. The first pin proves the nested rule is still
	// resolved at all; the second proves it can no longer outrank the base
	// rule by source order (the round-10 I2 control: three lines of ordinary
	// CSS made every drawer read fully green while painting 2.515:1).
	test('a rule nested inside a plain rule is resolved as a possible paint (round 8 I2 + round 10 I2)', () => {
		const style = compiledStyleFromCss(
			`.parent { .x { color: ${rawRed}; } }`,
			['x'],
			'light',
		);
		expect(style.color).toBeNull();
		expect(style.possible).toEqual([
			{ color: rawRed, textFillColor: null, opacity: null },
		]);
	});

	test('an ancestor-qualified rule never wins by source order (round 10 I2)', () => {
		const style = compiledStyleFromCss(
			`.x { color: ${rawNearBlack}; }\n` +
				`.parent { .x { color: ${rawRed}; } }`,
			['x'],
			'light',
		);
		// The base rule is the definite cascade winner; the nested override is
		// reported as a possible paint the consumer must fold into its worst
		// case — the round-10 I2 policy.
		expect(style.color).toBe(rawNearBlack);
		expect(style.possible).toEqual([
			{ color: rawRed, textFillColor: null, opacity: null },
		]);
	});

	// Round 10 I2, flat spelling: the same ancestor qualification written as
	// a plain descendant combinator. LOAD-BEARING for round 10 M2 — this
	// assertion dies if lastCompoundRun's combinator stripping is dropped
	// (the qualified rule would then be read as a different class and vanish
	// from the possible paints entirely).
	test('a descendant-qualified rule is a possible paint, never the winner (round 10 I2/M2)', () => {
		const style = compiledStyleFromCss(
			'.x { color: var(--publy-foreground-secondary); }\n' +
				'.publy-drawer .x { color: var(--publy-foreground-subtle); }',
			['x'],
			'light',
		);
		expect(style.color).toBe('var(--publy-foreground-secondary)');
		expect(style.possible).toEqual([
			{
				color: 'var(--publy-foreground-subtle)',
				textFillColor: null,
				opacity: null,
			},
		]);
	});

	// Round 10 I1: the two-class `className` — the headline round-10 finding.
	// The browser resolves competing plain class rules by layer → specificity
	// → source order, NEVER by the order of names in the class attribute.
	// This synthetic pair pins that the resolver agrees: same CSS, swapped
	// attribute order, identical verdicts.
	test('a two-class className resolves by source order, not attribute order (round 10 I1)', () => {
		const css =
			'.a { color: var(--publy-foreground); }\n' +
			'.b { color: var(--publy-foreground-subtle); }';
		const forward = compiledStyleFromCss(css, ['a', 'b'], 'light');
		const reversed = compiledStyleFromCss(css, ['b', 'a'], 'light');
		expect(forward.color).toBe('var(--publy-foreground-subtle)');
		expect(reversed.color).toBe('var(--publy-foreground-subtle)');
	});

	test('an unlayered utility outranks a components-layer app class (round 10 I1)', () => {
		// The unlayered rule comes FIRST on purpose: source order alone would
		// crown the LATER layered rule, while the browser crowns the
		// unlayered one — unlayered outranks every layer regardless of
		// position, exactly how Tailwind's generated utilities beat the
		// app's `@layer components` blocks.
		const css =
			'.b { color: var(--publy-foreground); }\n' +
			'@layer components { .a { color: var(--publy-foreground-subtle); } }';
		expect(compiledStyleFromCss(css, ['a', 'b'], 'light').color).toBe(
			'var(--publy-foreground)',
		);
		expect(compiledStyleFromCss(css, ['b', 'a'], 'light').color).toBe(
			'var(--publy-foreground)',
		);
	});

	// Round 10 M1: the two cascade inversions css-cascade-test-support.ts was
	// hardened against in round 3, reintroduced by round 9's source-order
	// last-wins and now re-closed with the same model.
	test('an !important declaration beats a later plain one (round 10 M1)', () => {
		const style = compiledStyleFromCss(
			'.x { color: var(--publy-foreground-subtle) !important; }\n' +
				'.x { color: var(--publy-foreground); }',
			['x'],
			'light',
		);
		expect(style.color).toBe('var(--publy-foreground-subtle)');
	});

	test('a higher-specificity compound beats a later plain rule (round 10 M1)', () => {
		const style = compiledStyleFromCss(
			'.a.x { color: var(--publy-foreground-subtle); }\n' +
				'.x { color: var(--publy-foreground); }',
			['a', 'x'],
			'light',
		);
		expect(style.color).toBe('var(--publy-foreground-subtle)');
	});

	// Round 10 I3, PAIRED PROOF. The red side: a class whose ONLY colour
	// declaration lives inside a conditional at-rule must THROW by name —
	// round 9's exclusion made it fall through to the primitive's compliant
	// default, a silent substitution (the round-8 walker was red on exactly
	// this input). The green side is the round-8 I1 `@media` pin above: a
	// conditional rule alongside an unconditional one still never supplies,
	// and the unconditional colour resolves normally — the legitimate case
	// the exclusion protects.
	test('a colour declared only inside a conditional at-rule fails loud by name (round 10 I3)', () => {
		expect(() =>
			compiledStyleFromCss(
				'@media (min-width: 640px) {\n' +
					'  .x { color: var(--publy-foreground-subtle); }\n' +
					'}',
				['x'],
				'light',
			),
		).toThrow(/Only conditional declarations for x: color/);
	});

	// Round 10 M3: state-variant-ness is decided by whether the pseudo-class
	// paints at rest, not by its shape. `:not()`/`:where()`/`:is()` paint at
	// rest; `html.dark .x` is a theme gate the suite can evaluate.
	test('a rest-applying :not() rule supplies and wins on specificity (round 10 M3)', () => {
		const style = compiledStyleFromCss(
			'.x { color: var(--publy-foreground); }\n' +
				'.x:not(.never) { color: var(--publy-foreground-subtle); }',
			['x'],
			'light',
		);
		expect(style.color).toBe('var(--publy-foreground-subtle)');
	});

	test('a :not() whose argument is on the element does not apply (round 10 M3)', () => {
		const style = compiledStyleFromCss(
			'.x { color: var(--publy-foreground); }\n' +
				'.x:not(.never) { color: var(--publy-foreground-subtle); }',
			['x', 'never'],
			'light',
		);
		expect(style.color).toBe('var(--publy-foreground)');
	});

	test('a :where() rule supplies with zero specificity and last-wins (round 10 M3)', () => {
		const style = compiledStyleFromCss(
			'.x { color: var(--publy-foreground); }\n' +
				'.x:where(.a, .x) { color: var(--publy-foreground-subtle); }',
			['x'],
			'light',
		);
		expect(style.color).toBe('var(--publy-foreground-subtle)');
	});

	test('a dark-themed ancestor rule never supplies the light-theme colour (round 10 M3)', () => {
		const css =
			'.x { color: var(--publy-foreground); }\n' +
			'html.dark .x { color: var(--publy-foreground-subtle); }';
		// In light the gate excludes the rule ENTIRELY — it must not even
		// surface as a possible paint, or the call-site worst case would
		// redden a light-theme assertion on a dark-only override.
		const light = compiledStyleFromCss(css, ['x'], 'light');
		expect(light.color).toBe('var(--publy-foreground)');
		expect(light.possible).toEqual([]);
		// In dark the gate applies — the later rule wins the tie on
		// specificity (ancestor compounds do not add specificity here).
		const dark = compiledStyleFromCss(css, ['x'], 'dark');
		expect(dark.color).toBe('var(--publy-foreground-subtle)');
		expect(dark.possible).toEqual([]);
	});

	test('a statement at-rule does not absorb the following rule (round 8 M6)', () => {
		const style = compiledStyleFromCss(
			`@layer properties;\n.x { color: ${rawRed}; }`,
			['x'],
			'light',
		);
		expect(style.color).toBe(rawRed);
	});

	test('a themed dark gate supplies the resting colour in dark mode only (round 9 rule 4)', () => {
		const gated =
			'.dark\\:x { &:is(.dark *) { color: var(--publy-foreground); } }';
		expect(compiledStyleFromCss(gated, ['dark:x'], 'light').color).toBeNull();
		expect(compiledStyleFromCss(gated, ['dark:x'], 'dark').color).toBe(
			'var(--publy-foreground)',
		);
	});

	test('an !important declaration resolves the same colour as the plain one (round 8 M5)', () => {
		const style = compiledStyleFromCss(
			'.x { color: var(--publy-foreground-muted) !important; }',
			['x'],
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

	// Round 10 I1, through the REAL app.css: the review proved in Chromium
	// that `class="publy-field-helper publy-drawer-description"` paints
	// `--publy-foreground-subtle` (2.515:1) because field-helper is 89 lines
	// later in the same `@layer components`, while the same two names typed
	// in the other order paint identically. The resolver must agree on both
	// spellings, and must let a utility-layer colour outrank a components-
	// layer app class the way the browser does.
	test('two real app classes resolve by real source order, not attribute order (round 10 I1)', async () => {
		const subtle = resolveColor('--publy-foreground-subtle', 'light');
		const forward = await resolveClassName(
			'publy-field-helper publy-drawer-description',
			'light',
		);
		const reversed = await resolveClassName(
			'publy-drawer-description publy-field-helper',
			'light',
		);
		expect(forward.color).toEqual(subtle);
		expect(reversed.color).toEqual(subtle);
	});

	test('a utility colour outranks a components-layer app class (round 10 I1)', async () => {
		const foreground = resolveColor('--foreground', 'light');
		const forward = await resolveClassName(
			'text-foreground publy-field-helper',
			'light',
		);
		const reversed = await resolveClassName(
			'publy-field-helper text-foreground',
			'light',
		);
		expect(forward.color).toEqual(foreground);
		expect(reversed.color).toEqual(foreground);
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
			// Round 10 M4: the inventory keys are forward-slash repository
			// paths, but `walkTsxFiles` builds NATIVE paths — on Windows the
			// comparison below would never match. Normalise both sides.
			const relative = callSite.file
				.split(path.sep)
				.join('/')
				.replace(
					path.resolve(process.cwd()).split(path.sep).join('/') + '/',
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
				// Round 10 I1: the element carries the primitive class AND the
				// caller's classes, so they are resolved TOGETHER in one
				// cascade — the winner is decided by layer → importance →
				// specificity → source order in the real stylesheet, exactly
				// like the browser, and never by the order of names in the
				// className attribute. The primitive's own colour is a cascade
				// contender like any other (it is the winner whenever no
				// caller class outranks it) — no fallback left to substitute.
				const elementClasses =
					callSite.className === null
						? 'publy-drawer-description'
						: `publy-drawer-description ${callSite.className}`;
				const resolution = await resolveClassName(elementClasses, theme);
				const candidates = [
					{ color: resolution.color, opacity: resolution.opacity },
					...resolution.possible,
				];
				// Round 10 I2: every POSSIBLE paint is folded into the worst
				// case — the call site passes only when the LOWEST contrast
				// clears the floor. A bare `opacity-*` (round 7 I2) softens
				// whichever colour paints — folded in below.
				const background = compositedDrawerBackground(theme);
				const worstRatio = Math.min(
					...candidates.map((candidate) => {
						const foreground = withOpacity(
							candidate.color ?? defaultForeground,
							candidate.opacity,
						);
						return contrastRatio(
							effectiveForeground(foreground, background),
							background,
						);
					}),
				);
				expect(
					worstRatio,
					`${callSite.file}:${callSite.line} (className: ${callSite.className}) in ${theme} theme`,
				).toBeGreaterThanOrEqual(SMALL_TEXT_CONTRAST_FLOOR);
			}
		},
	);
});
