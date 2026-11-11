/**
 * #2360: PublyApp's colour tokens are aliases onto `@radandevist/radan-ui`'s
 * `--radan-ui-*` variables (`--publy-background: var(--radan-ui-background)`),
 * so a contrast test can no longer read a hex literal straight out of
 * `app.css`. This module reads BOTH stylesheets and resolves a token the way
 * the browser does for the light (`:root`) and dark (`html.dark` + radan-ui's
 * `.dark`) themes: radan-ui's declarations first, then `app.css` on top, with
 * every `var(--x)` looked up in the same theme's merged map (the `.dark` class
 * sits on <html>, so aliases resolve against the dark values).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type ThemeName = 'light' | 'dark';

// cwd-based (the suites run from apps/front, like marketing-contrast.test.ts),
// because import.meta.url is not a file: URL under the jsdom environment.
const stripComments = (source: string): string =>
	source.replace(/\/\*[\s\S]*?\*\//g, '');

const appCss = stripComments(
	readFileSync(path.resolve(process.cwd(), 'src/styles/app.css'), 'utf8'),
);
const radanThemePath = path.resolve(
	process.cwd(),
	'node_modules/@radandevist/radan-ui/dist/theme.css',
);
const radanCss = stripComments(readFileSync(radanThemePath, 'utf8'));

/** Every top-level block whose header line matches, brace-counted. */
const extractBlocks = (source: string, headerPattern: RegExp): string[] => {
	const lines = source.split('\n');
	const blocks: string[] = [];
	for (let start = 0; start < lines.length; start += 1) {
		if (!headerPattern.test(lines[start])) {
			continue;
		}
		let depth = 0;
		for (let index = start; index < lines.length; index += 1) {
			depth += (lines[index].match(/{/g) ?? []).length;
			depth -= (lines[index].match(/}/g) ?? []).length;
			if (depth === 0) {
				blocks.push(lines.slice(start, index + 1).join('\n'));
				start = index;
				break;
			}
		}
	}
	return blocks;
};

const declarationsOf = (blocks: string[]): Map<string, string> => {
	const declarations = new Map<string, string>();
	for (const block of blocks) {
		const body = block.slice(block.indexOf('{') + 1);
		for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
			declarations.set(match[1], match[2].trim());
		}
	}
	return declarations;
};

const buildTheme = (theme: ThemeName): Map<string, string> => {
	const merged = new Map<string, string>();
	const layers: Array<[string, RegExp]> =
		theme === 'light'
			? [
					[radanCss, /^:root\s*\{/],
					[appCss, /^:root\s*\{/],
				]
			: [
					[radanCss, /^:root\s*\{/],
					[radanCss, /^\.dark\s*\{/],
					[appCss, /^:root\s*\{/],
					[appCss, /^html\.dark\s*\{/],
				];
	for (const [source, header] of layers) {
		for (const [name, value] of declarationsOf(extractBlocks(source, header))) {
			merged.set(name, value);
		}
	}
	return merged;
};

const THEMES = {
	light: buildTheme('light'),
	dark: buildTheme('dark'),
} satisfies Record<ThemeName, Map<string, string>>;

/** The raw (unresolved) custom properties in effect for a theme. */
export const themeDeclarations = (theme: ThemeName): Map<string, string> =>
	new Map(THEMES[theme]);

/** radan-ui's own `@theme inline` map (`--color-ring: var(--radan-ui-ring)`). */
export const radanThemeInlineDeclarations = (): Map<string, string> =>
	declarationsOf(extractBlocks(radanCss, /^@theme inline\s*\{/));

/** The Tailwind `@theme inline` map in effect: app.css's block over radan-ui's. */
export const themeInlineDeclarations = (): Map<string, string> =>
	new Map([
		...radanThemeInlineDeclarations(),
		...declarationsOf(extractBlocks(appCss, /^@theme inline\s*\{/)),
	]);

/** Resolves a token to its final value, following `var()` chains. */
export const resolveThemeToken = (name: string, theme: ThemeName): string => {
	const declarations = THEMES[theme];
	const resolve = (token: string, trail: string[]): string => {
		const value = declarations.get(token);
		if (value === undefined) {
			throw new Error(`Token ${token} is not declared for the ${theme} theme`);
		}
		if (trail.includes(token)) {
			throw new Error(`Token cycle: ${[...trail, token].join(' -> ')}`);
		}
		return value.replace(/var\((--[\w-]+)\)/g, (_whole, ref: string) =>
			resolve(ref, [...trail, token]),
		);
	};
	return resolve(name, []);
};
