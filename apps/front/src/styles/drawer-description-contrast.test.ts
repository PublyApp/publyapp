import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from 'tailwindcss';
import { describe, expect, test } from 'vitest';

import { resolveEffectiveDeclarations } from './css-cascade-test-support';

const appCssPath = path.resolve(process.cwd(), 'src/styles/app.css');
// Comments are stripped before token extraction so a token name mentioned in
// prose cannot masquerade as a real declaration.
const appCssSource = readFileSync(appCssPath, 'utf8').replace(
	/\/\*[\s\S]*?\*\//g,
	'',
);

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
			throw new Error(`Token ${tokenName} is not declared in app.css`);
		}

		const aliasMatch = /^var\((--[\w-]+)\)$/.exec(raw);
		if (aliasMatch) {
			return resolve(aliasMatch[1]);
		}
		return parseColorValue(raw, tokenName);
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

const walkTsxFiles = (dir: string): string[] => {
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...walkTsxFiles(fullPath));
		} else if (entry.name.endsWith('.tsx')) {
			files.push(fullPath);
		}
	}
	return files;
};

const extractClassName = (
	attributes: string,
	file: string,
	line: number,
): string | null => {
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

// Compile each literal class candidate against Tailwind's real default theme
// plus this app's `@theme inline` overrides. The `text-*` namespace is
// overloaded (colour, font size, alignment, wrapping, ...), so generated CSS
// is the authoritative way to distinguish a colour override from typography.
// A candidate Tailwind cannot generate fails closed instead of being silently
// replaced with the primitive's compliant default colour.
const tailwindThemePath = fileURLToPath(
	import.meta.resolve('tailwindcss/theme.css'),
);
const tailwindCompilerInput = `${readFileSync(tailwindThemePath, 'utf8')}\n${extractBlock('@theme inline')}\n@tailwind utilities;`;
const compiledUtilityColorCache = new Map<string, Promise<string | null>>();

const compiledColorFromUtility = (utility: string): Promise<string | null> => {
	const cached = compiledUtilityColorCache.get(utility);
	if (cached) {
		return cached;
	}

	const compiled = (async (): Promise<string | null> => {
		const compiler = await compile(tailwindCompilerInput);
		const generatedCss = compiler.build([utility]);
		const cssWithoutBanner = generatedCss.replace(/^\/\*![\s\S]*?\*\/\s*/, '');
		if (cssWithoutBanner.trim() === '') {
			throw new Error(
				`Unresolvable utility on a DrawerDescription: ${utility}`,
			);
		}

		const colorDeclarations: string[] = [];
		const declarationPattern = /(?:^|[{;])\s*([\w-]+)\s*:\s*([^;{}]+);/gm;
		for (const match of cssWithoutBanner.matchAll(declarationPattern)) {
			if (match[1] === 'color') {
				colorDeclarations.push(match[2].trim());
			}
		}

		return colorDeclarations.at(-1) ?? null;
	})();
	compiledUtilityColorCache.set(utility, compiled);
	return compiled;
};

const colorFromClassName = async (
	className: string,
	theme: 'light' | 'dark',
): Promise<Rgba | null> => {
	let resolved: Rgba | null = null;
	for (const utility of className.split(/\s+/)) {
		if (utility === '') {
			continue;
		}

		const compiledColor = await compiledColorFromUtility(utility);
		if (compiledColor === null) {
			continue;
		}

		const variableMatch = /^var\((--[\w-]+)\)$/.exec(compiledColor);
		try {
			resolved = variableMatch
				? resolveColor(variableMatch[1], theme)
				: parseColorValue(compiledColor, utility);
		} catch (error) {
			throw new Error(
				`Unresolvable generated colour for ${utility}: ${compiledColor}`,
				{ cause: error },
			);
		}
	}
	return resolved;
};

const CALL_SITES = findDrawerDescriptionCallSites();

// Every real (non-test) consumer must be found by the enumeration, so a glob
// or parse regression can never silently empty the call-site guard.
const EXPECTED_CONSUMER_FILES = [
	'src/components/marketing/cookie-prefs-drawer.tsx',
	'src/routes/authed/staff/staff-users/_change-email-dialog.tsx',
	'src/routes/authed/staff/tenants/$tenantId/_invite-user-drawer.tsx',
	'src/routes/authed/staff/tenants/$tenantId/profiles/$profileId/_assign-members-drawer.tsx',
	'src/routes/authed/staff/tenants/$tenantId/profiles/_profile-edit-details-drawer.tsx',
	'src/routes/authed/staff/tenants/$tenantId/profiles/_profile-form-drawer.tsx',
];

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

	test('enumerates every DrawerDescription call site in the repository', () => {
		expect(CALL_SITES.length).toBeGreaterThanOrEqual(6);
		for (const consumerFile of EXPECTED_CONSUMER_FILES) {
			expect(
				CALL_SITES.some((callSite) => callSite.file.endsWith(consumerFile)),
				`expected a DrawerDescription usage in ${consumerFile}`,
			).toBe(true);
		}
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
				expect(
					contrastRatio(foreground, compositedDrawerBackground(theme)),
					`${callSite.file}:${callSite.line} (className: ${callSite.className}) in ${theme} theme`,
				).toBeGreaterThanOrEqual(SMALL_TEXT_CONTRAST_FLOOR);
			}
		},
	);
});
