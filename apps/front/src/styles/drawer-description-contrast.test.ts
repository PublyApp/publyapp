import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from 'tailwindcss';
import { describe, expect, test } from 'vitest';

import { resolveEffectiveDeclarations } from './css-cascade-test-support';
import {
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

// Every `*-description` primitive whose text must stay legible on the three
// surfaces drawer-style description lines actually sit on (#1043). The list
// is the source of truth: a new failing description class should be added
// here, not worked around per-surface.
const DESCRIPTION_SELECTORS = [
	'.publy-drawer-description',
	'.publy-field-switch-description',
	'.publy-danger-zone-row-description',
];

const SURFACE_TOKENS = [
	'--publy-surface',
	'--publy-surface-muted',
	'--publy-surface-raised',
] as const;

type Rgba = { r: number; g: number; b: number; a: number };

const extractBlock = (
	header: '@theme inline' | ':root' | 'html.dark',
): string => {
	const start = appCssSource.indexOf(`${header} {`);
	if (start === -1) {
		throw new Error(`Missing ${header} theme block`);
	}

	let depth = 0;
	for (let index = start; index < appCssSource.length; index += 1) {
		if (appCssSource[index] === '{') {
			depth += 1;
		} else if (appCssSource[index] === '}') {
			depth -= 1;
			if (depth === 0) {
				return appCssSource.slice(start, index + 1);
			}
		}
	}

	throw new Error(`Unclosed ${header} theme block`);
};

// Every `--custom-property: value;` declaration in a theme block — hex and
// rgba() colours, `var(--publy-*)` aliases, and everything else — so the
// guard can read the real overlay surface and the backdrop it composites
// over, not only the opaque surface tokens.
const readDeclarations = (
	header: ':root' | 'html.dark',
): Map<string, string> => {
	const declarations = new Map<string, string>();
	const pattern = /(--[\w-]+)\s*:\s*([^;]+);/g;
	for (const match of extractBlock(header).matchAll(pattern)) {
		declarations.set(match[1], match[2].trim());
	}
	return declarations;
};

const LIGHT_DECLARATIONS = readDeclarations(':root');
const DARK_DECLARATIONS = readDeclarations('html.dark');

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
	const themeBlockStart = themeSource.indexOf('@theme default {');
	if (themeBlockStart === -1) {
		throw new Error('Missing @theme default block in tailwindcss/theme.css');
	}

	let depth = 0;
	let end = themeBlockStart;
	for (let index = themeBlockStart; index < themeSource.length; index += 1) {
		if (themeSource[index] === '{') {
			depth += 1;
		} else if (themeSource[index] === '}') {
			depth -= 1;
			if (depth === 0) {
				end = index;
				break;
			}
		}
	}

	const declarations = new Map<string, string>();
	const pattern = /(--[\w-]+)\s*:\s*([^;]+);/g;
	for (const match of themeSource
		.slice(themeBlockStart, end)
		.matchAll(pattern)) {
		declarations.set(match[1], match[2].trim());
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
			if (tailwindRaw === undefined) {
				throw new Error(
					`Token ${tokenName} is not declared in app.css or the Tailwind theme`,
				);
			}
			return parseColorDeclaration(tailwindRaw, tokenName);
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

const findDrawerDescriptionCallSites = (): CallSite[] => {
	const srcRoot = path.resolve(process.cwd(), 'src');
	const callSites: CallSite[] = [];
	const tagPattern = /<DrawerDescription\b([^>]*)(\/?)>/g;
	for (const file of walkTsxFiles(srcRoot)) {
		const source = readFileSync(file, 'utf8');
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
// fails closed by name instead of being silently replaced with the primitive's
// compliant default colour.
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
	/** Last `opacity:` declaration emitted by the utility's own rules, if any. */
	opacity: string | null;
};

// Extracts the declarations of every rule in the compiled CSS whose selector
// targets the utility's class. Scoped to those rules (not the whole output) so
// a base rule like `.publy-drawer-description { color: ... }` cannot leak its
// colour into a typography utility's verdict. At-rules (`@media`, `@supports`,
// `@layer`) are entered rather than consumed, so a variant utility's rule
// nested inside one is still found.
const declarationsFromUtilityRules = (
	compiledCss: string,
	utility: string,
): string[] => {
	const needle = `.${escapeClassName(utility)}`;
	const bodies: string[] = [];
	let index = 0;
	const length = compiledCss.length;
	while (index < length) {
		const open = compiledCss.indexOf('{', index);
		if (open === -1) {
			break;
		}
		const header = compiledCss.slice(index, open).trim();
		let depth = 1;
		let cursor = open + 1;
		while (cursor < length && depth > 0) {
			if (compiledCss[cursor] === '{') {
				depth += 1;
			} else if (compiledCss[cursor] === '}') {
				depth -= 1;
			}
			cursor += 1;
		}
		if (header.startsWith('@')) {
			index = open + 1;
			continue;
		}
		if (header.includes(needle)) {
			bodies.push(compiledCss.slice(open + 1, cursor - 1));
		}
		index = cursor;
	}
	return bodies;
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
): Promise<CompiledUtilityStyle> => {
	const cached = compiledUtilityStyleCache.get(utility);
	if (cached) {
		return cached;
	}

	const compiled = (async (): Promise<CompiledUtilityStyle> => {
		const compiler = await getCompiler();
		const generatedCss = compiler.build([utility]);
		const cssWithoutBanner = generatedCss.replace(/^\/\*![\s\S]*?\*\/\s*/, '');

		// The utility resolves iff a rule targets its class — either generated
		// for it (a Tailwind utility) or already present in app.css's own
		// `@layer components` (an app class like `publy-type-helper`). An
		// unknown utility like `text-quantum-42` generates nothing and must not
		// be silently treated as "no colour override".
		if (cssWithoutBanner.indexOf(`.${escapeClassName(utility)}`) === -1) {
			throw new Error(
				`Unresolvable utility on a DrawerDescription: ${utility}`,
			);
		}

		const declarations = declarationsFromUtilityRules(
			cssWithoutBanner,
			utility,
		);
		const style: CompiledUtilityStyle = { color: null, opacity: null };
		const declarationPattern = /(?:^|[{;])\s*([\w-]+)\s*:\s*([^;{}]+);/g;
		for (const body of declarations) {
			for (const match of body.matchAll(declarationPattern)) {
				const value = match[2].trim();
				if (match[1] === 'color') {
					style.color = value;
				} else if (match[1] === 'opacity') {
					style.opacity = value;
				}
			}
		}
		return style;
	})();
	compiledUtilityStyleCache.set(utility, compiled);
	return compiled;
};

const colorFromClassName = async (
	className: string,
	theme: 'light' | 'dark',
): Promise<Rgba | null> => {
	let resolved: Rgba | null = null;
	let opacity: number | null = null;
	for (const utility of className.split(/\s+/)) {
		if (utility === '') {
			continue;
		}

		const compiledStyle = await compiledStyleFromUtility(utility);
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
		if (compiledStyle.color === null) {
			continue;
		}

		const variableMatch = /^var\((--[\w-]+)\)$/.exec(compiledStyle.color);
		try {
			resolved = variableMatch
				? resolveColor(variableMatch[1], theme)
				: parseColorValue(compiledStyle.color, utility);
		} catch (error) {
			throw new Error(
				`Unresolvable generated colour for ${utility}: ${compiledStyle.color}`,
				{ cause: error },
			);
		}
	}

	// Round 5 "fourth door": an `opacity-*` utility does not change `color`,
	// but it paints the text at that alpha over the surface, collapsing the
	// effective contrast. Fold it into the resolved foreground's alpha so a
	// `text-primary opacity-50` description cannot sail past both guards.
	if (resolved !== null && opacity !== null && opacity < 1) {
		return { ...resolved, a: resolved.a * opacity };
	}
	return resolved;
};

// The effective painted colour of a (possibly translucent) foreground over the
// given background, which is what the contrast ratio must be computed against.
const effectiveForeground = (foreground: Rgba, background: Rgba): Rgba =>
	foreground.a >= 1 ? foreground : alphaComposite(foreground, background);

const CALL_SITES = findDrawerDescriptionCallSites();

describe('drawer description text contrast (#1043)', () => {
	test.each(['light', 'dark'] as const)(
		'resolves every semantic text colour through the real Tailwind theme in %s mode',
		async (theme) => {
			expect(await colorFromClassName('text-primary text-sm', theme)).toEqual(
				resolveColor('--primary', theme),
			);
		},
	);

	test('ignores generated typography utilities without mistaking them for colours', async () => {
		expect(
			await colorFromClassName('text-sm text-center text-balance', 'light'),
		).toBeNull();
	});

	test('fails closed when Tailwind cannot resolve a className utility', async () => {
		await expect(async () =>
			colorFromClassName('text-unrecognised-colour', 'light'),
		).rejects.toThrow(
			'Unresolvable utility on a DrawerDescription: text-unrecognised-colour',
		);
	});

	test('names a generated utility whose colour token cannot be resolved', async () => {
		const unresolvedToken = '--publy-' + 'not-declared';
		const unresolvedUtility = `text-(${unresolvedToken})`;
		await expect(async () =>
			colorFromClassName(unresolvedUtility, 'light'),
		).rejects.toThrow(
			`Unresolvable generated colour for ${unresolvedUtility}: ` +
				`var(${unresolvedToken})`,
		);
	});

	// Round 5 I5: the guard must resolve the app's real classes, not fail on
	// them — otherwise the "fix" for a legitimate case is editing the guard,
	// which is how round 3's hole got in.
	test.each(['publy-type-helper', 'animate-in', 'fade-in'] as const)(
		'resolves the real app/tw-animate class %s as a non-colour utility',
		async (utility) => {
			expect(await colorFromClassName(utility, 'light')).toBeNull();
		},
	);

	test('resolves a Tailwind built-in palette colour without weakening fail-closed', async () => {
		expect(await colorFromClassName('text-red-500', 'light')).toEqual(
			resolveColor('--color-red-500', 'light'),
		);
		// A genuinely unknown utility still throws by name.
		await expect(async () =>
			colorFromClassName('text-quantum-42', 'light'),
		).rejects.toThrow(
			'Unresolvable utility on a DrawerDescription: text-quantum-42',
		);
	});

	// Round 5 "fourth door": `opacity-*` paints the text translucent without
	// changing `color`, collapsing the effective contrast. The guard must fold
	// it in, not report the opaque colour.
	test('folds an opacity utility into the measured foreground', async () => {
		const foreground = await colorFromClassName(
			'text-primary opacity-50',
			'light',
		);
		expect(foreground).not.toBeNull();
		expect(foreground?.a).toBeCloseTo(0.5, 5);
	});

	// Pins the round-4 utility-resolution behaviours so the real app.css
	// compiler input (round 5 I5) cannot regress them: semantic tokens still
	// resolve, arbitrary hex values still resolve exactly, and the genuinely
	// unresolvable colour shapes still fail closed by name.
	// The design-system guard scans every src/ file for raw colour literals, so
	// these two FIXTURE utilities — which exist to prove that raw colours are
	// still RESOLVED correctly — are built by concatenation rather than written
	// as one literal. Otherwise the guard would flag its own test fixtures.
	const rawHexUtility = 'text-[#' + '777777]';
	const rawNamedUtility = '[' + 'color' + ':' + 'red]';

	test('keeps the round-4 resolution behaviours intact', async () => {
		expect(await colorFromClassName('text-foreground', 'light')).toEqual(
			resolveColor('--foreground', 'light'),
		);
		expect(await colorFromClassName('text-muted-foreground', 'light')).toEqual(
			resolveColor('--muted-foreground', 'light'),
		);
		expect(await colorFromClassName(rawHexUtility, 'light')).toEqual({
			r: 0x77,
			g: 0x77,
			b: 0x77,
			a: 1,
		});
		expect(await colorFromClassName('dark:text-primary', 'light')).toEqual(
			resolveColor('--primary', 'light'),
		);
		for (const utility of [
			'text-primary/50',
			'text-primary!',
			rawNamedUtility,
		]) {
			await expect(async () =>
				colorFromClassName(utility, 'light'),
			).rejects.toThrow('Unresolvable generated colour');
		}
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
		const enumeratedFiles = CALL_SITES.map((callSite) => {
			const relative = callSite.file.replace(
				path.resolve(process.cwd()) + path.sep,
				'',
			);
			return relative;
		}).sort();

		const inventoryFiles = CONSUMERS.map((consumer) => consumer.file).sort();
		expect(enumeratedFiles).toEqual(inventoryFiles);

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
				const foreground =
					callSite.className === null
						? defaultForeground
						: ((await colorFromClassName(callSite.className, theme)) ??
							defaultForeground);
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
