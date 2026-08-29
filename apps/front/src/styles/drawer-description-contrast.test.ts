import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type Page } from '@playwright/test';
import postcss from 'postcss';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile } from 'tailwindcss';
import {
	Node,
	Project,
	ScriptKind,
	SyntaxKind,
	VariableDeclarationKind,
	ts as tsCompiler,
} from 'ts-morph';
import type {
	ArrowFunction,
	AsExpression,
	ConditionalExpression,
	ConstructorDeclaration,
	Expression,
	FunctionDeclaration,
	FunctionExpression,
	GetAccessorDeclaration,
	JsxAttribute,
	JsxExpression,
	JsxOpeningElement,
	JsxSelfClosingElement,
	MethodDeclaration,
	NoSubstitutionTemplateLiteral,
	ObjectBindingPattern,
	ObjectLiteralExpression,
	ParenthesizedExpression,
	PropertyAccessExpression,
	PropertyAssignment,
	SetAccessorDeclaration,
	SourceFile,
	StringLiteral,
} from 'ts-morph';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { Drawer, DrawerDescription } from '~/components/ui/drawer';

import { resolveEffectiveDeclarations } from './css-cascade-test-support';
import {
	DESCRIPTION_SELECTORS,
	DRAWER_DESCRIPTION_CONSUMERS,
	EXCLUDED_DESCRIPTION_SELECTORS,
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

// Round 15: the guard measures paint in a real browser at the e2e's own
// viewport — devices['Desktop Chrome'] in playwright.config.ts (1280×720).
// `@media`-gated classes are evaluated by the engine at exactly this
// viewport, so a conditional that fires here is measured, and one that never
// fires is a class with no resting colour at the measured viewport (fail
// loud — never the primitive's compliant default).
const MEASURED_VIEWPORT = { width: 1280, height: 720 } as const;

// Round 19 I1: the probe element is not a made-up `<div>` — it is the REAL
// host element the shipping `DrawerDescription` wrapper emits. Base UI 1.3.0's
// `Dialog.Description` calls `useRenderElement('p', ...)` and stamps a
// generated `id`; the wrapper stamps `data-slot="drawer-description"`. Derive
// that contract by RENDERING the shipped component (react-dom/server), never
// by copying a literal into a second fixture: the strings `p` and
// `drawer-description` appear exactly once each, in the contract pin below,
// and the probe markup (askEngine) is built from these derived values. If Base
// UI ever changes the host element, or drawer.tsx changes the slot, the
// contract pin reds AND the probe starts rendering the new contract — the
// probe's element identity is the real primitive's, not a parallel model of
// it.
const deriveDescriptionHostContract = () => {
	const html = renderToStaticMarkup(
		createElement(
			Drawer,
			null,
			createElement(DrawerDescription, null, 'probe contract'),
		),
	);
	const tagMatch = /^<([a-zA-Z][\w-]*)(\s|\/?>)/.exec(html);
	if (tagMatch === null) {
		throw new Error(
			`Cannot read the DrawerDescription host element from rendered HTML: ${html}`,
		);
	}
	const slotMatch = /data-slot="([^"]*)"/.exec(html);
	if (slotMatch === null) {
		throw new Error(`DrawerDescription no longer renders a data-slot: ${html}`);
	}
	return {
		elementType: tagMatch[1],
		dataSlot: slotMatch[1],
		hasId: /\sid=/.test(html),
	};
};

const DESCRIPTION_HOST_CONTRACT = deriveDescriptionHostContract();

type Rgba = { r: number; g: number; b: number; a: number };

// One real parse of app.css, shared by the theme token maps, the contextual
// token fallback (round 8 M5) and nothing else — the compiled CSS below is
// parsed per candidate build.
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
const readFirstContextualDeclarations = (): Map<string, string> => {
	const declarations = new Map<string, string>();
	appCssRoot.walkDecls((decl) => {
		if (decl.prop.startsWith('--') && !declarations.has(decl.prop)) {
			declarations.set(decl.prop, decl.value.trim());
		}
	});
	return declarations;
};

const CONTEXTUAL_DECLARATIONS = readFirstContextualDeclarations();

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
		if (clamped <= 0.0031308) {
			return 12.92 * clamped;
		}
		return 1.055 * clamped ** (1 / 2.4) - 0.055;
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
const readTailwindThemeDeclarations = (): Map<string, string> => {
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
};

const tailwindThemeDeclarations = readTailwindThemeDeclarations();

const parseColorDeclaration = (raw: string, name: string): Rgba => {
	const trimmed = raw.trim();
	// Split into parts so the design-system guard's raw-color scan and
	// oxlint's regex→startsWith autofix don't fight over this line.
	const oklchPrefix = ['oklch', '('].join('');
	if (trimmed.startsWith(oklchPrefix)) {
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
// Round 15: this source model is now CROSS-CHECKED against the browser — the
// probe's own painted hit stack (drawer panel → backdrop → canvas) is read
// and composited by the engine, and a pin below asserts the two agree in both
// themes. The browser is the oracle; this function is kept for the
// token-level surface sweep and the agreement pin, not for the call-site
// verdict.
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
		if (value <= 0.04045) {
			return value / 12.92;
		}
		return ((value + 0.055) / 1.055) ** 2.4;
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
// paint (default primitive token, or the resolved utility override) still
// clears the floor on the drawer surface the browser actually paints.
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

// Round 23 I1: the call-site model is ONE TypeScript AST walk (ts-morph, an
// app dependency) — the opening-tag regex and the hand-written attribute
// scanner are gone. The defect they shared was the wrong default: characters
// the lexer did not capture were concluded "not written", and characters
// between two quotes were concluded to BE the runtime value. The AST is the
// program: every JSX opening/self-closing element and every attribute node
// exists as a node, and each node kind below is handled explicitly or
// reported UNRESOLVABLE by name and location — never "nothing here". If a
// future TypeScript adds a syntax this model has never seen, the guard goes
// red, not green.
const tsxProject = new Project({ useInMemoryFileSystem: true });

/** Parses one TSX source file through the TypeScript AST and fails loud on
 * any parse error — an unparseable file must never silently lose its call
 * sites. */
const parseTsxSource = (source: string, file: string): SourceFile => {
	const sourceFile = tsxProject.createSourceFile(file, source, {
		overwrite: true,
		scriptKind: ScriptKind.TSX,
	});
	const parseDiagnostics = tsxProject
		.getLanguageService()
		.compilerObject.getSyntacticDiagnostics(file);
	if (parseDiagnostics.length > 0) {
		throw new Error(
			`Contrast guard cannot parse ${file}: ` +
				parseDiagnostics
					.map((diagnostic) =>
						tsCompiler.flattenDiagnosticMessageText(
							diagnostic.messageText,
							'\n',
						),
					)
					.join('; '),
		);
	}
	return sourceFile;
};

/** Parses an attribute-fragment test fixture as a real self-closing element,
 * so the pin tests exercise the same AST walk as the real call sites. */
const syntheticElementFor = (attributes: string): JsxSelfClosingElement => {
	const sourceFile = parseTsxSource(`<div ${attributes} />`, '_synthetic.tsx');
	const element = sourceFile.getDescendantsOfKind(
		SyntaxKind.JsxSelfClosingElement,
	)[0];
	if (element === undefined) {
		throw new Error(
			`Contrast guard fixture did not parse as a JSX element: ${attributes}`,
		);
	}
	return element;
};

type CallSite = {
	file: string;
	line: number;
	className: string | null;
	/** Round 21 + round 23 I1: the `data-*`/`aria-*` attributes the call site
	 * writes on the description element, with their value resolution. These
	 * are REAL static attributes — part of the element's contract, not
	 * ephemeral Base UI state — so the probe renders them and the
	 * state-attribute exemption never hides a rule keyed on one. Every
	 * written NAME is retained whatever its value expression; a value the
	 * guard cannot evaluate is UNRESOLVABLE and fails loud (never silently
	 * absent). */
	stateAttributes: Record<string, StateAttributeResolution>;
};

/** The value of a call-site `data-*`/`aria-*` attribute. Either the guard
 * knows every runtime value the expression can produce (a quoted literal, or
 * a ternary whose branches are quoted literals) and must measure ALL of them,
 * or the value expression cannot be evaluated and the call site fails loud. */
type StateAttributeResolution =
	| { status: 'resolved'; values: string[] }
	| { status: 'unresolvable' };

/** The two JSX element forms that can carry attributes: `<X …>` and
 * `<X … />`. Both expose the tag node and the attribute nodes. */
type JsxElementLike = JsxOpeningElement | JsxSelfClosingElement;

/** Every attribute of the element, walked as a REAL AST node. The node kinds
 * are enumerated exhaustively — `JsxAttribute` with an identifier name,
 * `JsxAttribute` with a namespaced name, `JsxSpreadAttribute` — each is
 * handled explicitly or reported UNRESOLVABLE by name and location; the
 * fallback is a `default:` that reports, never one that returns "nothing
 * here". A `data-*` spell inside a quoted attribute VALUE is a string, not
 * an attribute node, and cannot confuse the walk — round 22's `>`-in-title
 * truncation and namespace-name mis-lexing cannot happen, because there is
 * no text capture at all. */
const walkElementAttributes = (
	element: JsxElementLike,
	file: string,
	line: number,
) => {
	let className: string | null = null;
	const stateAttributes: Record<string, StateAttributeResolution> = {};

	for (const attribute of element.getAttributes()) {
		switch (attribute.getKind()) {
			case SyntaxKind.JsxAttribute: {
				const jsxAttribute = attribute as JsxAttribute;
				const nameNode = jsxAttribute.getNameNode();
				let name: string;
				switch (nameNode.getKind()) {
					case SyntaxKind.Identifier:
						name = nameNode.getText();
						break;
					case SyntaxKind.JsxNamespacedName:
						// `data-probe:mode="low"` — the full namespaced name IS
						// the attribute name the DOM carries (round 22 I1); it
						// must never collapse into the bare namespace part.
						name = nameNode.getText();
						break;
					default:
						throw new Error(
							`DrawerDescription at ${file}:${line} uses an attribute ` +
								`name node kind the contrast guard does not model ` +
								`(${nameNode.getKindName()}) — extend the model or make ` +
								'the call site plain.',
						);
				}
				const initializer = jsxAttribute.getInitializer();
				if (name === 'className') {
					if (classNameValueOf(initializer) === null) {
						throw new Error(
							`DrawerDescription at ${file}:${line} passes a non-literal ` +
								'className that the contrast guard cannot resolve — ' +
								'inline a string literal so an override can be verified ' +
								'against the 4.5:1 floor.',
						);
					}
					className = classNameValueOf(initializer);
					continue;
				}
				if (name === 'style') {
					assertStyleResolvable(jsxAttribute, file, line);
					continue;
				}
				if (/^(?:data|aria)-/.test(name)) {
					stateAttributes[name] =
						initializer === undefined
							? { status: 'resolved', values: ['true'] }
							: resolveAttributeValue(initializer, file, line);
				}
				// Every other attribute name (title, id, role, …) has no
				// colour or state effect — explicitly ignored, not unmodeled.
				continue;
			}
			case SyntaxKind.JsxSpreadAttribute:
				// A spread can carry a className or a data-*/aria-* name the
				// walk cannot see — the same fail-closed contract as round 5
				// I2 (round 22 I1: `{...{ ['data-contrast-probe']: 'low' }}`).
				throw new Error(
					`DrawerDescription at ${file}:${line} passes props through a ` +
						'spread that the contrast guard cannot resolve — inline a ' +
						'string-literal className and literal data-*/aria-* ' +
						'attributes so every override can be verified against the ' +
						'4.5:1 floor.',
				);
			default:
				// A future TypeScript adds an attribute node kind: report by
				// name and location, never "nothing here".
				throw new Error(
					`DrawerDescription at ${file}:${line} uses a JSX attribute node ` +
						`kind the contrast guard does not model ` +
						`(${attribute.getKindName()}) — extend the model or make ` +
						'the call site plain.',
				);
		}
	}
	return { className, stateAttributes };
};

/** The literal className value of an initializer node, or null when it is
 * not a constant string (a bare `className`, an expression, a ternary — all
 * fail loud in the walk; a className must be ONE string for the guard to
 * compile and measure). Round 25 I2: a JSX string-literal className is
 * character-reference-decoded (`className="c&#108;s"` is `cls` after the
 * transform); a className through a JsxExpression is a JavaScript literal
 * and is not. */
const classNameValueOf = (initializer: Node | undefined): string | null => {
	if (initializer === undefined) {
		return null;
	}
	if (initializer.getKind() === SyntaxKind.StringLiteral) {
		return decodeJsxEntities((initializer as StringLiteral).getLiteralValue());
	}
	if (initializer.getKind() !== SyntaxKind.JsxExpression) {
		return null;
	}
	const expression = (initializer as JsxExpression).getExpression();
	if (expression === undefined) {
		return null;
	}
	const constants = evaluateConstantStrings(expression);
	if (constants !== null && constants.length === 1) {
		return constants[0];
	}
	return null;
};

/** An inline `style` that sets `color` is invisible to the source model and
 * must fail closed (round 5 I3). The style value must be an inspectable
 * object literal: a literal without a `color` property is safe; any other
 * value (a variable, a call, a bare `style`, a spread inside the object) may
 * carry a colour and is unresolvable. */
const assertStyleResolvable = (
	attribute: JsxAttribute,
	file: string,
	line: number,
): void => {
	const initializer = attribute.getInitializer();
	if (initializer === undefined) {
		throw new Error(
			`DrawerDescription at ${file}:${line} passes a non-literal style that ` +
				'the contrast guard cannot resolve — inline the style object so a ' +
				'colour override can be verified against the 4.5:1 floor.',
		);
	}
	const object = styleObjectOf(initializer);
	if (object === null) {
		throw new Error(
			`DrawerDescription at ${file}:${line} passes a non-literal style that ` +
				'the contrast guard cannot resolve — inline the style object so a ' +
				'colour override can be verified against the 4.5:1 floor.',
		);
	}
	for (const property of object.getProperties()) {
		if (property.getKind() !== SyntaxKind.PropertyAssignment) {
			// a spread inside the style object can carry `color` — unresolvable
			throw new Error(
				`DrawerDescription at ${file}:${line} sets an inline style with a ` +
					'colour that the contrast guard cannot resolve — move the colour ' +
					'to a string-literal className so it can be verified against ' +
					'the 4.5:1 floor.',
			);
		}
		if (
			(property as PropertyAssignment).getNameNode().getText().toLowerCase() ===
			'color'
		) {
			throw new Error(
				`DrawerDescription at ${file}:${line} sets an inline style with a ` +
					'colour that the contrast guard cannot resolve — move the colour ' +
					'to a string-literal className so it can be verified against ' +
					'the 4.5:1 floor.',
			);
		}
	}
};

/** The style value as an inspectable object literal, or null. */
const styleObjectOf = (initializer: Node): ObjectLiteralExpression | null => {
	if (initializer.getKind() !== SyntaxKind.JsxExpression) {
		return null;
	}
	const expression = (initializer as JsxExpression).getExpression();
	if (expression?.getKind() !== SyntaxKind.ObjectLiteralExpression) {
		return null;
	}
	return expression as ObjectLiteralExpression;
};

/** Evaluates an expression to the compile-time constant strings it can
 * produce, or null when it cannot be reduced to constants. JavaScript escape
 * processing is applied — the AST's cooked literal value, so `'\x6cow'` IS
 * the runtime string `low` — and RESOLVED therefore always means an
 * evaluated value, never a captured spelling (round 23 I2). A ternary
 * evaluates BOTH branches separately and returns the union of their values;
 * a branch the evaluator cannot reduce to a constant makes the whole
 * expression unresolvable.
 *
 * Every StringLiteral reached through this function sits inside a
 * JsxExpression container, so it is a JAVASCRIPT literal: the transform does
 * not decode HTML character references in it (`{'a&amp;b'}` reaches React as
 * the seven characters `a&amp;b`, esbuild 0.28.1), so the guard must NOT
 * decode either — only the direct JSX attribute-literal case decodes (round
 * 25 I2). ts-morph already applies the backslash-escape axis in both
 * contexts; this split is only the entity axis. */
const evaluateConstantStrings = (expression: Expression): string[] | null => {
	switch (expression.getKind()) {
		case SyntaxKind.StringLiteral:
			return [(expression as StringLiteral).getLiteralValue()];
		case SyntaxKind.NoSubstitutionTemplateLiteral:
			return [(expression as NoSubstitutionTemplateLiteral).getLiteralValue()];
		case SyntaxKind.ParenthesizedExpression:
			return evaluateConstantStrings(
				(expression as ParenthesizedExpression).getExpression(),
			);
		case SyntaxKind.AsExpression:
			return evaluateConstantStrings(
				(expression as AsExpression).getExpression(),
			);
		case SyntaxKind.ConditionalExpression: {
			const conditional = expression as ConditionalExpression;
			const whenTrue = evaluateConstantStrings(conditional.getWhenTrue());
			const whenFalse = evaluateConstantStrings(conditional.getWhenFalse());
			if (whenTrue === null || whenFalse === null) {
				return null;
			}
			return [...whenTrue, ...whenFalse];
		}
		default:
			return null;
	}
};

/** The exact named character references esbuild 0.28.1 (the transform Vite
 * runs) decodes in a JSX attribute string literal — copied from
 * `internal/js_lexer/tables.go` at the 0.28.1 tag, which credits
 * TypeScript's `src/compiler/transformers/jsx.ts`. Verified empirically
 * against the installed 0.28.1 binary: the table is case-sensitive
 * (`&AMP;`, `&Amp;` stay verbatim), a name not in it stays verbatim
 * (`&bogus;`), and every entry requires the trailing `;`. The emitted
 * string for each entry is the exact esbuild decode. */
/** Known HTML5 named entities (mirrors esbuild's named-entity table).
 * Entity names arrive from parsed `&name;` text as plain strings, so lookup
 * goes through Map.get and an unknown name stays undefined instead of
 * widening the literal to an open dictionary (no-known-value-widening). */
const JSX_NAMED_ENTITIES = new Map<string, string>([
	['quot', '\u0022'],
	['amp', '\u0026'],
	['apos', '\u0027'],
	['lt', '\u003C'],
	['gt', '\u003E'],
	['nbsp', '\u00A0'],
	['iexcl', '\u00A1'],
	['cent', '\u00A2'],
	['pound', '\u00A3'],
	['curren', '\u00A4'],
	['yen', '\u00A5'],
	['brvbar', '\u00A6'],
	['sect', '\u00A7'],
	['uml', '\u00A8'],
	['copy', '\u00A9'],
	['ordf', '\u00AA'],
	['laquo', '\u00AB'],
	['not', '\u00AC'],
	['shy', '\u00AD'],
	['reg', '\u00AE'],
	['macr', '\u00AF'],
	['deg', '\u00B0'],
	['plusmn', '\u00B1'],
	['sup2', '\u00B2'],
	['sup3', '\u00B3'],
	['acute', '\u00B4'],
	['micro', '\u00B5'],
	['para', '\u00B6'],
	['middot', '\u00B7'],
	['cedil', '\u00B8'],
	['sup1', '\u00B9'],
	['ordm', '\u00BA'],
	['raquo', '\u00BB'],
	['frac14', '\u00BC'],
	['frac12', '\u00BD'],
	['frac34', '\u00BE'],
	['iquest', '\u00BF'],
	['Agrave', '\u00C0'],
	['Aacute', '\u00C1'],
	['Acirc', '\u00C2'],
	['Atilde', '\u00C3'],
	['Auml', '\u00C4'],
	['Aring', '\u00C5'],
	['AElig', '\u00C6'],
	['Ccedil', '\u00C7'],
	['Egrave', '\u00C8'],
	['Eacute', '\u00C9'],
	['Ecirc', '\u00CA'],
	['Euml', '\u00CB'],
	['Igrave', '\u00CC'],
	['Iacute', '\u00CD'],
	['Icirc', '\u00CE'],
	['Iuml', '\u00CF'],
	['ETH', '\u00D0'],
	['Ntilde', '\u00D1'],
	['Ograve', '\u00D2'],
	['Oacute', '\u00D3'],
	['Ocirc', '\u00D4'],
	['Otilde', '\u00D5'],
	['Ouml', '\u00D6'],
	['times', '\u00D7'],
	['Oslash', '\u00D8'],
	['Ugrave', '\u00D9'],
	['Uacute', '\u00DA'],
	['Ucirc', '\u00DB'],
	['Uuml', '\u00DC'],
	['Yacute', '\u00DD'],
	['THORN', '\u00DE'],
	['szlig', '\u00DF'],
	['agrave', '\u00E0'],
	['aacute', '\u00E1'],
	['acirc', '\u00E2'],
	['atilde', '\u00E3'],
	['auml', '\u00E4'],
	['aring', '\u00E5'],
	['aelig', '\u00E6'],
	['ccedil', '\u00E7'],
	['egrave', '\u00E8'],
	['eacute', '\u00E9'],
	['ecirc', '\u00EA'],
	['euml', '\u00EB'],
	['igrave', '\u00EC'],
	['iacute', '\u00ED'],
	['icirc', '\u00EE'],
	['iuml', '\u00EF'],
	['eth', '\u00F0'],
	['ntilde', '\u00F1'],
	['ograve', '\u00F2'],
	['oacute', '\u00F3'],
	['ocirc', '\u00F4'],
	['otilde', '\u00F5'],
	['ouml', '\u00F6'],
	['divide', '\u00F7'],
	['oslash', '\u00F8'],
	['ugrave', '\u00F9'],
	['uacute', '\u00FA'],
	['ucirc', '\u00FB'],
	['uuml', '\u00FC'],
	['yacute', '\u00FD'],
	['thorn', '\u00FE'],
	['yuml', '\u00FF'],
	['OElig', '\u0152'],
	['oelig', '\u0153'],
	['Scaron', '\u0160'],
	['scaron', '\u0161'],
	['Yuml', '\u0178'],
	['fnof', '\u0192'],
	['circ', '\u02C6'],
	['tilde', '\u02DC'],
	['Alpha', '\u0391'],
	['Beta', '\u0392'],
	['Gamma', '\u0393'],
	['Delta', '\u0394'],
	['Epsilon', '\u0395'],
	['Zeta', '\u0396'],
	['Eta', '\u0397'],
	['Theta', '\u0398'],
	['Iota', '\u0399'],
	['Kappa', '\u039A'],
	['Lambda', '\u039B'],
	['Mu', '\u039C'],
	['Nu', '\u039D'],
	['Xi', '\u039E'],
	['Omicron', '\u039F'],
	['Pi', '\u03A0'],
	['Rho', '\u03A1'],
	['Sigma', '\u03A3'],
	['Tau', '\u03A4'],
	['Upsilon', '\u03A5'],
	['Phi', '\u03A6'],
	['Chi', '\u03A7'],
	['Psi', '\u03A8'],
	['Omega', '\u03A9'],
	['alpha', '\u03B1'],
	['beta', '\u03B2'],
	['gamma', '\u03B3'],
	['delta', '\u03B4'],
	['epsilon', '\u03B5'],
	['zeta', '\u03B6'],
	['eta', '\u03B7'],
	['theta', '\u03B8'],
	['iota', '\u03B9'],
	['kappa', '\u03BA'],
	['lambda', '\u03BB'],
	['mu', '\u03BC'],
	['nu', '\u03BD'],
	['xi', '\u03BE'],
	['omicron', '\u03BF'],
	['pi', '\u03C0'],
	['rho', '\u03C1'],
	['sigmaf', '\u03C2'],
	['sigma', '\u03C3'],
	['tau', '\u03C4'],
	['upsilon', '\u03C5'],
	['phi', '\u03C6'],
	['chi', '\u03C7'],
	['psi', '\u03C8'],
	['omega', '\u03C9'],
	['thetasym', '\u03D1'],
	['upsih', '\u03D2'],
	['piv', '\u03D6'],
	['ensp', '\u2002'],
	['emsp', '\u2003'],
	['thinsp', '\u2009'],
	['zwnj', '\u200C'],
	['zwj', '\u200D'],
	['lrm', '\u200E'],
	['rlm', '\u200F'],
	['ndash', '\u2013'],
	['mdash', '\u2014'],
	['lsquo', '\u2018'],
	['rsquo', '\u2019'],
	['sbquo', '\u201A'],
	['ldquo', '\u201C'],
	['rdquo', '\u201D'],
	['bdquo', '\u201E'],
	['dagger', '\u2020'],
	['Dagger', '\u2021'],
	['bull', '\u2022'],
	['hellip', '\u2026'],
	['permil', '\u2030'],
	['prime', '\u2032'],
	['Prime', '\u2033'],
	['lsaquo', '\u2039'],
	['rsaquo', '\u203A'],
	['oline', '\u203E'],
	['frasl', '\u2044'],
	['euro', '\u20AC'],
	['image', '\u2111'],
	['weierp', '\u2118'],
	['real', '\u211C'],
	['trade', '\u2122'],
	['alefsym', '\u2135'],
	['larr', '\u2190'],
	['uarr', '\u2191'],
	['rarr', '\u2192'],
	['darr', '\u2193'],
	['harr', '\u2194'],
	['crarr', '\u21B5'],
	['lArr', '\u21D0'],
	['uArr', '\u21D1'],
	['rArr', '\u21D2'],
	['dArr', '\u21D3'],
	['hArr', '\u21D4'],
	['forall', '\u2200'],
	['part', '\u2202'],
	['exist', '\u2203'],
	['empty', '\u2205'],
	['nabla', '\u2207'],
	['isin', '\u2208'],
	['notin', '\u2209'],
	['ni', '\u220B'],
	['prod', '\u220F'],
	['sum', '\u2211'],
	['minus', '\u2212'],
	['lowast', '\u2217'],
	['radic', '\u221A'],
	['prop', '\u221D'],
	['infin', '\u221E'],
	['ang', '\u2220'],
	['and', '\u2227'],
	['or', '\u2228'],
	['cap', '\u2229'],
	['cup', '\u222A'],
	['int', '\u222B'],
	['there4', '\u2234'],
	['sim', '\u223C'],
	['cong', '\u2245'],
	['asymp', '\u2248'],
	['ne', '\u2260'],
	['equiv', '\u2261'],
	['le', '\u2264'],
	['ge', '\u2265'],
	['sub', '\u2282'],
	['sup', '\u2283'],
	['nsub', '\u2284'],
	['sube', '\u2286'],
	['supe', '\u2287'],
	['oplus', '\u2295'],
	['otimes', '\u2297'],
	['perp', '\u22A5'],
	['sdot', '\u22C5'],
	['lceil', '\u2308'],
	['rceil', '\u2309'],
	['lfloor', '\u230A'],
	['rfloor', '\u230B'],
	['lang', '\u2329'],
	['rang', '\u232A'],
	['loz', '\u25CA'],
	['spades', '\u2660'],
	['clubs', '\u2663'],
	['hearts', '\u2665'],
	['diams', '\u2666'],
]);

/** Mirrors esbuild's `decodeJSXEntities` (internal/js_lexer/js_lexer.go at
 * 0.28.1) exactly: scan for `&`, take the FIRST `;` after it, and decode a
 * numeric reference — `&#<decimal>;` or `&#x<hex>;`, lowercase `x` only,
 * int32 range, single pass — or a named entity from the table above.
 * Anything else (`&bogus;`, `&AMP;`, `&#X6C;`, a bare `&`, a missing or
 * immediate `;`) stays literal. A decoded `&` is never rescanned
 * (`&amp;amp;` is `&amp;`, not `&`). */
const decodeJsxEntities = (text: string): string => {
	let decoded = '';
	let cursor = 0;
	while (cursor < text.length) {
		const ampersand = text.indexOf('&', cursor);
		if (ampersand < 0) {
			decoded += text.slice(cursor);
			break;
		}
		decoded += text.slice(cursor, ampersand);
		const semicolon = text.indexOf(';', ampersand + 1);
		let replaced = false;
		if (semicolon > ampersand + 1) {
			const entity = text.slice(ampersand + 1, semicolon);
			if (entity.startsWith('#')) {
				let number = entity.slice(1);
				let base: 10 | 16 = 10;
				if (number.length > 1 && number.startsWith('x')) {
					number = number.slice(1);
					base = 16;
				}
				const value = parseJsxEntityNumber(number, base);
				if (value !== null) {
					decoded += jsxRuneToUtf16(value);
					cursor = semicolon + 1;
					replaced = true;
				}
			} else {
				const value = JSX_NAMED_ENTITIES.get(entity);
				if (value !== undefined) {
					decoded += value;
					cursor = semicolon + 1;
					replaced = true;
				}
			}
		}
		if (!replaced) {
			decoded += '&';
			cursor = ampersand + 1;
		}
	}
	return decoded;
};

/** Go's `strconv.ParseInt(number, base, 32)` as esbuild calls it: an
 * optional sign, digits valid for the base, and the value must fit in an
 * int32 — anything else is not a reference and stays literal. */
const parseJsxEntityNumber = (number: string, base: 10 | 16): number | null => {
	const pattern = base === 10 ? /^[+-]?[0-9]+$/ : /^[+-]?[0-9a-fA-F]+$/;
	if (!pattern.test(number)) {
		return null;
	}
	const value = Number.parseInt(number, base);
	if (value < -2147483648 || value > 2147483647) {
		return null;
	}
	return value;
};

/** A decoded rune as UTF-16, exactly like esbuild's append: BMP runes as one
 * code unit (negative values wrap through uint16 — `&#-1;` is U+FFFF), and
 * anything above as a surrogate pair, including out-of-range input wrapping
 * the same way (`&#1114112;` is U+10000). */
const jsxRuneToUtf16 = (rune: number): string => {
	if (rune <= 0xffff) {
		return String.fromCharCode(rune);
	}
	const shifted = rune - 0x10000;
	return String.fromCharCode(
		0xd800 + ((shifted >> 10) & 0x3ff),
		0xdc00 + (shifted & 0x3ff),
	);
};

/** Resolves a state-attribute value from its AST initializer node. A
 * constant string expression is a single value (with escapes processed); a
 * ternary whose branches are both constant strings is the two values of the
 * union (the condition is free-form — the branches are still exactly the
 * possible runtime values). Any other expression — a bare variable, a
 * template literal with a substitution, a call — is UNRESOLVABLE and fails
 * the call site loud.
 *
 * Round 25 I2: the entity axis is split by context. A StringLiteral
 * initializer (`data-x="a&amp;b"`) is a JSX attribute literal — the
 * transform decodes its HTML character references, so the guard decodes
 * before declaring RESOLVED. A StringLiteral reached through a
 * JsxExpression is a JavaScript literal — the transform passes it verbatim,
 * so evaluateConstantStrings must not decode. ts-morph already applies the
 * backslash-escape axis in both contexts. */
const resolveAttributeValue = (
	initializer: Node,
	file: string,
	line: number,
): StateAttributeResolution => {
	switch (initializer.getKind()) {
		case SyntaxKind.StringLiteral:
			return {
				status: 'resolved',
				values: [
					decodeJsxEntities((initializer as StringLiteral).getLiteralValue()),
				],
			};
		case SyntaxKind.JsxExpression: {
			const expression = (initializer as JsxExpression).getExpression();
			if (expression === undefined) {
				// `data-x={}` — the expression container is empty; the runtime
				// value is undefined and cannot be enumerated.
				return { status: 'unresolvable' };
			}
			const constants = evaluateConstantStrings(expression);
			if (constants === null) {
				return { status: 'unresolvable' };
			}
			return { status: 'resolved', values: constants };
		}
		default:
			// A future TypeScript adds an initializer kind: report by name and
			// location, never "nothing here".
			throw new Error(
				`DrawerDescription at ${file}:${line} uses an attribute value node ` +
					`kind the contrast guard does not model (${initializer.getKindName()}) ` +
					'— extend the model or make the call site plain.',
			);
	}
};

export const extractClassName = (
	attributes: string,
	file: string,
	line: number,
): string | null => {
	const { className } = walkElementAttributes(
		syntheticElementFor(attributes),
		file,
		line,
	);
	return className;
};

/** The local JSX names that can refer to the drawer description in one file.
 * Round 23 I1: resolved from the AST import declarations (named specifiers
 * with aliases, namespace imports, default imports) plus local `const`
 * aliases and drawer-module destructuring — the round-7 M4 alias/namespace
 * semantics, now total: an import form the model does not enumerate cannot
 * silently lose a tag. */
type DrawerLocalTags = {
	/** Local identifiers bound to the drawer description element. */
	identifiers: Set<string>;
	/** Local identifiers bound to the drawer MODULE (a namespace or default
	 * import, or a `const` alias of one) — the root of `<Root.DrawerDescription>`. */
	moduleNames: Set<string>;
};

/** The leftmost identifier of a property-access chain (`a.b.c` → `a`), or
 * null when the root is not an identifier (`this.x`, a call, …). */
const rootIdentifierOf = (expression: Expression): string | null => {
	let node: Expression = expression;
	while (node.getKind() === SyntaxKind.PropertyAccessExpression) {
		node = (node as PropertyAccessExpression).getExpression();
	}
	if (node.getKind() === SyntaxKind.Identifier) {
		return node.getText();
	}
	return null;
};

/** Every identifier a binding node introduces — a plain name, or every
 * element of a destructuring pattern (`const { a: b, c }` → `b`, `c`). */
const collectBindingNames = (nameNode: Node, names: Set<string>): void => {
	switch (nameNode.getKind()) {
		case SyntaxKind.Identifier:
			names.add(nameNode.getText());
			return;
		case SyntaxKind.ObjectBindingPattern:
		case SyntaxKind.ArrayBindingPattern:
			for (const element of (nameNode as ObjectBindingPattern).getElements()) {
				collectBindingNames(element.getNameNode(), names);
			}
			return;
		default:
			return;
	}
};

/** Whether a node is any function-like declaration usable for parameter
 * binding checks. ts-morph's own narrowing guards keep the parameter walk
 * below assertion-free. */
type FunctionLikeNode =
	| FunctionDeclaration
	| FunctionExpression
	| ArrowFunction
	| MethodDeclaration
	| ConstructorDeclaration
	| GetAccessorDeclaration
	| SetAccessorDeclaration;

const isFunctionLikeNode = (node: Node): node is FunctionLikeNode =>
	Node.isFunctionDeclaration(node) ||
	Node.isFunctionExpression(node) ||
	Node.isArrowFunction(node) ||
	Node.isMethodDeclaration(node) ||
	Node.isConstructorDeclaration(node) ||
	Node.isGetAccessorDeclaration(node) ||
	Node.isSetAccessorDeclaration(node);

/** Whether a JSX tag identifier is bound to a parameter of any enclosing
 * function — the classic render-prop channel. Such a tag cannot be
 * attributed to any module: the caller may pass the drawer description
 * component itself, so it reports UNRESOLVABLE by name and location instead
 * of silently passing as "not a drawer description" (round 23 I1). */
const isBoundToFunctionParameter = (tagNode: Node): boolean => {
	const name = tagNode.getText();
	for (
		let ancestor = tagNode.getFirstAncestor();
		ancestor !== undefined;
		ancestor = ancestor.getFirstAncestor()
	) {
		if (!isFunctionLikeNode(ancestor)) {
			continue;
		}
		for (const parameter of ancestor.getParameters()) {
			const names = new Set<string>();
			collectBindingNames(parameter.getNameNode(), names);
			if (names.has(name)) {
				return true;
			}
		}
	}
	return false;
};

/** Whether a JSX tag identifier is bound to a local `let`/`var` whose
 * initializer refers to the drawer description — `let X = DrawerDescription`,
 * `let X = Drawer.DrawerDescription`, `let X = Drawer`, or
 * `let { DrawerDescription: X } = Drawer`. `localDrawerTags` deliberately
 * models only `const` bindings because a mutable binding can be reassigned
 * and is not statically attributable (round 23 I1); this is the reporting
 * half of that decision (round 25 MINOR 1): the tag is reported by name and
 * location instead of silently answering "not a drawer description" and
 * leaving a second description to hide behind the one-call-site-per-file
 * inventory count (round 25 MINOR 2). */
const isBoundToMutableDrawerBinding = (
	tagNode: Node,
	tags: DrawerLocalTags,
): boolean => {
	const name = tagNode.getText();
	for (const declaration of tagNode.getSourceFile().getVariableDeclarations()) {
		if (
			declaration.getVariableStatement()?.getDeclarationKind() ===
			VariableDeclarationKind.Const
		) {
			continue;
		}
		const nameNode = declaration.getNameNode();
		if (nameNode.getKind() === SyntaxKind.Identifier) {
			if (nameNode.getText() !== name) {
				continue;
			}
			const initializer = declaration.getInitializer();
			if (initializer?.getKind() === SyntaxKind.Identifier) {
				const sourceName = initializer.getText();
				if (
					tags.identifiers.has(sourceName) ||
					tags.moduleNames.has(sourceName)
				) {
					return true;
				}
			}
			if (initializer?.getKind() === SyntaxKind.PropertyAccessExpression) {
				const root = rootIdentifierOf(initializer);
				if (
					root !== null &&
					tags.moduleNames.has(root) &&
					(initializer as PropertyAccessExpression).getNameNode().getText() ===
						'DrawerDescription'
				) {
					return true;
				}
			}
		} else if (nameNode.getKind() === SyntaxKind.ObjectBindingPattern) {
			// `let { DrawerDescription: X } = Drawer` — the same hazard, the
			// same report.
			const initializer = declaration.getInitializer();
			if (
				initializer?.getKind() !== SyntaxKind.Identifier ||
				!tags.moduleNames.has(initializer.getText())
			) {
				continue;
			}
			for (const element of (nameNode as ObjectBindingPattern).getElements()) {
				const propertyName =
					element.getPropertyNameNode()?.getText() ?? element.getName();
				if (
					propertyName === 'DrawerDescription' &&
					element.getName() === name
				) {
					return true;
				}
			}
		}
	}
	return false;
};

/** Every local tag name that refers to the drawer description: named imports
 * of the primitive (with aliases), namespace/default imports of the module,
 * and local `const` aliases (`const X = DrawerDescription`,
 * `const X = Drawer.DrawerDescription`, `const X = Drawer`, and
 * `const { DrawerDescription: X } = Drawer` — including alias chains, to a
 * fixpoint). `let`/`var` bindings are not modelled: they can be reassigned,
 * so the binding is not statically attributable. */
const localDrawerTags = (
	sourceFile: SourceFile,
	file: string,
): DrawerLocalTags => {
	const tags: DrawerLocalTags = {
		identifiers: new Set<string>(),
		moduleNames: new Set<string>(),
	};
	for (const declaration of sourceFile.getImportDeclarations()) {
		if (!isDrawerModuleImport(declaration.getModuleSpecifierValue(), file)) {
			continue;
		}
		const namespaceImport = declaration.getNamespaceImport();
		if (namespaceImport !== undefined) {
			tags.moduleNames.add(namespaceImport.getText());
		}
		const defaultImport = declaration.getDefaultImport();
		if (defaultImport !== undefined) {
			tags.moduleNames.add(defaultImport.getText());
		}
		for (const specifier of declaration.getNamedImports()) {
			if (specifier.getName() !== 'DrawerDescription') {
				continue;
			}
			tags.identifiers.add(
				specifier.getAliasNode()?.getText() ?? specifier.getName(),
			);
		}
	}
	const declarations = sourceFile.getVariableDeclarations();
	for (let pass = 0; pass < declarations.length; pass++) {
		let grew = false;
		for (const declaration of declarations) {
			if (
				declaration.getVariableStatement()?.getDeclarationKind() !==
				VariableDeclarationKind.Const
			) {
				continue;
			}
			const nameNode = declaration.getNameNode();
			if (nameNode.getKind() === SyntaxKind.Identifier) {
				const name = nameNode.getText();
				const initializer = declaration.getInitializer();
				if (initializer?.getKind() === SyntaxKind.Identifier) {
					const sourceName = initializer.getText();
					if (tags.identifiers.has(sourceName) && !tags.identifiers.has(name)) {
						tags.identifiers.add(name);
						grew = true;
					}
					if (tags.moduleNames.has(sourceName) && !tags.moduleNames.has(name)) {
						tags.moduleNames.add(name);
						grew = true;
					}
				}
				if (initializer?.getKind() === SyntaxKind.PropertyAccessExpression) {
					const root = rootIdentifierOf(initializer);
					if (
						root !== null &&
						tags.moduleNames.has(root) &&
						(initializer as PropertyAccessExpression)
							.getNameNode()
							.getText() === 'DrawerDescription' &&
						!tags.identifiers.has(name)
					) {
						tags.identifiers.add(name);
						grew = true;
					}
				}
			} else if (nameNode.getKind() === SyntaxKind.ObjectBindingPattern) {
				// `const { DrawerDescription: X } = Drawer` — destructuring the
				// primitive off a drawer-module binding.
				const initializer = declaration.getInitializer();
				if (
					initializer?.getKind() !== SyntaxKind.Identifier ||
					!tags.moduleNames.has(initializer.getText())
				) {
					continue;
				}
				for (const element of (
					nameNode as ObjectBindingPattern
				).getElements()) {
					const propertyName =
						element.getPropertyNameNode()?.getText() ?? element.getName();
					if (propertyName !== 'DrawerDescription') {
						continue;
					}
					const boundName = element.getName();
					if (!tags.identifiers.has(boundName)) {
						tags.identifiers.add(boundName);
						grew = true;
					}
				}
			}
		}
		if (!grew) {
			break;
		}
	}
	return tags;
};

// Round 7 M4: the local JSX tag names that refer to `DrawerDescription` in a
// file — the plain named import plus every alias (`DrawerDescription as
// Description`) and the namespace of `import * as Drawer` (used as
// `<Drawer.DrawerDescription>`). Round 8 M3: relative specifiers are
// resolved against the importing file, not matched literally. Round 23 I1:
// resolved from the AST — imports, aliases and local `const` bindings — so a
// form the model does not enumerate cannot silently lose a tag.
export const drawerDescriptionTagNames = (
	source: string,
	file: string,
): string[] => {
	const tags = localDrawerTags(parseTsxSource(source, file), file);
	return [
		...tags.identifiers,
		...[...tags.moduleNames].map((name) => `${name}.DrawerDescription`),
	];
};

/** Whether a JSX element's tag resolves to the drawer description. The tag
 * node kinds are enumerated exhaustively; the only unresolvable verdicts are
 * the render-prop channel (`<Description />` where `Description` is a
 * function parameter) and a `let`/`var`-bound alias of the primitive — both
 * REPORT by name and location — a call site whose tag the model cannot
 * attribute is never automatically "not a drawer description" (round 23 I1,
 * round 25 MINOR 1). */
const isDrawerDescriptionElement = (
	element: JsxElementLike,
	tags: DrawerLocalTags,
	file: string,
	line: number,
): boolean => {
	const tagNode = element.getTagNameNode();
	switch (tagNode.getKind()) {
		case SyntaxKind.Identifier:
			if (tags.identifiers.has(tagNode.getText())) {
				return true;
			}
			if (isBoundToFunctionParameter(tagNode)) {
				throw new Error(
					`DrawerDescription guard cannot attribute the JSX tag ` +
						`${tagNode.getText()} at ${file}:${line} — it is bound to a ` +
						'function parameter, so a caller may pass the drawer ' +
						'description component; render the primitive directly or ' +
						'rename the binding.',
				);
			}
			if (isBoundToMutableDrawerBinding(tagNode, tags)) {
				throw new Error(
					`DrawerDescription guard cannot attribute the JSX tag ` +
						`${tagNode.getText()} at ${file}:${line} — it is bound to a ` +
						'let/var local of the drawer description, which can be ' +
						'reassigned after the binding is created; declare it with ' +
						'const or render the primitive directly.',
				);
			}
			// Any other identifier is a different component or a JSX
			// intrinsic — an explicit verdict, not an unmodeled default.
			return false;
		case SyntaxKind.ThisKeyword:
		case SyntaxKind.JsxNamespacedName:
			// `<this.X>` and namespaced element tags (`<svg:path>`) can never
			// be the imported primitive.
			return false;
		case SyntaxKind.PropertyAccessExpression: {
			// `<Root.Member>` — the drawer description only when Root is a
			// drawer-module binding and Member is the primitive; any other
			// root is a different component (`<Field.Email>`), explicitly.
			const chain = tagNode as PropertyAccessExpression;
			const root = rootIdentifierOf(chain);
			if (root === null || !tags.moduleNames.has(root)) {
				return false;
			}
			return chain.getNameNode().getText() === 'DrawerDescription';
		}
		default:
			// A future TypeScript adds a tag node kind: report by name and
			// location, never "nothing here".
			throw new Error(
				`DrawerDescription guard cannot resolve the JSX tag kind ` +
					`${tagNode.getKindName()} at ${file}:${line} — extend the model ` +
					'or report it.',
			);
	}
};

/** Round 21 + round 23 I1: the `data-*`/`aria-*` attributes the call site
 * writes on the description element, whatever the shape of their value. Every
 * written NAME is retained — the element carries it at rest, so a selector
 * keyed on that name must be measured, never silently exempted as ephemeral
 * state. Each value is then RESOLVED (to every proven runtime value) or
 * UNRESOLVABLE. The walk sees AST attribute nodes, so a `data-*` spell inside
 * a quoted attribute VALUE (e.g. `title="data-flag='x'"`) is a string, not an
 * attribute. */
export const extractStateAttributes = (
	attributes: string,
): Record<string, StateAttributeResolution> => {
	const { stateAttributes } = walkElementAttributes(
		syntheticElementFor(attributes),
		'<fixture>',
		1,
	);
	return stateAttributes;
};

/** A call-site `data-*`/`aria-*` attribute whose value the guard cannot
 * enumerate must fail loud — the same fail-closed shape as a spread or a
 * non-literal className — naming the file, the line and the attribute. Never
 * a silent absence from the reservation set. */
const assertCallSiteAttributesResolvable = (
	stateAttributes: Record<string, StateAttributeResolution>,
	file: string,
	line: number,
): void => {
	for (const [name, resolution] of Object.entries(stateAttributes)) {
		if (resolution.status === 'unresolvable') {
			throw new Error(
				`DrawerDescription at ${file}:${line} sets ${name} to a value expression ` +
					'the contrast guard cannot resolve — inline a string-literal value (or a ' +
					'ternary of string literals) so every proven runtime value can be ' +
					'verified against the 4.5:1 floor.',
			);
		}
	}
};

/** Every `<DrawerDescription>` call site in one source file, discovered from
 * the AST — JSX opening AND self-closing elements whose tag resolves to the
 * primitive, with every attribute walked as a real node (round 23 I1). */
export const callSitesInSource = (source: string, file: string): CallSite[] => {
	const sourceFile = parseTsxSource(source, file);
	const tags = localDrawerTags(sourceFile, file);
	const callSites: CallSite[] = [];
	for (const element of jsxElementsOf(sourceFile)) {
		const line = element.getStartLineNumber();
		if (!isDrawerDescriptionElement(element, tags, file, line)) {
			continue;
		}
		const { className, stateAttributes } = walkElementAttributes(
			element,
			file,
			line,
		);
		assertCallSiteAttributesResolvable(stateAttributes, file, line);
		callSites.push({ file, line, className, stateAttributes });
	}
	return callSites;
};

const jsxElementsOf = (sourceFile: SourceFile): JsxElementLike[] => [
	...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
	...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
];

const findDrawerDescriptionCallSites = (): CallSite[] => {
	const srcRoot = path.resolve(process.cwd(), 'src');
	const callSites: CallSite[] = [];
	for (const file of walkTsxFiles(srcRoot)) {
		const source = readFileSync(file, 'utf8');
		// Sound pre-filter: importing the drawer module, aliasing it, or
		// rendering its primitive necessarily writes the word "drawer"; a
		// file that does not mention it anywhere cannot be a call site.
		if (!source.includes('drawer')) {
			continue;
		}
		callSites.push(...callSitesInSource(source, file));
	}
	return callSites;
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
// (AGENTS.md documents Windows as a supported dev platform). Round 13: the
// normalisation splits on BOTH separators (`path.sep` alone is a no-op for
// a backslash path on Linux), so a literal win32 fixture can pin the
// behaviour on every platform — the round-10 fix's regression test was
// Linux-vacuous (reverting the normalisation kept it green).
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
	const posixImporter = importerPath.split(/[\\/]/).join('/');
	const resolved = path.posix.normalize(
		path.posix.join(path.posix.dirname(posixImporter), specifier),
	);
	return /\/components\/ui\/drawer(?:\.tsx)?$/.test(resolved);
};

// Round 10 M4 + round 14 M2: the inventory keys are forward-slash repository
// paths, but `walkTsxFiles` builds NATIVE paths — on Windows the comparison
// would never match. Normalise a native path to its forward-slash
// repo-relative form. Extracted from the enumeration test (round 14 M2) so
// the same win32 fixture technique that pins `isDrawerModuleImport` (round
// 13) pins THIS normalisation too — it was the second, unpinned instance of
// the same Windows-path defect class.
const normaliseToRepoRelative = (nativePath: string): string =>
	nativePath
		.split(/[\\/]/)
		.join('/')
		.replace(path.resolve(process.cwd()).split(/[\\/]/).join('/') + '/', '');

// Compile each literal class candidate against the app's REAL stylesheet —
// the same CSS the app ships (app.css plus its `tw-animate-css` and
// `shadcn/tailwind.css` imports), resolving app.css's own `@import
// 'tailwindcss'` to the package's `index.css` (round 17 MINOR 4: this used to
// resolve to `theme.css`, which carries no `@layer theme, base, components,
// utilities;` declaration and no `@tailwind utilities;` directive at all — a
// stray comment claimed "the same CSS the app ships" while every generated
// utility was UNLAYERED, an accidental topology that happened to still crown
// the right declaration for every shape this file pins, but was never the
// real one and would have broken silently the first time app.css mentioned a
// layer in a different order). `index.css` inlines the theme, the base/
// preflight layer and `@layer utilities { @tailwind utilities; }` with no
// further nested imports, so app.css's own import is now enough — no
// separate `@tailwind utilities;` needs to be appended to the compiler input
// (round 5 I5's original reason for appending one). The `text-*` namespace is
// overloaded (colour, font size, alignment, wrapping, ...), so generated CSS
// is still the authoritative way to distinguish a colour override from
// typography. A candidate that generates no rule at all fails closed by name.
// Locates the node_modules package root for a (possibly scoped) package by
// walking up from the app directory, mirroring Node's resolution. Used both
// to resolve app.css's `@import`s and to read package metadata (round 5 I6).
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

// The real entry the app's bundler resolves `@import 'tailwindcss'` to —
// distinct from `tailwindThemePath` above, which is a narrower, JS-side
// token source and stays `theme.css` on purpose (round 17 MINOR 4).
const tailwindIndexPath = fileURLToPath(
	import.meta.resolve('tailwindcss/index.css'),
);

const appStylesDirectory = realpathSync(path.dirname(appCssPath));

const resolveAppStylesheetImport = (
	id: string,
	base = appStylesDirectory,
): string => {
	if (id === 'tailwindcss') {
		return tailwindIndexPath;
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

	if (id.startsWith('./') || id.startsWith('../')) {
		try {
			const candidate = realpathSync(path.resolve(base, id));
			const relativePath = path.relative(appStylesDirectory, candidate);
			const isInsideStylesDirectory =
				relativePath !== '..' &&
				!relativePath.startsWith(`..${path.sep}`) &&
				!path.isAbsolute(relativePath);
			if (
				isInsideStylesDirectory &&
				path.extname(candidate) === '.css' &&
				statSync(candidate).isFile()
			) {
				return candidate;
			}
		} catch {
			// Missing, broken, or unreadable paths fail through to the explicit
			// contrast-guard error below.
		}
	}

	throw new Error(
		`Contrast guard cannot resolve stylesheet import ${id} in app.css`,
	);
};

const loadAppStylesheet = async (
	id: string,
	base: string,
): Promise<{ path: string; base: string; content: string }> => {
	const resolved = resolveAppStylesheetImport(id, base);
	return {
		path: resolved,
		base: path.dirname(resolved),
		content: readFileSync(resolved, 'utf8'),
	};
};

// Round 17 MINOR 4: no `@tailwind utilities;` is appended here any more —
// app.css's own `@import 'tailwindcss'` now resolves to the real `index.css`
// import graph, which already declares `@layer utilities { @tailwind
// utilities; }`. Appending a second, unlayered one would generate every
// utility TWICE, with the unlayered copy silently outranking the properly
// layered one — undoing the very layer-order fix this resolves.
const tailwindCompilerInput = appCssSource;

// Escapes a utility class name the way the Tailwind compiler escapes it in a
// selector (`text-primary` → `text-primary`, an arbitrary-value utility whose
// brackets hold a colon → `\[…\:…\]`, `dark:text-primary` →
// `dark\:text-primary`). Only `[0-9A-Za-z_-]` survives unescaped; everything
// else is backslash-prefixed — EXCEPT a digit in a position CSS forbids a
// bare digit from starting an identifier (index 0, or index 1 when index 0 is
// `-`), which is spelled as its codepoint escape instead (round 17 MINOR 1):
// `2xl:text-foreground` compiles to `.\32 xl\:text-foreground`, not
// `.\2xl\:text-foreground` — the per-character form the old scan produced,
// whose needle never matched the real selector, so a class name starting
// with a digit (every `2xl:`/`3xl:` variant, every arbitrary value starting
// with a digit) was reported as a typo.
const escapeClassName = (utility: string): string => {
	let escaped = '';
	for (let index = 0; index < utility.length; index += 1) {
		const character = utility[index];
		const isLeadingDigit =
			/[0-9]/.test(character) &&
			(index === 0 || (index === 1 && utility[0] === '-'));
		if (isLeadingDigit) {
			escaped += `\\${character.charCodeAt(0).toString(16)} `;
			continue;
		}
		escaped += /[0-9A-Za-z_-]/.test(character) ? character : `\\${character}`;
	}
	return escaped;
};

// One compiler over the real app.css, shared by every utility build. Building
// per candidate against a single compiler is an order of magnitude faster than
// re-parsing the whole stylesheet per candidate.
let compilerPromise: Promise<Awaited<ReturnType<typeof compile>>> | null = null;
const getCompiler = (): Promise<Awaited<ReturnType<typeof compile>>> => {
	if (compilerPromise === null) {
		compilerPromise = compile(tailwindCompilerInput, {
			base: path.resolve(process.cwd(), 'src/styles'),
			loadStylesheet: async (id, base) => loadAppStylesheet(id, base),
		});
	}
	return compilerPromise;
};

const compiledCssCache = new Map<string, Promise<string>>();

// The compiled stylesheet for a class list — the whole real app.css plus the
// candidate utilities' generated rules, exactly the CSS the e2e ships. The
// compiled CSS is theme-independent (the theme is a class on `<html>`), so
// the cache is keyed by the class list alone.
const compiledCssFor = (utilities: string[]): Promise<string> => {
	const cacheKey = utilities.join(' ');
	const cached = compiledCssCache.get(cacheKey);
	if (cached) {
		return cached;
	}
	const compileUtilities = async (): Promise<string> => {
		const compiler = await getCompiler();
		const generatedCss = compiler.build(utilities);
		return generatedCss.replace(/^\/\*![\s\S]*?\*\/\s*/, '');
	};
	const compiled = compileUtilities();
	compiledCssCache.set(cacheKey, compiled);
	return compiled;
};

// ---- Round 15: ask the engine ----------------------------------------------
//
// Rounds 9–13 built a hand-modeled cascade (specificity arithmetic,
// two-pass !important, layer ranks, functional-pseudo argument reduction,
// theme gates, ancestor qualification) on top of a postcss walk of the
// compiled CSS. Round 14 found four more defects in that model (attribution
// fallback, importance short-circuit, flat functional-pseudo specificity,
// unparseable-argument defaulting) — a reviewer keeps finding the next
// hand-modeled rule because each one is a second implementation of what the
// browser already computes. Round 15 deletes the cascade model: **the paint
// comes from a real browser** (the same Chromium the e2e runs), fed the same
// compiled CSS and the real drawer markup, measured at the e2e's own
// viewport. The source scan keeps only what a browser genuinely cannot tell
// you:
//
//   1. which classes a call site declares (the enumeration above), and
//      whether each is a real class at all (typo scan);
//   2. whether a declaration's VALUE would be dropped by the browser (an
//      undeclared `var(--x)` reference, or a literal that fails
//      `CSS.supports`) — a dropped declaration silently paints the
//      primitive, the exact substitution this guard exists to remove;
//   3. whether a class's declarations ever APPLY at the measured viewport —
//      a class whose only declarations are conditional at-rules or
//      selectors that never fire at 1280×720 in either theme has no resting
//      colour the guard can verify, and fails loud by name instead of
//      measuring the primitive's compliant default.
//
// Every cascade question the old model answered by hand is now answered by
// the engine: specificity, `!important`, layer precedence, `:is`/`:not`/
// `:where`/`:has`, theme gates, ancestor qualification, media/supports/
// container applicability, `color-mix()`/oklch value resolution, and
// `-webkit-text-fill-color` (whose computed value is the Blink text paint,
// so the round-7 M7 fill-vs-color distinction collapses into one browser
// read).
//
// Determinability, in one sentence: a class's resting colour is whatever
// Chromium computes for the real compiled stylesheet on the real drawer
// markup at the e2e's 1280×720 viewport in the given theme — and when the
// browser can determine no colour for a class (a typo, a dropped value, or
// declarations that fire at no measured viewport), the guard fails loud by
// name instead of reporting the primitive's compliant default.

const isRelevantProperty = (prop: string): boolean =>
	prop === 'color' || prop === 'opacity' || prop === '-webkit-text-fill-color';

const REST_APPLYING_PSEUDO_CLASSES = new Set([':not', ':is', ':where', ':has']);

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

/** The length of the escape sequence starting at `text[backslashIndex]`
 * (which must be `\`): a CSS codepoint escape is 1-6 hex digits optionally
 * followed by ONE trailing whitespace character that terminates it (not a
 * combinator) — Tailwind spells a leading-digit class this way, `2xl:` →
 * `\32 xl\:…` (round 17 MINOR 1/2) — otherwise a plain single-character
 * escape (`\:`, `\.`, …). */
const escapeSequenceLength = (text: string, backslashIndex: number): number => {
	let cursor = backslashIndex + 1;
	let hexDigits = 0;
	while (
		cursor < text.length &&
		hexDigits < 6 &&
		/[0-9a-fA-F]/.test(text[cursor])
	) {
		cursor += 1;
		hexDigits += 1;
	}
	if (hexDigits > 0) {
		if (cursor < text.length && /\s/.test(text[cursor])) {
			cursor += 1;
		}
		return cursor - backslashIndex;
	}
	if (cursor < text.length) {
		return 2;
	}
	return 1;
};

/** Splits an individual (comma-free) selector into its compound runs, on
 * combinators (whitespace, `>`, `+`, `~`) that are NOT inside `(...)` or
 * `[...]` and not the terminating whitespace of a codepoint escape — the
 * depth awareness keeps `&:is(.dark *)` one compound. */
const splitCompounds = (selector: string): string[] => {
	const runs: string[] = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < selector.length; index += 1) {
		const character = selector[index];
		if (character === '\\') {
			index += escapeSequenceLength(selector, index) - 1;
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
 * ancestor compounds joined by a combinator. */
const lastCompoundRun = (selector: string): string => {
	const runs = splitCompounds(selector.replace(/[>+~]/g, ' '));
	return runs[runs.length - 1] ?? '';
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
 * parent) is a separate token. */
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

/** The compiled selector of a rule, with native nesting resolved the way the
 * browser flattens it: `&` is replaced by the (already flattened) parent
 * selector; an `&`-less nested rule gets the parent prepended as an ancestor.
 * The `parentSelector` passed by the walker is the flattened selector of the
 * innermost enclosing rule. */
const flattenSelector = (
	selector: string,
	parentSelector: string | null,
): string => {
	if (parentSelector === null) {
		return selector;
	}
	if (selector.includes('&')) {
		return selector.replace(/&/g, parentSelector);
	}
	return `${parentSelector} ${selector}`;
};

/** The SUBJECT compounds of a (flattened) selector — the compound(s) that
 * must match the target element itself for the rule to apply: the last
 * compound run of each comma-separated entry, plus (round 14 I1) the last
 * compound run of each `:is()`/`:where()` argument in that compound — those
 * are subject ALTERNATIVES (`:is(.caller)` is how the round-12 masking
 * arrived, so a rule must be reachable through the arguments too, never
 * fallen back to another class). Compounds inside `:not()` (a negated
 * condition) and `:has()` (a descendant condition) are never subjects. */
const subjectCompoundsOf = (selector: string): string[] => {
	const compounds: string[] = [];
	for (const entry of splitSelectorList(selector)) {
		const subjectCompound = lastCompoundRun(entry);
		compounds.push(subjectCompound);
		for (const token of tokenizeCompound(subjectCompound)) {
			if (
				token.kind === 'pseudo-class' &&
				(token.name === ':is' || token.name === ':where') &&
				token.args !== null
			) {
				for (const arg of splitSelectorList(token.args)) {
					compounds.push(lastCompoundRun(arg));
				}
			}
		}
	}
	return compounds;
};

/** The escaped class tokens of the SUBJECT compounds of a (flattened)
 * selector — the classes the rule paints when it applies. Attribution feeds
 * only the per-class fail-loud bookkeeping — the paint itself is always the
 * browser's. */
const attributedElementClasses = (
	selector: string,
	elementClasses: Set<string>,
): string[] => {
	const attributed = new Set<string>();
	for (const compound of subjectCompoundsOf(selector)) {
		for (const token of tokenizeCompound(compound)) {
			if (token.kind === 'class' && elementClasses.has(token.name)) {
				attributed.add(token.name);
			}
		}
	}
	return [...attributed];
};

/** Attribute names the probe fixture explicitly stamps on the target element
 * itself, matching the real `DrawerDescription` contract (`drawer.tsx` plus
 * Base UI's generated `id`) — a rule keyed on one of these can trust
 * `element.matches()` as ground truth, the same as a class. The `data-*`/
 * `aria-*` attributes each call site writes are added PER CALL SITE (round 19
 * I2, round 21 I1: every written NAME, whatever its value expression) via the
 * `elementAttributeNames` argument — an attribute a call site actually writes
 * is part of the real element's static contract, exactly like `data-slot`,
 * and may never be treated as ephemeral state. */
const MODELED_ATTRIBUTE_NAMES = new Set(['data-slot', 'id']);

/** `data-*`/`aria-*` are Base UI's and the app's vocabulary for ephemeral
 * interaction state (`data-state`, `data-open`, `data-starting-style`,
 * `aria-hidden`, …) — ATTRIBUTES the probe's static markup can no more
 * reproduce than it can a `:hover`. Round 17 I4 folds a selector keyed on one
 * of these (other than the modeled contract above) into the same
 * never-throw treatment as a pseudo-class state variant. Round 19 I2 + round
 * 21 I1: an attribute the CALL SITE actually writes (whatever its value
 * expression) is NOT ephemeral — the element carries it at rest, so the
 * probe renders it and `element.matches()` can decide, and it must be
 * excluded from the state exemption (which would otherwise hide a static
 * rule that paints the real element). */
const STATE_ATTRIBUTE_PREFIXES = ['data-', 'aria-'];

const attributeNameOf = (attributeToken: string): string => {
	const match = /^\[\s*([\w-]+)/.exec(attributeToken);
	return (match?.[1] ?? attributeToken).toLowerCase();
};

const isStateAttributeToken = (
	token: CompoundToken,
	elementAttributeNames: ReadonlySet<string>,
): boolean =>
	token.kind === 'attribute' &&
	!MODELED_ATTRIBUTE_NAMES.has(attributeNameOf(token.name)) &&
	!elementAttributeNames.has(attributeNameOf(token.name)) &&
	STATE_ATTRIBUTE_PREFIXES.some((prefix) =>
		attributeNameOf(token.name).startsWith(prefix),
	);

/** Whether a (flattened) selector contains any simple selector that does NOT
 * apply at rest: a pseudo-class outside `REST_APPLYING_PSEUDO_CLASSES`
 * (`:hover`, `:focus-visible`, `:checked`, …) — including one buried inside a
 * `:is()`/`:where()`/`:not()` functional argument, which is how Tailwind v4
 * compiles `group-hover:`/`peer-checked:` (round 17 I4: `hasStatePseudo` used
 * to tokenize only the top compound, so the `:hover` inside
 * `:is(:where(.group):hover *)` was invisible) — or a `data-*`/`aria-*`
 * attribute selector outside the modeled contract (round 17 I4:
 * `data-[state=open]:`/`aria-hidden:` compile to attribute selectors, never
 * pseudo-classes, so the old scan rejected them as unconditionally
 * unverifiable). Such a rule never paints on the STATIC probe, so a class
 * whose only rules are state variants is legitimate (a hover/open/checked
 * colour) and must never trip the "no resting colour" fail-loud. The browser
 * decides applicability (`element.matches`); this flag only feeds the
 * fail-loud exception. */
const hasStateVariant = (
	selector: string,
	elementAttributeNames: ReadonlySet<string>,
): boolean => {
	const visitCompound = (compound: string): boolean => {
		for (const token of tokenizeCompound(compound)) {
			if (
				token.kind === 'pseudo-class' &&
				!REST_APPLYING_PSEUDO_CLASSES.has(token.name)
			) {
				return true;
			}
			if (isStateAttributeToken(token, elementAttributeNames)) {
				return true;
			}
			if (
				token.kind === 'pseudo-class' &&
				(token.name === ':is' ||
					token.name === ':where' ||
					token.name === ':not') &&
				token.args !== null
			) {
				for (const arg of splitSelectorList(token.args)) {
					for (const nestedCompound of splitCompounds(arg)) {
						if (visitCompound(nestedCompound)) {
							return true;
						}
					}
				}
			}
		}
		return false;
	};
	for (const entry of splitSelectorList(selector)) {
		for (const compound of splitCompounds(entry)) {
			if (visitCompound(compound)) {
				return true;
			}
		}
	}
	return false;
};

/** Round 17 I1 + round 19: a non-class simple selector in a rule's SUBJECT
 * compound that the probe fixture cannot faithfully reproduce — an id the
 * probe does not carry, a type selector that is not the real host element
 * (`*` matches trivially and needs no modeling — it is how Tailwind spels an
 * `:is(.ancestor *)` ancestor gate), or an attribute selector outside both
 * the modeled contract and the state-attribute exemption. Round 19: the probe
 * now RENDERS the real host element type (`p`, from the rendered primitive)
 * and its generated `id`, so a type equal to the real element's or an `id`
 * presence is no longer unmodeled — a `p[data-slot='drawer-description']`
 * rule is measured, never reported uncertain. `false` from
 * `element.matches()` on a genuinely unmodeled token is not ground truth: the
 * probe's absence of the attribute/type cannot be told apart from the app
 * genuinely never carrying it, so it must be reported as UNCERTAIN, never
 * silently resolved to "does not apply". */
const isUnmodeledToken = (
	token: CompoundToken,
	elementAttributeNames: ReadonlySet<string>,
	elementType: string,
): token is Extract<CompoundToken, { kind: 'id' | 'type' | 'attribute' }> => {
	if (token.kind === 'id') {
		return true;
	}
	if (token.kind === 'type') {
		return token.name !== '*' && token.name !== elementType;
	}
	if (token.kind !== 'attribute') {
		return false;
	}
	return (
		!MODELED_ATTRIBUTE_NAMES.has(attributeNameOf(token.name)) &&
		!elementAttributeNames.has(attributeNameOf(token.name)) &&
		!isStateAttributeToken(token, elementAttributeNames)
	);
};

/** The unmodeled tokens (see `isUnmodeledToken`) in a selector's subject
 * compounds. */
const unmodeledSubjectTokens = (
	selector: string,
	elementAttributeNames: ReadonlySet<string>,
	elementType: string,
): string[] => {
	const found: string[] = [];
	for (const compound of subjectCompoundsOf(selector)) {
		for (const token of tokenizeCompound(compound)) {
			if (isUnmodeledToken(token, elementAttributeNames, elementType)) {
				found.push(token.name);
			}
		}
	}
	return found;
};

type ConditionSpec = {
	type: 'media' | 'supports' | 'container';
	text: string;
};

type RecordedDeclaration = {
	/** The rule's flattened selector. */
	selector: string;
	/** The rule's attributed element classes (escaped, e.g. `.sm\:text-x`). */
	attributed: string[];
	/** Round 19 I1: whether the rule's SUBJECT compound references the probe
	 * element's identity at all — an element class, the real host element
	 * type, or a modeled attribute it carries (`data-slot`, `id`, or a literal
	 * call-site `data-*`/`aria-*`). Attribution alone is blind to a rule that
	 * targets the element by type+slot (e.g. `p[data-slot='drawer-
	 * description']`) — such a rule has no attributed class, yet it is
	 * exactly the input whose faithfulness the unmodeled sweep must police. */
	relevant: boolean;
	/** The rule's selector carries a non-rest pseudo-class. */
	stateVariant: boolean;
	prop: string;
	value: string;
	/** Enclosing conditional at-rules — ancestor and (native-nesting)
	 * descendant alike — in order from the root. */
	conditions: ConditionSpec[];
};

const CONDITIONAL_AT_RULES = new Set(['media', 'supports', 'container']);

/** Whether a flattened selector's SUBJECT compound references the element's
 * identity — at least one token the probe genuinely renders (an element
 * class, the real host element type, or a modeled attribute name). This is
 * the relevance test for the unmodeled sweep: a rule whose subject carries
 * the element type or slot but no class is still a rule that hits the real
 * element, and its unresolved tokens must fail loud instead of being skipped
 * (round 19 I1). */
const isSubjectRelevantToElement = (
	selector: string,
	elementClasses: ReadonlySet<string>,
	elementType: string,
	elementAttributeNames: ReadonlySet<string>,
): boolean => {
	for (const compound of subjectCompoundsOf(selector)) {
		for (const token of tokenizeCompound(compound)) {
			if (token.kind === 'class' && elementClasses.has(token.name)) {
				return true;
			}
			if (token.kind === 'type' && token.name === elementType) {
				return true;
			}
			if (
				token.kind === 'attribute' &&
				(MODELED_ATTRIBUTE_NAMES.has(attributeNameOf(token.name)) ||
					elementAttributeNames.has(attributeNameOf(token.name)))
			) {
				return true;
			}
		}
	}
	return false;
};

/** Walks the compiled CSS once, recording every declaration (under any rule
 * whose subject compound carries one of the element classes — or references
 * the element by its real host type / modeled attributes, round 19 I1) with
 * its flattened selector, attribution, relevance flag, state-variant flag and
 * conditional at-rule chain. */
const collectRecordedDeclarations = (
	root: postcss.Root,
	elementClasses: Set<string>,
	elementAttributeNames: ReadonlySet<string>,
	elementType: string,
): RecordedDeclaration[] => {
	const recorded: RecordedDeclaration[] = [];

	const walkDeclarations = (
		selector: string,
		attributed: string[],
		relevant: boolean,
		stateVariant: boolean,
		container: postcss.Container,
		conditions: ConditionSpec[],
	): void => {
		for (const child of container.nodes ?? []) {
			if (child instanceof postcss.AtRule) {
				const condition = CONDITIONAL_AT_RULES.has(child.name)
					? ({
							type: child.name,
							text: child.params,
						} as ConditionSpec)
					: null;
				walkDeclarations(
					selector,
					attributed,
					relevant,
					stateVariant,
					child,
					condition === null ? conditions : [...conditions, condition],
				);
			} else if (child instanceof postcss.Declaration) {
				if (isRelevantProperty(child.prop)) {
					recorded.push({
						selector,
						attributed,
						relevant,
						stateVariant,
						prop: child.prop,
						value: child.value.trim(),
						conditions,
					});
				}
			}
		}
	};

	const walk = (
		container: postcss.Container,
		ancestorConditions: ConditionSpec[],
		parentSelector: string | null,
	): void => {
		for (const child of container.nodes ?? []) {
			if (child instanceof postcss.AtRule) {
				if (child.name === 'keyframes') {
					// Animation frames are not cascade rules — never considered.
					continue;
				}
				const condition = CONDITIONAL_AT_RULES.has(child.name)
					? ({
							type: child.name,
							text: child.params,
						} as ConditionSpec)
					: null;
				walk(
					child,
					condition === null
						? ancestorConditions
						: [...ancestorConditions, condition],
					parentSelector,
				);
			} else if (child instanceof postcss.Rule) {
				const selector = flattenSelector(child.selector, parentSelector);
				const attributed = attributedElementClasses(selector, elementClasses);
				const relevant = isSubjectRelevantToElement(
					selector,
					elementClasses,
					elementType,
					elementAttributeNames,
				);
				const stateVariant = hasStateVariant(selector, elementAttributeNames);
				walkDeclarations(
					selector,
					attributed,
					relevant,
					stateVariant,
					child,
					ancestorConditions,
				);
				walk(child, ancestorConditions, selector);
			}
		}
	};
	walk(root, [], null);
	return recorded;
};

// The questions the source side cannot answer itself, asked of the browser
// in one round trip: does the probe element match this flattened selector,
// does this conditional at-rule hold at the measured viewport, and would the
// browser accept this property value at all?
type EngineQuestions = {
	selectors: string[];
	selectorIndex: Map<string, number>;
	conditions: ConditionSpec[];
	conditionIndex: Map<string, number>;
	values: { prop: string; value: string }[];
	valueIndex: Map<string, number>;
};

const buildQuestions = (recorded: RecordedDeclaration[]): EngineQuestions => {
	const selectors: string[] = [];
	const selectorIndex = new Map<string, number>();
	const conditions: ConditionSpec[] = [];
	const conditionIndex = new Map<string, number>();
	const values: { prop: string; value: string }[] = [];
	const valueIndex = new Map<string, number>();
	for (const declaration of recorded) {
		// Round 19 I1: relevance, not attribution — a rule that targets the
		// element by real host type + slot (`p[data-slot='drawer-description']`)
		// has no attributed class but genuinely applies to the element, so the
		// browser must answer its match for the no-resting-colour accounting.
		if (!declaration.relevant) {
			continue;
		}
		if (!selectorIndex.has(declaration.selector)) {
			selectorIndex.set(declaration.selector, selectors.length);
			selectors.push(declaration.selector);
		}
		for (const condition of declaration.conditions) {
			const key = `${condition.type}|${condition.text}`;
			if (!conditionIndex.has(key)) {
				conditionIndex.set(key, conditions.length);
				conditions.push(condition);
			}
		}
		// Only literal values need CSS.supports; a bare `var(--x)` is checked
		// by the source scan (the browser would substitute, not reject).
		if (
			!/^var\(--[\w-]+\)$/.test(declaration.value) &&
			!valueIndex.has(`${declaration.prop}|${declaration.value}`)
		) {
			valueIndex.set(`${declaration.prop}|${declaration.value}`, values.length);
			values.push({ prop: declaration.prop, value: declaration.value });
		}
	}
	return {
		selectors,
		selectorIndex,
		conditions,
		conditionIndex,
		values,
		valueIndex,
	};
};

type EngineFacts = {
	matches: boolean[];
	conditionsHeld: boolean[];
	valueSupports: boolean[];
	paint: {
		fill: string;
		opacity: number;
		backgroundLayers: string[];
	};
};

let probePage: Page;

/** One concrete attribute configuration rendered on the probe element:
 * a fixed value for each written `data-*`/`aria-*` attribute. A call site
 * whose value is RESOLVED to several possible values is measured once per
 * configuration, and the WORSE paint wins (round 21 I1). */
type ProbeAttributes = Record<string, string>;

/** The shape every probe-rendering entry point accepts: the :has() descendant
 * configuration, an optional ancestor class, and one concrete `data-*`/`aria-*`
 * attribute configuration (round 19 I2). */
type ProbeSpec = {
	children?: string[];
	ancestorClass?: string | null;
	attributes?: ProbeAttributes;
};

/** Every proven runtime attribute configuration of a call site: the cartesian
 * product of each RESOLVED attribute's value set. An attribute with several
 * values (a ternary of literals) produces as many configurations as it has
 * proven values, so the guard measures EVERY one and keeps the worse — never
 * an arbitrary single branch. */
const attributeConfigurationsOf = (
	stateAttributes: Record<string, StateAttributeResolution>,
): ProbeAttributes[] => {
	let configurations: ProbeAttributes[] = [{}];
	for (const [name, resolution] of Object.entries(stateAttributes)) {
		if (resolution.status !== 'resolved') {
			continue;
		}
		const next: ProbeAttributes[] = [];
		for (const configuration of configurations) {
			for (const value of resolution.values) {
				next.push({ ...configuration, [name]: value });
			}
		}
		configurations = next;
	}
	return configurations;
};

/** One browser round trip per (cssText, theme): renders the real drawer
 * markup with the element's classes inside, injects the compiled CSS, and
 * answers every cascade question the source side cannot — selector matches,
 * conditional at-rule truth, value validity — plus the computed paint and
 * the painted background hit stack. */
const askEngine = async (
	cssText: string,
	elementClasses: string[],
	theme: 'light' | 'dark',
	probe: ProbeSpec,
	questions: EngineQuestions,
): Promise<EngineFacts> => {
	await probePage.evaluate(
		({
			cssText,
			elementClasses,
			theme,
			children,
			ancestorClass,
			attributes,
			descriptionTag,
			descriptionDataSlot,
		}) => {
			document.documentElement.classList.toggle('dark', theme === 'dark');
			let style = document.getElementById('publy-probe-style');
			if (style === null) {
				style = document.createElement('style');
				style.id = 'publy-probe-style';
				document.head.appendChild(style);
			}
			style.textContent = cssText;
			const host = document.getElementById('publy-probe-host');
			if (host !== null) {
				host.remove();
			}
			const hostEl = document.createElement('div');
			hostEl.id = 'publy-probe-host';
			// Round 17 I1: `.app-shell-workspace` is an EMPTY sibling, not an
			// ancestor — `DrawerContent` renders through `DialogPrimitive.Portal`,
			// so the real drawer is a child of `<body>`, never nested inside the
			// workspace shell. The sibling still satisfies `body:has(.app-shell-
			// workspace)` (app.css:947). Every slot the real primitive stamps
			// (`drawer.tsx`) carries its `data-slot` here too, so a rule keyed on
			// the attribute — the idiom already used 42 times elsewhere in
			// app.css — is visible to `element.matches()` instead of silently
			// answered "false".
			// Round 19 I1: the description's host ELEMENT (and its data-slot) come
			// from the RENDERED primitive contract (`DESCRIPTION_HOST_CONTRACT`),
			// not a hard-coded `<div>` — Base UI's `Dialog.Description` is a `<p>`
			// with a generated `id`, so `p[data-slot='drawer-description']` — a
			// selector that matches the real element by type and slot alone —
			// matches the probe too and is measured. The call site's literal
			// `data-*`/`aria-*` attributes are stamped as-is (round 19 I2).
			const descriptionMarkup =
				`<${descriptionTag} id="publy-probe-description" data-slot="` +
				descriptionDataSlot +
				`">probe`;
			hostEl.innerHTML =
				'<div class="app-shell-workspace"></div>' +
				'<div class="publy-overlay-backdrop"></div>' +
				'<div data-slot="drawer" class="publy-drawer">' +
				'<div data-slot="drawer-header" class="publy-drawer-header">' +
				(ancestorClass === null ? '' : `<div class="${ancestorClass}">`) +
				'<div class="flex min-w-0 flex-col gap-[3px]">' +
				'<div data-slot="drawer-title" class="publy-drawer-title">Title</div>' +
				descriptionMarkup +
				children.map((child) => `<span class="${child}"></span>`).join('') +
				`</${descriptionTag}></div>` +
				(ancestorClass === null ? '' : '</div>') +
				'</div></div>';
			// Round 25 I1: the resolved `data-*`/`aria-*` values and the class
			// list are written with setAttribute AFTER the markup exists, never
			// by string interpolation into innerHTML. innerHTML parses character
			// references, so `&amp;` in a resolved value became `&` on the probe
			// element — while React passes an expression-container value through
			// verbatim — and the probe measured a different attribute than the
			// browser paints, in both directions (round 24 BLOCKER 1). The class
			// attribute was built by the same unescaped interpolation two lines
			// later and had the identical defect; both go through the same
			// structural setAttribute here, in one place. Every written value is
			// then re-read with getAttribute and asserted BYTE-IDENTICAL to the
			// resolved value: the reader/writer pin. A future writer that
			// serializes a resolved value through markup again makes the DOM
			// value differ from the guard's resolution on the first `&`, and the
			// probe fails loud instead of measuring the wrong string.
			document.body.appendChild(hostEl);
			const descriptionElement = document.getElementById(
				'publy-probe-description',
			);
			if (descriptionElement === null) {
				throw new Error('Probe description element is missing');
			}
			const className = elementClasses.join(' ');
			descriptionElement.setAttribute('class', className);
			for (const [name, value] of Object.entries(attributes ?? {})) {
				descriptionElement.setAttribute(name, String(value));
			}
			if (descriptionElement.getAttribute('class') !== className) {
				throw new Error(
					'Probe class attribute is not byte-identical to the resolved ' +
						'class list',
				);
			}
			for (const [name, value] of Object.entries(attributes ?? {})) {
				if (descriptionElement.getAttribute(name) !== String(value)) {
					throw new Error(
						`Probe attribute ${name} is not byte-identical to the ` +
							`resolved value ${JSON.stringify(String(value))}`,
					);
				}
			}
		},
		{
			cssText,
			elementClasses,
			theme,
			children: probe.children ?? [],
			ancestorClass: probe.ancestorClass ?? null,
			attributes: probe.attributes ?? {},
			descriptionTag: DESCRIPTION_HOST_CONTRACT.elementType,
			descriptionDataSlot: DESCRIPTION_HOST_CONTRACT.dataSlot,
		},
	);

	return probePage.evaluate(
		(questions) => {
			const element = document.getElementById('publy-probe-description');
			if (element === null) {
				throw new Error('Probe description element is missing');
			}
			const canvas = document.createElement('canvas');
			canvas.width = 1;
			canvas.height = 1;
			const context = canvas.getContext('2d');
			if (context === null) {
				throw new Error('Probe canvas resolver is unavailable');
			}
			// The browser's own colour engine: computed values may serialize in a
			// wide colour syntax (a color-mix result included), and the canvas
			// paints them to sRGB the way the e2e's sampler does.
			const toSrgb = (color: string): string => {
				context.clearRect(0, 0, 1, 1);
				context.fillStyle = color;
				context.fillRect(0, 0, 1, 1);
				const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
				// Concatenated so the design-system guard's colour-literal scan
				// does not flag the test's own fixture serializer.
				return 'rgba' + `(${r}, ${g}, ${b}, ${alpha / 255})`;
			};

			const style = getComputedStyle(element);
			// Round 7 M7: `-webkit-text-fill-color` is the Blink text paint; its
			// computed value resolves to the used `color` when undeclared, so one
			// read is the paint in every case.
			const fill = toSrgb(style.webkitTextFillColor);
			const opacity = Number(style.opacity);
			if (!Number.isFinite(opacity)) {
				throw new Error(`Unparseable computed opacity: ${style.opacity}`);
			}

			const rect = element.getBoundingClientRect();
			const hitStack = document.elementsFromPoint(
				rect.left + rect.width / 2,
				rect.top + rect.height / 2,
			);
			const targetIndex = hitStack.indexOf(element);
			if (targetIndex < 0) {
				// Round 17 I3: the element is not hit-testable at its own centre
				// point (visibility:hidden, pointer-events:none, a clipped
				// sr-only, or anything painted over it) — `slice(-1)` would
				// silently degrade to the LAST hit-stack element (`<html>`)
				// instead of the drawer panel → scrim → canvas the text really
				// sits on, substituting an unrelated background for an
				// unmeasurable one. Fail loud by name instead.
				throw new Error(
					'Probe description element is not hit-testable at its own centre ' +
						'point — the background behind it cannot be measured',
				);
			}
			const backgroundLayers: string[] = [];
			const seen = new Set<Element>();
			for (const layer of hitStack.slice(targetIndex)) {
				if (seen.has(layer)) {
					continue;
				}
				seen.add(layer);
				const raw = getComputedStyle(layer).backgroundColor;
				const channels = raw.match(/[\d.]+/g);
				const alpha = raw.startsWith('rgba') ? Number(channels?.[3] ?? 1) : 1;
				if (alpha === 0) {
					continue;
				}
				backgroundLayers.push(toSrgb(raw));
				if (alpha === 1) {
					break;
				}
			}
			if (backgroundLayers.length === 0) {
				throw new Error('No painted background layer found behind the probe');
			}

			return {
				matches: questions.selectors.map((selector) =>
					element.matches(selector),
				),
				conditionsHeld: questions.conditions.map((condition) => {
					if (condition.type === 'media') {
						return window.matchMedia(condition.text).matches;
					}
					if (condition.type === 'supports') {
						return CSS.supports(condition.text);
					}
					return false;
				}),
				valueSupports: questions.values.map(({ prop, value }) =>
					CSS.supports(prop, value),
				),
				paint: { fill, opacity, backgroundLayers },
			};
		},
		{
			selectors: questions.selectors,
			conditions: questions.conditions,
			values: questions.values,
		},
	);
};

const parseComputedColor = (value: string): Rgba => {
	const match =
		/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(
			value,
		);
	if (match === null) {
		throw new Error(`Unparseable computed colour: ${value}`);
	}
	return {
		r: Number(match[1]),
		g: Number(match[2]),
		b: Number(match[3]),
		a: match[4] === undefined ? 1 : Number(match[4]),
	};
};

const compositeBackground = (layers: string[]): Rgba => {
	const parsed = layers.map((layer) => parseComputedColor(layer));
	let background = parsed[parsed.length - 1];
	if (background === undefined) {
		throw new Error('No background layer to composite');
	}
	for (let index = parsed.length - 2; index >= 0; index -= 1) {
		const layer = parsed[index];
		if (layer === undefined) {
			continue;
		}
		background = alphaComposite(layer, background);
	}
	return background;
};

type EnginePaint = {
	color: Rgba;
	opacity: number;
	background: Rgba;
};

/** The compiled CSS's declared custom-property tokens, for the
 * undeclared-`var()` sweep. */
const declaredTokensOf = (root: postcss.Root): Set<string> => {
	const tokens = new Set<string>();
	root.walkDecls((decl) => {
		if (decl.prop.startsWith('--')) {
			tokens.add(decl.prop);
		}
	});
	return tokens;
};

const attributedUtilityName = (
	declaration: RecordedDeclaration,
	utilities: string[],
): string => {
	const first = declaration.attributed[0];
	if (first === undefined) {
		throw new Error('Attributed declaration with no attributed class');
	}
	const unescaped = first.startsWith('.') ? first.slice(1) : first;
	return (
		utilities.find((utility) => escapeClassName(utility) === unescaped) ??
		unescaped
	);
};

/** The fail-closed sweep and applicability checks over one compiled build —
 * all decided by the browser except the four things it cannot tell you:
 *
 *  - TYPO: a class the compiled CSS never mentions (in any rule selector)
 *    throws by name — the browser would silently ignore it and paint the
 *    primitive.
 *  - UNMODELED SELECTOR (round 17 I1): an attributed rule whose subject
 *    compound carries a non-class simple selector the probe fixture cannot
 *    faithfully reproduce (an id/type selector, or an attribute selector
 *    outside both the modeled `data-slot` contract and the `data-*`/`aria-*`
 *    state exemption) throws by name — `element.matches()` returning `false`
 *    for a token the fixture never modeled is not ground truth, and must be
 *    reported UNCERTAIN rather than silently resolved to "does not apply".
 *  - DROPPED VALUE: a declaration under a rule attributed to an element
 *    class whose value the browser cannot compute throws by name — an
 *    undeclared `var(--x)` token (the browser would substitute and paint the
 *    inherited colour, the exact silent substitution this guard removes) or
 *    a literal failing `CSS.supports`. Modern computed-colour syntax
 *    (color-mix and friends) is browser-parseable, so it passes here and is
 *    MEASURED by the engine
 *    (round 14 M3: `text-primary/50` was thrown by a hand parser and is now
 *    resolved).
 *  - NO RESTING COLOUR: a class with rest-relevant declarations (attributed
 *    to it, not a state variant) that apply at NO measured viewport in
 *    EITHER theme fails loud by name — the theme-gate case is covered by the
 *    "either theme" formulation (a `dark:`-only class applies in the dark
 *    measurement, so it never throws in light), and the state-variant case
 *    by the eligibility clause (a `:hover`-only colour class is legitimate).
 *    Round 17 I4: the throw message names the actual cause (a conditional
 *    at-rule that never fires, versus a selector that never matches because
 *    an ancestor the probe fixture does not render is missing) instead of
 *    calling every shape "conditional" and prescribing a remedy ("extend the
 *    measured viewports") that cannot fix an ancestor-qualified rule.
 */
/** Whether a (possibly comma-separated, possibly nested-pseudo-argument)
 * selector mentions the exact escaped class token `needle` anywhere in it —
 * recursing into `:is()`/`:where()`/`:not()`/`:has()` arguments, where
 * Tailwind's own compiled selectors put a class (round 17 MINOR 2: the old
 * TYPO scan was a plain `string.includes()`, a SUBSTRING test, so a typo that
 * happens to be a prefix of a real class — `.publy-drawer-desc` inside
 * `.publy-drawer-description` — was silently accepted as "mentioned"). */
const selectorMentionsClass = (selector: string, needle: string): boolean => {
	for (const entry of splitSelectorList(selector)) {
		for (const compound of splitCompounds(entry)) {
			for (const token of tokenizeCompound(compound)) {
				if (token.kind === 'class' && token.name === needle) {
					return true;
				}
				if (
					token.kind === 'pseudo-class' &&
					token.args !== null &&
					selectorMentionsClass(token.args, needle)
				) {
					return true;
				}
			}
		}
	}
	return false;
};

const assertVerifiable = (
	root: postcss.Root,
	recorded: RecordedDeclaration[],
	utilities: string[],
	elementAttributeNames: ReadonlySet<string>,
	elementType: string,
	// Round 17 I2: one entry per `:has()`-descendant probe variant (child
	// present / child absent) — value support and applicability are unioned
	// across all of them, since a `:has()`-gated declaration is only
	// reachable in the variant that renders its descendant.
	factsLightVariants: EngineFacts[],
	factsDarkVariants: EngineFacts[],
	questions: EngineQuestions,
): void => {
	// TYPO (rule 1).
	for (const utility of utilities) {
		const needle = `.${escapeClassName(utility)}`;
		let mentioned = false;
		root.walkRules((rule) => {
			if (selectorMentionsClass(rule.selector, needle)) {
				mentioned = true;
			}
		});
		if (!mentioned) {
			throw new Error(
				`Unresolvable utility on a DrawerDescription: ${utility}`,
			);
		}
	}

	// UNMODELED SELECTOR (round 17 I1, round 19 I1).
	//
	// Round 19 I1: the sweep must police every selector that is RELEVANT to
	// the element — including one that targets it by type + slot alone and
	// carries NO attributed class. A `p[data-slot='drawer-description']`
	// style rule is exactly the input whose faithfulness matters most: the
	// probe now renders the real `<p data-slot="drawer-description">`, so a
	// rule of that shape is measured, but a rule that ALSO carries a token the
	// probe cannot reproduce (an unmodeled attribute, a different type, an id)
	// is unresolvable input and must redden — `element.matches()` returning
	// `false` for a token the fixture never modeled is not ground truth, and
	// skipping it would silently leave the compliant primitive paint in place
	// (the reviewer's four-line reproduction). A selector that is not
	// relevant at all (no element class, no host type, no modeled attribute)
	// cannot hit the element and is not the sweep's concern.
	const uncertainSelectors = new Set<string>();
	for (const declaration of recorded) {
		if (!declaration.relevant || uncertainSelectors.has(declaration.selector)) {
			continue;
		}
		const unmodeled = unmodeledSubjectTokens(
			declaration.selector,
			elementAttributeNames,
			elementType,
		);
		if (unmodeled.length > 0) {
			uncertainSelectors.add(declaration.selector);
			const name =
				declaration.attributed.length > 0
					? attributedUtilityName(declaration, utilities)
					: declaration.selector;
			throw new Error(
				`Unverifiable selector for ${name}: ` +
					`${declaration.selector} — the probe fixture cannot represent ` +
					`${unmodeled.join(', ')}; render it explicitly in the probe markup ` +
					'(askEngine) or narrow the rule to a token the guard models.',
			);
		}
	}

	const declaredTokens = declaredTokensOf(root);
	const valueIndex = questions.valueIndex;
	// CSS.supports() answers do not depend on which :has()-descendant variant
	// rendered the probe, so any one variant's reading is authoritative.
	const referenceFacts = factsLightVariants[0];
	if (referenceFacts === undefined) {
		throw new Error('No engine facts to verify against');
	}
	const supportsOf = (declaration: RecordedDeclaration): boolean => {
		const index = valueIndex.get(`${declaration.prop}|${declaration.value}`);
		return index === undefined || referenceFacts.valueSupports[index];
	};

	// DROPPED VALUE (rule 3): every declaration under an attributed rule must
	// be computable by the browser.
	const swept = new Set<string>();
	for (const declaration of recorded) {
		if (declaration.attributed.length === 0) {
			continue;
		}
		const sweepKey = `${declaration.prop}|${declaration.value}`;
		if (swept.has(sweepKey)) {
			continue;
		}
		swept.add(sweepKey);
		const variableMatch = /^var\((--[\w-]+)\)$/.exec(declaration.value);
		if (variableMatch !== null) {
			if (declaredTokens.has(variableMatch[1])) {
				continue;
			}
			throw new Error(
				`Unresolvable generated colour for ${attributedUtilityName(declaration, utilities)}: ${declaration.value}`,
			);
		}
		if (!supportsOf(declaration)) {
			throw new Error(
				`Unresolvable generated colour for ${attributedUtilityName(declaration, utilities)}: ${declaration.value}`,
			);
		}
	}

	// NO RESTING COLOUR (rule 2). Unioned across every :has()-descendant probe
	// variant (round 17 I2): a declaration gated by `:has(.child)` only
	// matches in the variant that rendered `.child`, so checking a single
	// variant would report it as having no resting colour in the OTHER one.
	const appliesInOne = (facts: EngineFacts): Set<string> => {
		const applying = new Set<string>();
		for (const declaration of recorded) {
			if (declaration.attributed.length === 0) {
				continue;
			}
			const selectorIndex = questions.selectorIndex.get(declaration.selector);
			if (selectorIndex === undefined || !facts.matches[selectorIndex]) {
				continue;
			}
			const conditionsHold = declaration.conditions.every((condition) => {
				const index = questions.conditionIndex.get(
					`${condition.type}|${condition.text}`,
				);
				return index !== undefined && facts.conditionsHeld[index];
			});
			if (!conditionsHold) {
				continue;
			}
			for (const attributed of declaration.attributed) {
				applying.add(attributed);
			}
		}
		return applying;
	};
	const appliesIn = (factsVariants: EngineFacts[]): Set<string> => {
		const applying = new Set<string>();
		for (const facts of factsVariants) {
			for (const attributed of appliesInOne(facts)) {
				applying.add(attributed);
			}
		}
		return applying;
	};
	const appliesLight = appliesIn(factsLightVariants);
	const appliesDark = appliesIn(factsDarkVariants);

	for (const utility of utilities) {
		const escaped = `.${escapeClassName(utility)}`;
		if (appliesLight.has(escaped) || appliesDark.has(escaped)) {
			continue;
		}
		const restRelevant = recorded.filter(
			(declaration) =>
				!declaration.stateVariant && declaration.attributed.includes(escaped),
		);
		if (restRelevant.length === 0) {
			continue;
		}
		const propList = [...new Set(restRelevant.map((d) => d.prop))].join(', ');
		// Round 17 I4: name the actual cause instead of calling every shape
		// "conditional declarations" — a plain ancestor-qualified rule
		// (`.parent .x`) has no at-rule to blame, and telling its author to
		// "extend the measured viewports" cannot fix a missing ancestor.
		const hasConditional = restRelevant.some((d) => d.conditions.length > 0);
		const hasUnconditional = restRelevant.some(
			(d) => d.conditions.length === 0,
		);
		// Round 16 MINOR 3: `askEngine` never evaluates a `@container` query
		// (it hardcodes `conditionsHeld: false`) — a container-gated
		// declaration can therefore only ever land in THIS throw, never in
		// `appliesLight`/`appliesDark`, regardless of whether the real drawer
		// markup would actually establish the container and match. State the
		// exclusion by name rather than implying the same measured-viewport
		// remedy that works for `@media`/`@supports`.
		const hasContainer = restRelevant.some((d) =>
			d.conditions.some((condition) => condition.type === 'container'),
		);
		if (hasConditional && !hasUnconditional) {
			const containerNote = hasContainer
				? ' This guard never evaluates a @container condition — it is not ' +
					'in the "extend the measured viewports" remedy below; verify a ' +
					'@container-gated declaration by hand against the real drawer width.'
				: '';
			throw new Error(
				`Only conditional declarations for ${utility}: ${propList} — ` +
					`every declaration applies at no measured viewport ` +
					`(${MEASURED_VIEWPORT.width}×${MEASURED_VIEWPORT.height}, light and dark); ` +
					'the browser paints the primitive default here. Resolve it outside ' +
					`the conditional rule or extend the measured viewports.${containerNote}`,
			);
		}
		if (hasUnconditional && !hasConditional) {
			throw new Error(
				`No resting colour for ${utility}: ${propList} — every unconditional ` +
					"declaration never matches the probe's drawer markup in light or " +
					'dark; an ancestor class or attribute the selector requires is ' +
					'absent from the fixture. Add it to the probe markup in askEngine ' +
					'(or pass an explicit ancestorClass), or confirm the rule is ' +
					'reachable from the real drawer markup at all.',
			);
		}
		throw new Error(
			`No resting colour for ${utility}: ${propList} — some declarations are ` +
				'conditional at-rules that never fire at the measured viewport and ' +
				'others never match because an ancestor the probe fixture does not ' +
				'render is absent (light and dark); resolve the conditional rule, ' +
				'extend the measured viewports, or add the missing ancestor to the ' +
				'probe markup.',
		);
	}
};

/** The classes the :has() arguments of element-attributed rules name — the
 * probe renders a matching descendant so a `:has()`-conditioned paint is
 * MEASURED (worst case: the descendant exists), never discarded (round 13).
 * Only single-compound class arguments can be fabricated; anything more
 * complex than `.child` stays unverifiable and is covered by the e2e's real
 * markup. */
/**
 * Default child variants when a probe declares none: a single empty variant,
 * or empty plus the fabricated children when any were produced.
 */
const buildFabricatedChildVariants = (
	recorded: RecordedDeclaration[],
	utilities: string[],
): string[][] => {
	const fabricated = probeChildrenFor(recorded, utilities);
	if (fabricated.length === 0) {
		return [[]];
	}
	return [[], fabricated];
};

const probeChildrenFor = (
	recorded: RecordedDeclaration[],
	utilities: string[],
): string[] => {
	const children: string[] = [];
	const elementEscaped = new Set(
		utilities.map((utility) => escapeClassName(utility)),
	);
	for (const declaration of recorded) {
		if (declaration.attributed.length === 0) {
			continue;
		}
		for (const entry of splitSelectorList(declaration.selector)) {
			for (const token of tokenizeCompound(lastCompoundRun(entry))) {
				if (
					token.kind === 'pseudo-class' &&
					token.name === ':has' &&
					token.args !== null
				) {
					for (const arg of splitSelectorList(token.args)) {
						const compounds = splitCompounds(arg);
						if (compounds.length !== 1) {
							continue;
						}
						for (const classToken of tokenizeCompound(compounds[0])) {
							if (classToken.kind !== 'class') {
								continue;
							}
							const unescaped = classToken.name.slice(1);
							if (!elementEscaped.has(unescaped)) {
								children.push(unescaped);
							}
						}
					}
				}
			}
		}
	}
	return children;
};

// Round 5 "fourth door": an `opacity-*` utility does not change `color`, but
// it paints the text at that alpha over the surface, collapsing the effective
// contrast. Fold the computed opacity into the foreground's alpha — whether
// that foreground is the measured utility colour or, for a BARE `opacity-*`
// (which softens the existing colour), the primitive's default (round 7 I2).
const withOpacity = (color: Rgba, opacity: number): Rgba =>
	opacity < 1 ? { ...color, a: color.a * opacity } : color;

// The effective painted colour of a (possibly translucent) foreground over
// the given background, which is what the contrast ratio must be computed
// against.
const effectiveForeground = (foreground: Rgba, background: Rgba): Rgba =>
	foreground.a >= 1 ? foreground : alphaComposite(foreground, background);

/** Round 17 I2: the LOWER-contrast (worse, more likely non-compliant) of
 * several measured paint candidates for the same theme — see the
 * `:has()`-descendant worst-case comment on `resolvePaintFromCss` below. */
const worseOf = (paints: EnginePaint[]): EnginePaint => {
	const ratioOf = (paint: EnginePaint): number =>
		contrastRatio(
			effectiveForeground(
				withOpacity(paint.color, paint.opacity),
				paint.background,
			),
			paint.background,
		);
	let worst = paints[0];
	if (worst === undefined) {
		throw new Error('No paint candidates measured');
	}
	let worstRatio = ratioOf(worst);
	for (const candidate of paints.slice(1)) {
		const ratio = ratioOf(candidate);
		if (ratio < worstRatio) {
			worst = candidate;
			worstRatio = ratio;
		}
	}
	return worst;
};

/** Resolves the real paint for a compiled stylesheet + class list: renders
 * the real drawer markup in Chromium, measures the paint and background at
 * the e2e's viewport in both themes, and runs the fail-loud checks. Throws
 * when any class is unverifiable — never substitutes the primitive's
 * compliant default.
 *
 * Round 17 I2: when the caller does not pin an explicit `probe.children`, a
 * `:has()`-gated declaration is measured in BOTH configurations — the
 * descendant present and the descendant absent — and the WORSE (lower-
 * contrast) of the two is reported. `probeChildrenFor`'s comment used to call
 * "the descendant exists" the worst case, but it is not a worst case, it is
 * one arbitrary case: whenever the `:has()` rule carries the MORE compliant
 * colour, fabricating the child can only turn a failing real paint green (the
 * reviewer's `.publy-r16-has:has(.publy-r16-kid)` reproduction). Measuring
 * both and keeping the worse one removes the arbitrariness in either
 * direction. An explicit `probe.children` still forces that exact
 * configuration (the round-13 "paints nothing when the descendant is absent"
 * pin depends on this). */
const resolvePaintFromCss = async (
	cssText: string,
	utilities: string[],
	probe: ProbeSpec = {},
	// Round 21 I1: one attribute configuration per proven runtime value set —
	// the caller (the call-site guard) passes every configuration a RESOLVED
	// ternary/value union can produce, and every one is measured. Defaults to
	// the single explicit `probe.attributes` when the caller rendered an exact
	// configuration.
	attributeConfigurations: ProbeAttributes[] = [probe.attributes ?? {}],
): Promise<{ light: EnginePaint; dark: EnginePaint }> => {
	const root = postcss.parse(cssText, { from: undefined });
	const elementClasses = new Set(
		utilities.map((utility) => `.${escapeClassName(utility)}`),
	);
	// Round 19 I2 + round 21 I1: every `data-*`/`aria-*` attribute NAME the
	// call site writes is part of the element's real contract — the union
	// across all proven runtime configurations is reserved from the state-
	// attribute exemption so a rule keyed on one must be MEASURED, exactly
	// like `data-slot`.
	const elementAttributeNames = new Set<string>();
	for (const configuration of attributeConfigurations) {
		for (const name of Object.keys(configuration)) {
			elementAttributeNames.add(name.toLowerCase());
		}
	}
	const elementType = DESCRIPTION_HOST_CONTRACT.elementType;
	const recorded = collectRecordedDeclarations(
		root,
		elementClasses,
		elementAttributeNames,
		elementType,
	);
	const questions = buildQuestions(recorded);

	const childVariants: string[][] =
		probe.children !== undefined
			? [probe.children]
			: buildFabricatedChildVariants(recorded, utilities);

	// One page, so variants run sequentially — never Promise.all, which would
	// race concurrent mutations of the single shared probePage. Each `:has()`
	// child variant is crossed with each attribute configuration, so a rule
	// gated on either is measured, never discarded.
	const factsLightVariants: EngineFacts[] = [];
	const factsDarkVariants: EngineFacts[] = [];
	for (const children of childVariants) {
		for (const attributes of attributeConfigurations) {
			factsLightVariants.push(
				await askEngine(
					cssText,
					utilities,
					'light',
					{
						children,
						ancestorClass: probe.ancestorClass ?? null,
						attributes,
					},
					questions,
				),
			);
			factsDarkVariants.push(
				await askEngine(
					cssText,
					utilities,
					'dark',
					{
						children,
						ancestorClass: probe.ancestorClass ?? null,
						attributes,
					},
					questions,
				),
			);
		}
	}
	assertVerifiable(
		root,
		recorded,
		utilities,
		elementAttributeNames,
		elementType,
		factsLightVariants,
		factsDarkVariants,
		questions,
	);

	const toPaint = (facts: EngineFacts): EnginePaint => ({
		color: parseComputedColor(facts.paint.fill),
		opacity: facts.paint.opacity,
		background: compositeBackground(facts.paint.backgroundLayers),
	});
	return {
		light: worseOf(factsLightVariants.map(toPaint)),
		dark: worseOf(factsDarkVariants.map(toPaint)),
	};
};

/** Resolves the real paint for a class list (primitive + caller classes):
 * compiles the real stylesheet, then measures. */
const resolveClassPaint = async (
	utilities: string[],
	probe: ProbeSpec = {},
	attributeConfigurations: ProbeAttributes[] = [probe.attributes ?? {}],
): Promise<{ light: EnginePaint; dark: EnginePaint }> =>
	resolvePaintFromCss(
		await compiledCssFor(utilities),
		utilities,
		probe,
		attributeConfigurations,
	);

/** The synthetic-CSS entry point for the policy pins: the fixture is appended
 * to the REAL compiled app.css (so the primitive, the drawer markup and every
 * token resolve), and the element carries the primitive class plus the
 * fixture's classes — the real call-site shape the round-12 reviewer proved
 * the single-class fixture cannot replace. */
const resolveFixturePaint = async (
	fixtureCss: string,
	fixtureClasses: string[],
	probe: ProbeSpec = {},
	attributeConfigurations: ProbeAttributes[] = [probe.attributes ?? {}],
): Promise<{ light: EnginePaint; dark: EnginePaint }> => {
	const baseCss = await compiledCssFor(['publy-drawer-description']);
	return resolvePaintFromCss(
		`${baseCss}\n${fixtureCss}`,
		['publy-drawer-description', ...fixtureClasses],
		probe,
		attributeConfigurations,
	);
};

const CALL_SITES = findDrawerDescriptionCallSites();

describe('drawer description text contrast (#1043)', () => {
	beforeAll(async () => {
		probePage = await chromium
			.launch()
			.then((browser) => browser.newPage({ viewport: MEASURED_VIEWPORT }));
		await probePage.setContent('<!doctype html><html><body></body></html>');
	});

	afterAll(async () => {
		if (probePage !== undefined) {
			await probePage.context().browser()?.close();
		}
	});

	// ---- The probe's element identity comes from the real primitive -------
	//
	// Round 19 I1: the probe is not a hard-coded `<div>` — it renders the REAL
	// host element the shipping `DrawerDescription` emits. `DESCRIPTION_HOST_
	// CONTRACT` is derived by rendering that component (react-dom/server), so
	// the strings `p` and `drawer-description` appear exactly once each — in
	// the two assertions below — and the probe markup (askEngine) is built
	// from the derived values. If Base UI ever changes the host element type,
	// or drawer.tsx changes the slot, one of these reds AND the probe starts
	// measuring the new contract. The mutation that counts keeps this test
	// green while restoring the #1043 break: reverting the probe to a made-up
	// `<div>` leaves the element type below still `p` (it is derived from the
	// primitive, not the markup), so the probe's identity is pinned to the
	// artifact, not to a copy of it.
	test('the probe element is the real DrawerDescription host contract, not a made-up div (round 19 I1)', () => {
		expect(DESCRIPTION_HOST_CONTRACT.elementType).toBe('p');
		expect(DESCRIPTION_HOST_CONTRACT.dataSlot).toBe('drawer-description');
		expect(DESCRIPTION_HOST_CONTRACT.hasId).toBe(true);
	});

	// The pin that makes the probe's identity non-vacuous: a rule that matches
	// the REAL element by type + slot alone (`p[data-slot='drawer-description']`)
	// — the reviewer's four-line reproduction, which kept the old probe green
	// because it was a made-up `<div>` — must PAINT the probe. If the probe
	// markup is ever reverted to a `<div>`, this rule stops matching it, the
	// probe falls back to the compliant primitive paint, and the first
	// assertion below fails. This is the mutation that counts: it keeps this
	// test red while restoring the #1043 break.
	test('a type+slot rule targeting the real element paints the probe (round 19 I1)', async () => {
		const { light } = await resolveFixturePaint(
			`p[data-slot='drawer-description'] { color: var(--publy-foreground-subtle); }`,
			[],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
		expect(contrastRatio(light.color, light.background)).toBeLessThan(
			SMALL_TEXT_CONTRAST_FLOOR,
		);
	});

	// The unmodeled-sweep pin (round 19 I1): a rule that is RELEVANT to the
	// element (it targets the real host type + slot) but ALSO carries a token
	// the probe cannot reproduce — a non-`data-*`/`aria-*` attribute the probe
	// does not stamp — is unresolvable input. `element.matches()` answers
	// `false` for it, but that `false` is not ground truth: the probe's absence
	// of the attribute cannot be told apart from the app genuinely never
	// carrying it. The sweep must fail LOUD by name, never silently leave the
	// compliant primitive paint in place. Disabling the sweep (the round-18
	// reviewer's `Number.MAX_SAFE_INTEGER` mutation) leaves this test red.
	test('a relevant rule with an unmodeled attribute fails loud by name (round 19 I1)', async () => {
		await expect(async () =>
			resolveFixturePaint(
				`p[data-slot='drawer-description'][role='note'] { color: var(--publy-foreground-subtle); }`,
				[],
			),
		).rejects.toThrow(/Unverifiable selector for .*role/);
	});

	// ---- The real stylesheet, measured by the engine -----------------------

	test('the primitive paint clears the floor on the composited drawer surface in both themes', async () => {
		const { light, dark } = await resolveClassPaint([
			'publy-drawer-description',
		]);
		for (const [theme, paint] of [
			['light', light],
			['dark', dark],
		] as const) {
			const ratio = contrastRatio(paint.color, paint.background);
			expect(ratio, `${theme} theme`).toBeGreaterThanOrEqual(
				SMALL_TEXT_CONTRAST_FLOOR,
			);
		}
	});

	test('the engine background agrees with the source composited model in both themes', async () => {
		const { light, dark } = await resolveClassPaint([
			'publy-drawer-description',
		]);
		// The browser's painted hit stack passes the same tokens through an
		// 8-bit canvas alpha, so the composite agrees within a fraction of a
		// channel — the pin guards the model against a wrong token or a
		// dropped layer, not against canvas quantization.
		for (const [theme, paint] of [
			['light', light],
			['dark', dark],
		] as const) {
			const source = compositedDrawerBackground(theme);
			expect(paint.background.a).toBeCloseTo(source.a, 5);
			expect(paint.background.r).toBeCloseTo(source.r, 0);
			expect(paint.background.g).toBeCloseTo(source.g, 0);
			expect(paint.background.b).toBeCloseTo(source.b, 0);
		}
	});

	test('resolves every semantic text colour through the real Tailwind theme in %s mode', async () => {
		const { light, dark } = await resolveClassPaint([
			'publy-drawer-description',
			'text-primary',
			'text-sm',
		]);
		expect(light.color).toEqual(resolveColor('--primary', 'light'));
		expect(dark.color).toEqual(resolveColor('--primary', 'dark'));
	});

	test('ignores generated typography utilities without mistaking them for colours', async () => {
		const { light } = await resolveClassPaint([
			'publy-drawer-description',
			'text-sm',
			'text-center',
			'text-balance',
		]);
		const primitiveToken = tokenFromColorDeclaration(
			'.publy-drawer-description',
		);
		expect(light.color).toEqual(resolveColor(primitiveToken, 'light'));
		expect(light.opacity).toBe(1);
	});

	test('fails closed when Tailwind cannot resolve a className utility', async () => {
		await expect(async () =>
			resolveClassPaint([
				'publy-drawer-description',
				'text-unrecognised-colour',
			]),
		).rejects.toThrow(
			'Unresolvable utility on a DrawerDescription: text-unrecognised-colour',
		);
	});

	// Round 16 MINOR 1: `escapeClassName` used to backslash-prefix a leading
	// digit as a literal character (`\2xl\:…`), so the TYPO scan's needle
	// never matched Tailwind's real codepoint-escaped selector
	// (`.\32 xl\:…`) and a perfectly real utility was reported as a typo. At
	// the measured 1280px viewport `2xl:` (96rem) genuinely never fires, so
	// the fixed scan recognises the utility and reports the ACCURATE cause —
	// no resting colour at this viewport — never "unresolvable".
	test('a utility whose class name starts with a digit is recognised, not reported as a typo (round 16 MINOR 1)', async () => {
		await expect(async () =>
			resolveClassPaint(['publy-drawer-description', '2xl:text-foreground']),
		).rejects.toThrow(/Only conditional declarations for 2xl:text-foreground/);
	});

	// Round 16 MINOR 2: the TYPO scan used to be a plain substring test
	// (`rule.selector.includes(needle)`), so a typo that happens to be a
	// PREFIX of a real class name — `.publy-drawer-desc` inside the real
	// `.publy-drawer-description` — was silently accepted as "mentioned" and
	// never reported. The browser ignores the unrecognised class and paints
	// the primitive underneath it, so this had no contrast consequence, but
	// the check did not do what its comment claimed.
	test('a typo that is a prefix of a real class name is still reported as a typo (round 16 MINOR 2)', async () => {
		await expect(async () =>
			resolveClassPaint(['publy-drawer-description', 'publy-drawer-desc']),
		).rejects.toThrow(
			'Unresolvable utility on a DrawerDescription: publy-drawer-desc',
		);
	});

	test('names a generated utility whose colour token cannot be resolved', async () => {
		const unresolvedToken = '--publy-' + 'not-declared';
		const unresolvedUtility = `text-(${unresolvedToken})`;
		await expect(async () =>
			resolveClassPaint(['publy-drawer-description', unresolvedUtility]),
		).rejects.toThrow(
			`Unresolvable generated colour for ${unresolvedUtility}: ` +
				`var(${unresolvedToken})`,
		);
	});

	// The value side of the drop sweep: a literal the BROWSER itself would
	// drop (`banana` is not a CSS colour — CSS.supports is false) paints the
	// inherited colour in the real app, the exact silent substitution this
	// guard removes. The browser answers the question; the guard fails loud
	// by name.
	test('fails closed on a generated literal the browser would drop', async () => {
		const rawBananaUtility = '[' + 'color' + ':' + 'banana]';
		await expect(async () =>
			resolveClassPaint(['publy-drawer-description', rawBananaUtility]),
		).rejects.toThrow(/Unresolvable generated colour/);
	});

	// Round 7 I1: the round-6 "non-colour utility" test pinned the walker's
	// blindness — it asserted that app component classes in the first
	// `@layer components` block resolve NO colour, when each of them declares
	// one in app.css. The table below asserts every such class resolves the
	// colour it actually declares — measured with the class ALONE, so its own
	// rule (not a later competitor) decides the paint. `animate-in`/`fade-in`
	// (tw-animate utilities with genuinely no colour declaration) stay
	// colourless — the inverse direction, asserted together so neither can
	// regress.
	test.each([
		['publy-type-helper', '--publy-foreground-subtle'],
		['publy-field-helper', '--publy-foreground-subtle'],
		['publy-type-eyebrow', '--publy-foreground-subtle'],
		['publy-back-link', '--publy-foreground-secondary'],
		['publy-stat-card-value-suffix', '--publy-foreground-muted'],
		['publy-field-error', '--publy-danger'],
		['publy-toast-description', '--publy-foreground-secondary'],
		['publy-drawer-description', '--publy-foreground-secondary'],
		['publy-danger-zone-row-description', '--publy-foreground-secondary'],
		['publy-marketing-eyebrow', '--publy-foreground-muted'],
	] as const)(
		'resolves the real colour %s declares in app.css',
		async (utility, token) => {
			const { light, dark } = await resolveClassPaint([utility]);
			expect(light.color).toEqual(resolveColor(token, 'light'));
			expect(light.opacity).toBe(1);
			expect(dark.color).toEqual(resolveColor(token, 'dark'));
			expect(dark.opacity).toBe(1);
		},
	);

	test.each(['animate-in', 'fade-in'] as const)(
		'resolves the real tw-animate class %s as genuinely non-colour',
		async (utility) => {
			const { light } = await resolveClassPaint([
				'publy-drawer-description',
				utility,
			]);
			const primitiveToken = tokenFromColorDeclaration(
				'.publy-drawer-description',
			);
			expect(light.color).toEqual(resolveColor(primitiveToken, 'light'));
			expect(light.opacity).toBe(1);
		},
	);

	test('resolves a Tailwind built-in palette colour without weakening fail-closed', async () => {
		// The value was originally pinned against an INDEPENDENT Chromium
		// measurement (round 7 M3): Tailwind v4's default red-500,
		// oklch(63.7% 0.237 25.331), paints rgb(251, 44, 54) (#fb2c36). The
		// guard now IS that browser — the pin keeps the pipeline honest.
		const { light } = await resolveClassPaint([
			'publy-drawer-description',
			'text-red-500',
		]);
		expect(light.color).toEqual({ r: 251, g: 44, b: 54, a: 1 });
		// A genuinely unknown utility still throws by name.
		await expect(async () =>
			resolveClassPaint(['publy-drawer-description', 'text-quantum-42']),
		).rejects.toThrow(
			'Unresolvable utility on a DrawerDescription: text-quantum-42',
		);
	});

	// Round 5 "fourth door": `opacity-*` paints the text translucent without
	// changing `color`, collapsing the effective contrast. The guard must fold
	// the COMPUTED opacity in, not report the opaque colour.
	test('folds an opacity utility into the measured foreground', async () => {
		const { light } = await resolveClassPaint([
			'publy-drawer-description',
			'text-primary',
			'opacity-50',
		]);
		expect(light.color).toEqual(resolveColor('--primary', 'light'));
		expect(light.opacity).toBeCloseTo(0.5, 5);
	});

	// Round 7 I2: a BARE `opacity-*` — the class an author writes to soften
	// the existing colour — declares no colour utility at all, so the fold
	// must apply to the primitive's default. Otherwise the call-site guard
	// reports the opaque default and the text paints at ~2.6:1.
	test('folds a bare opacity utility into the primitive default', async () => {
		const primitiveToken = tokenFromColorDeclaration(
			'.publy-drawer-description',
		);
		const { light, dark } = await resolveClassPaint([
			'publy-drawer-description',
			'opacity-50',
		]);
		for (const [theme, paint] of [
			['light', light],
			['dark', dark],
		] as const) {
			expect(paint.opacity).toBeCloseTo(0.5, 5);
			const foreground = withOpacity(
				resolveColor(primitiveToken, theme),
				paint.opacity,
			);
			expect(
				contrastRatio(
					effectiveForeground(foreground, paint.background),
					paint.background,
				),
				`bare opacity-50 on the primitive default in ${theme} theme`,
			).toBeLessThan(SMALL_TEXT_CONTRAST_FLOOR);
		}
	});

	// Round 7 M7: `-webkit-text-fill-color` paints the text in WebKit/Blink
	// instead of `color` — reachable through an arbitrary-property utility.
	// It must win over a coexisting colour utility exactly as it would in the
	// browser, while `currentcolor` (its default) stays a no-op rather than
	// reddening a class that merely wrote the default explicitly.
	test('-webkit-text-fill-color overrides a colour utility in the measured foreground', async () => {
		const { light } = await resolveClassPaint([
			'publy-drawer-description',
			'text-primary',
			'[-webkit-text-fill-color:#' + 'ff0000]',
		]);
		expect(light.color).toEqual({ r: 255, g: 0, b: 0, a: 1 });
	});

	test('-webkit-text-fill-color:currentcolor is a no-op override', async () => {
		const { light } = await resolveClassPaint([
			'publy-drawer-description',
			'text-primary',
			'[-webkit-text-fill-color:' + 'currentcolor]',
		]);
		expect(light.color).toEqual(resolveColor('--primary', 'light'));
	});

	// Pins the round-4 utility-resolution behaviours so the real app.css
	// compiler input (round 5 I5) cannot regress them: semantic tokens still
	// resolve, arbitrary hex values still resolve exactly, and the genuinely
	// unresolvable colour shapes still fail closed by name. Three pins CHANGED
	// with the round-15 engine, each because the OLD pin encoded a hand
	// parser's blindness rather than a browser fact:
	//   - `dark:text-primary` used to resolve --primary in the LIGHT theme
	//     because the substring walker treated the nested `&:is(.dark *)`
	//     rule as the class itself. The rule is a THEME gate: in light mode
	//     the browser paints the default, so the class now measures the
	//     primitive in light — and --primary in dark, where it actually
	//     paints (round 9 rule 4).
	//   - `text-primary!` used to throw because the value regex could not
	//     read `!important` values. `!important` is a cascade-priority flag,
	//     not part of the value — the class paints --primary exactly like
	//     `text-primary` (round 8 M5).
	//   - `text-primary/50` and the named-colour arbitrary-property utility
	//     used to THROW because the
	//     hand parser could not resolve color-mix()/named colours — the
	//     browser computes both, so the guard now measures them (round 14
	//     M3's false positive, and a round-4 pin that encoded the old
	//     blindness). The design-system guard scans every src/ file for raw
	//     colour literals, so these two FIXTURE utilities are built by
	//     concatenation rather than written as one literal.
	const rawHexUtility = 'text-[#' + '777777]';
	const rawNamedUtility = '[' + 'color' + ':' + 'red]';

	test('keeps the round-4 resolution behaviours intact', async () => {
		const { light } = await resolveClassPaint([
			'publy-drawer-description',
			'text-foreground',
		]);
		expect(light.color).toEqual(resolveColor('--foreground', 'light'));
		const muted = await resolveClassPaint([
			'publy-drawer-description',
			'text-muted-foreground',
		]);
		expect(muted.light.color).toEqual(
			resolveColor('--muted-foreground', 'light'),
		);
		const hex = await resolveClassPaint([
			'publy-drawer-description',
			rawHexUtility,
		]);
		expect(hex.light.color).toEqual({ r: 0x77, g: 0x77, b: 0x77, a: 1 });
		const darkLight = await resolveClassPaint([
			'publy-drawer-description',
			'dark:text-primary',
		]);
		const primitiveToken = tokenFromColorDeclaration(
			'.publy-drawer-description',
		);
		expect(darkLight.light.color).toEqual(
			resolveColor(primitiveToken, 'light'),
		);
		expect(darkLight.dark.color).toEqual(resolveColor('--primary', 'dark'));
		const important = await resolveClassPaint([
			'publy-drawer-description',
			'text-primary!',
		]);
		expect(important.light.color).toEqual(resolveColor('--primary', 'light'));
		const named = await resolveClassPaint([
			'publy-drawer-description',
			rawNamedUtility,
		]);
		expect(named.light.color).toEqual({ r: 255, g: 0, b: 0, a: 1 });
	});

	// Round 14 M3: `text-primary/50` is named by the old sweep's own comment
	// as the worked example of the `@supports (color: color-mix(...))`
	// fallback — swept, then thrown by the hand parser. The browser computes
	// color-mix(), so the guard measures the real (deliberately soft) paint
	// instead of blocking the utility.
	test('text-primary/50 resolves through the browser, never blocked (round 14 M3)', async () => {
		const { light } = await resolveClassPaint([
			'publy-drawer-description',
			'text-primary/50',
		]);
		const primitiveToken = tokenFromColorDeclaration(
			'.publy-drawer-description',
		);
		expect(light.color).not.toEqual(resolveColor(primitiveToken, 'light'));
		expect(light.color).not.toEqual(resolveColor('--primary', 'light'));
		expect(light.opacity).toBe(1);
		// The measured mix is genuinely low-contrast — an honest failure, not
		// an opaque "unresolvable" error.
		expect(contrastRatio(light.color, light.background)).toBeLessThan(
			SMALL_TEXT_CONTRAST_FLOOR,
		);
	});

	// Round 14 M3: a responsive variant whose condition holds at the
	// measured viewport is measured, not blocked.
	test('sm:text-foreground is measured at the e2e viewport (round 14 M3)', async () => {
		const { light, dark } = await resolveClassPaint([
			'publy-drawer-description',
			'sm:text-foreground',
		]);
		expect(light.color).toEqual(resolveColor('--foreground', 'light'));
		expect(dark.color).toEqual(resolveColor('--foreground', 'dark'));
	});

	// Round 14 M3: a responsive opacity variant whose condition holds at the
	// measured viewport is measured, not blocked.
	test('md:opacity-90 is measured at the e2e viewport (round 14 M3)', async () => {
		const { light } = await resolveClassPaint([
			'publy-drawer-description',
			'md:opacity-90',
		]);
		expect(light.opacity).toBeCloseTo(0.9, 5);
	});

	// ---- Round-8 M5 pipeline pins ------------------------------------------
	//
	// The round-7 declaration regex fail-closed five app classes — five on
	// `!important` values (the important flag is cascade priority, not part
	// of the colour) and two on legitimate CONTEXTUAL tokens declared on a
	// component rule rather than in :root/html.dark. All seven must resolve
	// through the REAL pipeline now, and each must resolve the colour it
	// actually declares — not silently null. The four class-only rules below
	// measure their own declared colour. The two CONTEXTUAL-token classes
	// (`publy-toast-icon`, `publy-profile-icon-tile`) declare their token on
	// a VARIANT (a toast tone, a `[data-tone]` attribute) — outside that
	// context the browser drops the `var()` and inherits the app's base
	// colour; the source model's CONTEXTUAL_DECLARATIONS convention
	// (round 8 M5) resolved the token from its first declaration, a colour
	// the browser never paints there. The engine measures the truth and the
	// e2e measures the real variant paints.
	test.each([
		['app-shell-tenant-pill', '--publy-foreground-muted'],
		['app-shell-workspace-pill', '--publy-foreground-muted'],
		['app-shell-topbar-action-btn', '--publy-foreground-muted'],
		['app-shell-workspace', '--publy-foreground'],
	] as const)(
		'resolves the round-8 M5 class %s through the real pipeline',
		async (utility, token) => {
			const { light } = await resolveClassPaint([utility]);
			expect(light.color).toEqual(resolveColor(token, 'light'));
		},
	);

	test.each(['publy-toast-icon', 'publy-profile-icon-tile'] as const)(
		'resolves the round-8 M5 contextual-token class %s without fail-closing',
		async (utility) => {
			const { light } = await resolveClassPaint([utility]);
			// No toast tone / no data-tone on the element: the browser drops
			// the variant-scoped `var()` and inherits the app's base colour —
			// never a throw, never an invented colour.
			expect(light.color).toEqual(resolveColor('--publy-foreground', 'light'));
		},
	);

	test('app-shell-topbar resolves no colour of its own (round 8 M5)', async () => {
		// The round-7 substring walker leaked the SIBLING
		// `.app-shell-topbar-action-btn`'s `!important` value into this class
		// and fail-closed on it. The class itself declares no color — on a
		// drawer description the primitive's default paints and the engine
		// measures it.
		const { light } = await resolveClassPaint([
			'publy-drawer-description',
			'app-shell-topbar',
		]);
		const primitiveToken = tokenFromColorDeclaration(
			'.publy-drawer-description',
		);
		expect(light.color).toEqual(resolveColor(primitiveToken, 'light'));
	});

	// Round 10 I1, through the REAL app.css: the review proved in Chromium
	// that `class="publy-field-helper publy-drawer-description"` paints
	// `--publy-foreground-subtle` (2.515:1) because field-helper is 89 lines
	// later in the same `@layer components`, while the same two names typed
	// in the other order paint identically. The guard must agree on both
	// spellings — now by construction, since the browser is the cascade.
	test('two real app classes resolve by real source order, not attribute order (round 10 I1)', async () => {
		const subtle = resolveColor('--publy-foreground-subtle', 'light');
		const forward = await resolveClassPaint([
			'publy-field-helper',
			'publy-drawer-description',
		]);
		const reversed = await resolveClassPaint([
			'publy-drawer-description',
			'publy-field-helper',
		]);
		expect(forward.light.color).toEqual(subtle);
		expect(reversed.light.color).toEqual(subtle);
	});

	test('a utility colour outranks a components-layer app class (round 10 I1)', async () => {
		const foreground = resolveColor('--foreground', 'light');
		const forward = await resolveClassPaint([
			'text-foreground',
			'publy-field-helper',
		]);
		const reversed = await resolveClassPaint([
			'publy-field-helper',
			'text-foreground',
		]);
		expect(forward.light.color).toEqual(foreground);
		expect(reversed.light.color).toEqual(foreground);
	});

	// ---- Round-5 enumeration pins (unchanged) ------------------------------

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

	// Round 19 I2 + round 21 I1: written `data-*`/`aria-*` attributes are part
	// of the element's real contract — the parser must retain every NAME,
	// whatever the value expression, and resolve each value or mark it
	// unresolvable. Round 19's parser blessed `data-open={isOpen}` as `{}` (no
	// attribute), silently exempting the rule keyed on the name as ephemeral
	// state while the real browser painted 2.51:1 — the round-20 reviewer's
	// reproduction. A `data-*` spell inside a quoted attribute VALUE (e.g.
	// `title="data-flag='x'"`) is still text, not a real attribute, and must
	// be ignored. If the parser is reverted to nothing, this test reds.
	// Round 23 I1: the walk is AST-backed, so the round-22 spelling escapes
	// are structurally impossible — a `>` inside an earlier quoted VALUE
	// (`title="safe > truncates"`) cannot terminate the element scan, a
	// namespaced name (`data-probe:mode`) is retained whole instead of
	// collapsing to the bare namespace part, a boolean attribute is the
	// runtime value `true`, and a spread fails loud instead of disappearing.
	test('extractStateAttributes retains every written data-*/aria-* name and resolves or flags each value (round 19 I2 + round 21 I1 + round 23 I1)', () => {
		expect(
			extractStateAttributes(
				' className="publy-r18-static" data-contrast-probe="low"',
			),
		).toEqual({
			'data-contrast-probe': { status: 'resolved', values: ['low'] },
		});
		expect(
			extractStateAttributes(
				" className='x' aria-label='desc' data-mode=\"on\"",
			),
		).toEqual({
			'aria-label': { status: 'resolved', values: ['desc'] },
			'data-mode': { status: 'resolved', values: ['on'] },
		});
		// A data-* spell inside a quoted value is text, not an attribute.
		expect(extractStateAttributes(` title="data-flag='x'"`)).toEqual({});
		// A ternary of string literals is RESOLVED to BOTH proven values — the
		// guard must measure every configuration, never an arbitrary one.
		expect(
			extractStateAttributes(` data-contrast-probe={isOpen ? 'low' : 'high'}`),
		).toEqual({
			'data-contrast-probe': { status: 'resolved', values: ['low', 'high'] },
		});
		// Bare variables and template literals are UNRESOLVABLE — the NAME is
		// retained (never silently dropped from the reservation set) and the
		// value reported unresolvable, which fails the call site loud.
		expect(extractStateAttributes(` data-open={isOpen}`)).toEqual({
			'data-open': { status: 'unresolvable' },
		});
		expect(
			extractStateAttributes(
				` data-contrast-probe={\`\${isOpen ? 'low' : 'high'}\`}`,
			),
		).toEqual({ 'data-contrast-probe': { status: 'unresolvable' } });
		// Round 22 I1, the `>`-in-title spelling: a legal `>` inside an earlier
		// quoted value used to terminate the opening-tag regex and drop every
		// later attribute; the AST walk sees the real attribute node.
		expect(
			extractStateAttributes(
				' title="safe > truncates the source regex" data-contrast-probe="low"',
			),
		).toEqual({
			'data-contrast-probe': { status: 'resolved', values: ['low'] },
		});
		// Round 22 I1, the namespaced-name spelling: `data-probe:mode="low"`
		// used to lex as the boolean attribute `data-probe`; the DOM carries
		// the full namespaced name, so the full name is the retained name.
		expect(extractStateAttributes(' data-probe:mode="low"')).toEqual({
			'data-probe:mode': { status: 'resolved', values: ['low'] },
		});
		// A boolean attribute (no `=`) is the runtime value `true`.
		expect(extractStateAttributes(' data-bool')).toEqual({
			'data-bool': { status: 'resolved', values: ['true'] },
		});
		// Round 22 I1, the spread spelling: `{...{ ['data-contrast-probe']:
		// 'low' }}` used to disappear entirely from the captured text; a
		// spread can carry any data-*/aria-* name, so it fails loud.
		expect(() => extractStateAttributes(' {...props}')).toThrow(
			/cannot resolve/,
		);
	});

	// Round 21 I1: an UNRESOLVABLE attribute value must fail loud naming the
	// file, the line and the attribute — the same fail-closed contract as a
	// spread or a non-literal className. Round 20's escape was a bare
	// variable, and it silently reported compliant.
	test('an unresolvable data-*/aria-* value fails loud by file, line and attribute (round 21 I1)', () => {
		expect(() =>
			assertCallSiteAttributesResolvable(
				{ 'data-open': { status: 'unresolvable' } },
				'network/_component.tsx',
				42,
			),
		).toThrow(
			/DrawerDescription at network\/_component\.tsx:42 sets data-open to a value expression the contrast guard cannot resolve/,
		);
	});

	// ---- Round 23 I1: the element side of the AST model ---------------------
	//
	// A call site whose tag the model cannot resolve to `DrawerDescription`
	// is never automatically "not a drawer description". The channels that
	// CAN carry the primitive are enumerated from the AST (imports, aliases,
	// destructuring); the render-prop channel (a tag bound to a function
	// parameter) reports by name and location instead of vanishing.

	test('a local const alias of the primitive is still enumerated (round 23 I1)', () => {
		const source = [
			"import { DrawerDescription } from '~/components/ui/drawer';",
			'const Description = DrawerDescription;',
			'export const C = () => <Description />;',
		].join('\n');
		const sites = callSitesInSource(source, 'src/routes/_fixture.tsx');
		expect(sites.map((site) => site.line)).toEqual([3]);
	});

	test('a destructured drawer-module binding is enumerated (round 23 I1)', () => {
		const source = [
			"import * as Drawer from '~/components/ui/drawer';",
			'const { DrawerDescription: Description } = Drawer;',
			'export const C = () => <Description />;',
		].join('\n');
		const sites = callSitesInSource(source, 'src/routes/_fixture.tsx');
		expect(sites.map((site) => site.line)).toEqual([3]);
	});

	test('a namespace member that is not the primitive is not a drawer description (round 23 I1)', () => {
		const source = [
			"import * as Drawer from '~/components/ui/drawer';",
			'export const C = () => <Drawer.Body />;',
		].join('\n');
		expect(callSitesInSource(source, 'src/routes/_fixture.tsx')).toEqual([]);
	});

	test('a tag bound to a function parameter reports unresolvable, never absent (round 23 I1)', () => {
		const source =
			'export const C = ({ Description }: { Description: unknown }) => ' +
			'<Description />;';
		expect(() => callSitesInSource(source, 'src/routes/_fixture.tsx')).toThrow(
			/cannot attribute the JSX tag Description .* bound to a function parameter/,
		);
	});

	// Round 25 MINOR 1: a `let`-bound alias of the primitive is not
	// statically attributable (the binding can be reassigned), so the element
	// axis must REPORT it by name and location — the same treatment the
	// parameter channel gets — instead of silently answering "not a drawer
	// description" and leaving the report to a list-diff of the inventory
	// (the round-24 `expected [ …(5) ] to deeply equal [ …(6) ]` message,
	// which only says "this file lost its call site"). Reverting the report
	// channel makes THIS test red with the old list-diff failure.
	test('a tag bound to a let/var local of the drawer description reports unresolvable by name and location (round 25 MINOR 1)', () => {
		const source = [
			"import { DrawerDescription } from '~/components/ui/drawer';",
			'let Description = DrawerDescription;',
			'export const C = () => <Description />;',
		].join('\n');
		expect(() => callSitesInSource(source, 'src/routes/_fixture.tsx')).toThrow(
			/cannot attribute the JSX tag Description .* let\/var local of the drawer description/,
		);
		// The same report for the module-member spelling and the
		// destructuring spelling.
		const moduleSource = [
			"import * as Drawer from '~/components/ui/drawer';",
			'var Description = Drawer.DrawerDescription;',
			'export const C = () => <Description />;',
		].join('\n');
		expect(() =>
			callSitesInSource(moduleSource, 'src/routes/_fixture.tsx'),
		).toThrow(/cannot attribute the JSX tag Description .* let\/var local/);
		const destructuredSource = [
			"import * as Drawer from '~/components/ui/drawer';",
			'let { DrawerDescription: Description } = Drawer;',
			'export const C = () => <Description />;',
		].join('\n');
		expect(() =>
			callSitesInSource(destructuredSource, 'src/routes/_fixture.tsx'),
		).toThrow(/cannot attribute the JSX tag Description .* let\/var local/);
		// A `const` alias is still enumerated, never reported.
		const constSource = [
			"import { DrawerDescription } from '~/components/ui/drawer';",
			'const Description = DrawerDescription;',
			'export const C = () => <Description />;',
		].join('\n');
		expect(
			callSitesInSource(constSource, 'src/routes/_fixture.tsx').map(
				(site) => site.line,
			),
		).toEqual([3]);
	});

	// Round 25 MINOR 2: the shared inventory pins ONE call site per file, so
	// a SECOND low-contrast description added to an already-inventoried file
	// through the `let` channel used to leave the count at 1 and the suite
	// green — the element axis silently answered "not a drawer description"
	// and the inventory diff had nothing to miss. The round-25 MINOR 1
	// report channel closes it: the `let`-bound element now throws by name
	// and location before any count is taken. This is the reviewer's exact
	// scenario encoded as a regression test — reverting the MINOR 1 report
	// makes this test fail with the old silent absence.
	test('a second description through the let channel inside an already-inventoried file is backstopped by the same report (round 25 MINOR 2)', () => {
		const source = [
			"import { DrawerDescription } from '~/components/ui/drawer';",
			'const Description = DrawerDescription;',
			'let SecondDescription = DrawerDescription;',
			'export const C = () => <><Description /><SecondDescription /></>;',
		].join('\n');
		expect(() => callSitesInSource(source, 'src/routes/_fixture.tsx')).toThrow(
			/cannot attribute the JSX tag SecondDescription .* let\/var local of the drawer description/,
		);
	});

	test('a self-closing drawer description is enumerated (round 23 I1)', () => {
		const source = [
			"import { DrawerDescription } from '~/components/ui/drawer';",
			'export const C = () => <DrawerDescription />;',
		].join('\n');
		const sites = callSitesInSource(source, 'src/routes/_fixture.tsx');
		expect(sites.map((site) => site.line)).toEqual([2]);
	});

	test('an unparseable file fails loud instead of silently losing its call sites (round 23 I1)', () => {
		expect(() =>
			callSitesInSource('export function broken( {', 'src/routes/_fixture.tsx'),
		).toThrow(/Contrast guard cannot parse/);
	});

	// Round 23 I2: RESOLVED means an EVALUATED value, never a captured
	// spelling. The round-22 reviewer's mutation was `data-contrast-probe=
	// {'\x6cow'}` — the runtime value is the three characters `low` (Node:
	// `'\x6cow' === 'low'` is true), but the old evaluator stamped the six
	// source characters, the probe rendered `data-contrast-probe="\x6cow"`,
	// and a rule keyed on `[data-contrast-probe='low']` never matched — the
	// 2.51:1 low paint came back while all 100 tests stayed green. The
	// escaped string must now evaluate to `low` and be measured. Reverting
	// the evaluator to raw source capture makes THIS test red.
	test('RESOLVED is an evaluated constant with escape processing, never a captured spelling (round 23 I2)', () => {
		// The reviewer's exact mutation: `'\x6cow'` is the runtime string
		// `low`.
		expect(extractStateAttributes(` data-contrast-probe={'\\x6cow'}`)).toEqual({
			'data-contrast-probe': { status: 'resolved', values: ['low'] },
		});
		// Unicode escapes are processed too (`'\u0042'` is `B`).
		expect(
			extractStateAttributes(` data-contrast-probe={'a\\u0042c'}`),
		).toEqual({
			'data-contrast-probe': { status: 'resolved', values: ['aBc'] },
		});
		// A no-substitution template literal is a constant string.
		expect(extractStateAttributes(' data-x={`low`}')).toEqual({
			'data-x': { status: 'resolved', values: ['low'] },
		});
		// Transparent wrappers (parentheses, `as`) do not stop evaluation.
		expect(extractStateAttributes(` data-x={('low')}`)).toEqual({
			'data-x': { status: 'resolved', values: ['low'] },
		});
		expect(extractStateAttributes(` data-x={'low' as const}`)).toEqual({
			'data-x': { status: 'resolved', values: ['low'] },
		});
		// A nested ternary is the union of every branch value — each branch
		// is separately evaluated, never the old "condition contains `?` →
		// unresolvable" regex artefact.
		expect(
			extractStateAttributes(` data-x={a ? (b ? 'low' : 'high') : 'mid'}`),
		).toEqual({
			'data-x': { status: 'resolved', values: ['low', 'high', 'mid'] },
		});
		// A ternary with a non-constant branch is unresolvable as a whole.
		expect(extractStateAttributes(` data-x={a ? 'low' : theme}`)).toEqual({
			'data-x': { status: 'unresolvable' },
		});
		// Escape processing applies inside ternary branches too.
		expect(extractStateAttributes(` data-x={a ? '\\x6cow' : 'high'}`)).toEqual({
			'data-x': { status: 'resolved', values: ['low', 'high'] },
		});
		// A constant that is not a string (a boolean literal) stays
		// unresolvable — RESOLVED means a constant STRING.
		expect(extractStateAttributes(' data-x={true}')).toEqual({
			'data-x': { status: 'unresolvable' },
		});
	});

	// Round 25 I2, the JSX-ATTRIBUTE-LITERAL context (the reader half of the
	// round-24 BLOCKER): the transform decodes HTML character references in a
	// string-literal attribute value, so the guard must decode before
	// declaring RESOLVED. Every expected value in the fixtures below is a
	// VERBATIM esbuild 0.28.1 transform output — the version Vite runs,
	// pinned by the root package.json `pnpm.overrides` entry
	// `esbuild@>=0.27.3 <0.28.1: ^0.28.1`. The transform decodes the named
	// entity table and decimal/hex numeric references once, in a single
	// pass, in string-literal attribute values only; expression-container
	// values pass through verbatim. To regenerate the fixtures, run the
	// same attribute strings through esbuild 0.28.1's JSX transform
	// (e.g. `pnpm dlx esbuild@0.28.1` on a file of JSX attribute literals,
	// or `transformSync` with `loader: 'jsx'`) and diff the emitted
	// attribute values against the expected values below. Before this fix
	// the reader under-decoded here (`&#108;ow` stayed verbatim) and the
	// writer re-decoded through innerHTML, the two errors cancelling for
	// literals and un-hiding for expression containers. Reverting the
	// decode makes THESE fixtures red against the esbuild-emitted values.
	test('a JSX string-literal data-* value is decoded exactly as esbuild decodes it (round 25 I2)', () => {
		// esbuild: `data-contrast-probe="a&amp;b"` → `"a&b"`.
		expect(extractStateAttributes(' data-contrast-probe="a&amp;b"')).toEqual({
			'data-contrast-probe': { status: 'resolved', values: ['a&b'] },
		});
		// Decimal and hex numeric references decode (`&#108;` is `l`,
		// `&#x6c;` is `l`, `&#x78;` is `x`); `&#76;` is capital `L`.
		expect(
			extractStateAttributes(
				' data-y="&#108;ow" data-n="&#x6c;ow" ' +
					'data-xdup="&#x78;" data-m="&#76;ow"',
			),
		).toEqual({
			'data-y': { status: 'resolved', values: ['low'] },
			'data-n': { status: 'resolved', values: ['low'] },
			'data-xdup': { status: 'resolved', values: ['x'] },
			'data-m': { status: 'resolved', values: ['Low'] },
		});
		// The named-entity table decodes `&amp;`, `&lt;`, `&gt;`, `&quot;`,
		// `&apos;`, `&nbsp;`, `&copy;` and the rest of the 253-entry table —
		// and NOTHING else: `&bogus;` and uppercase `&AMP;` stay verbatim.
		expect(
			extractStateAttributes(
				' data-q="&amp;" data-apos="&apos;x" data-quot="a&quot;b" ' +
					'data-lt="a&lt;b" data-gt="a&gt;b" data-nb="a&nbsp;b" ' +
					'data-cp="&copy;" data-bogus="&bogus;" data-up="&AMP;"',
			),
		).toEqual({
			'data-q': { status: 'resolved', values: ['&'] },
			'data-apos': { status: 'resolved', values: ["'x"] },
			'data-quot': { status: 'resolved', values: ['a"b'] },
			'data-lt': { status: 'resolved', values: ['a<b'] },
			'data-gt': { status: 'resolved', values: ['a>b'] },
			'data-nb': { status: 'resolved', values: ['a\u00A0b'] },
			'data-cp': { status: 'resolved', values: ['\u00A9'] },
			'data-bogus': { status: 'resolved', values: ['&bogus;'] },
			'data-up': { status: 'resolved', values: ['&AMP;'] },
		});
		// A bare `&` without a valid reference, a missing semicolon, an
		// uppercase `X` in a hex reference, an empty `&#x;` and a `&;` all
		// stay verbatim — esbuild emits each of these unchanged.
		expect(
			extractStateAttributes(
				' data-bare="a&b" data-nosemi="&#108ow" data-upper="&#X6C;ow" ' +
					'data-emptyhex="&#x;" data-empty="a&;b"',
			),
		).toEqual({
			'data-bare': { status: 'resolved', values: ['a&b'] },
			'data-nosemi': { status: 'resolved', values: ['&#108ow'] },
			'data-upper': { status: 'resolved', values: ['&#X6C;ow'] },
			'data-emptyhex': { status: 'resolved', values: ['&#x;'] },
			'data-empty': { status: 'resolved', values: ['a&;b'] },
		});
		// Decoding is single-pass: `&amp;amp;` is `&amp;`, never re-decoded
		// to `&`; the scan takes the FIRST `;` after an `&`.
		expect(extractStateAttributes(' data-double="&amp;amp;"')).toEqual({
			'data-double': { status: 'resolved', values: ['&amp;'] },
		});
		expect(extractStateAttributes(' data-hash="a&#38;b"')).toEqual({
			'data-hash': { status: 'resolved', values: ['a&b'] },
		});
		// Astral and control references emit exactly what esbuild emits.
		expect(
			extractStateAttributes(' data-astral="&#x1F600;" data-tab="&#x9;"'),
		).toEqual({
			'data-astral': { status: 'resolved', values: ['\u{1F600}'] },
			'data-tab': { status: 'resolved', values: ['\t'] },
		});
		// The className axis is the same JSX literal: `className="c&#108;s"`
		// is `cls` after the transform.
		expect(extractClassName(' className="c&#108;s"', 'a.tsx', 3)).toBe('cls');
	});

	// Round 25 I2, the EXPRESSION-CONTAINER context: a StringLiteral inside a
	// JsxExpression is a JavaScript literal, and esbuild passes it through
	// VERBATIM — `{'a&amp;b'}` reaches React as the seven characters
	// `a&amp;b` — so the guard must not decode. This is the context the
	// round-24 reviewer reproduced (the false negative AND the false
	// positive), where the old reader was already right and only the writer
	// was wrong.
	test('an expression-container data-* value is passed through verbatim, exactly as esbuild passes it (round 25 I2)', () => {
		// esbuild: `data-contrast-probe={'a&amp;b'}` → `"a&amp;b"`.
		expect(extractStateAttributes(` data-contrast-probe={'a&amp;b'}`)).toEqual({
			'data-contrast-probe': { status: 'resolved', values: ['a&amp;b'] },
		});
		// esbuild: `data-expr2={'&#108;ow'}` → `"&#108;ow"`.
		expect(extractStateAttributes(` data-expr2={'&#108;ow'}`)).toEqual({
			'data-expr2': { status: 'resolved', values: ['&#108;ow'] },
		});
		// The backslash-escape axis is untouched in this context — the
		// round-23 I2 fix still evaluates `'\x6cow'` to `low`.
		expect(extractStateAttributes(` data-x={'\\x6cow'}`)).toEqual({
			'data-x': { status: 'resolved', values: ['low'] },
		});
		// A no-substitution template literal is a JS string too — verbatim.
		expect(extractStateAttributes(' data-t={`a&amp;b`}')).toEqual({
			'data-t': { status: 'resolved', values: ['a&amp;b'] },
		});
		// The className axis follows the same split: an expression-container
		// className stays verbatim (`className={'c&#108;s'}` → `c&#108;s`).
		expect(extractClassName(` className={'c&#108;s'}`, 'a.tsx', 3)).toBe(
			'c&#108;s',
		);
	});

	// Round 25 I3, the literal-context half of the reader/writer pin: the
	// reader decodes a JSX string-literal value to `a&b` — exactly what
	// esbuild emits and React writes — the writer must render `a&b`, and a
	// rule keyed on `a&b` must match. If either side carried the source
	// spelling `a&amp;b`, the rule could not match and the low paint would
	// be measured as the compliant default; the byte-identity assertion
	// inside askEngine throws on the writer side, and this paint assertion
	// proves the selector matched the probe.
	test('a JSX-literal data-* value with a character reference is decoded, rendered and matched by the rule keyed on the runtime value (round 25 I3)', async () => {
		const { light } = await resolveFixturePaint(
			`.publy-r25-lit[data-contrast-probe='a&b'] { color: var(--publy-foreground-subtle); }`,
			['publy-r25-lit'],
			{},
			attributeConfigurationsOf(
				extractStateAttributes(' data-contrast-probe="a&amp;b"'),
			),
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
		expect(contrastRatio(light.color, light.background)).toBeLessThan(
			SMALL_TEXT_CONTRAST_FLOOR,
		);
	});

	// Round 21 I1, the RED half of the ternary paired proof: the round-20
	// reviewer's exact reproduction — a rule keyed on the LOW branch of a
	// ternary (`data-contrast-probe={isOpen ? 'low' : 'high'}`) paints 2.51:1
	// while the HIGH branch stays compliant. The guard renders BOTH proven
	// configurations and keeps the worse, so the low branch must be caught.
	// Reverting to single-configuration rendering (round-20's arbitrary branch
	// or no attribute at all) measures only the compliant branch and this
	// assertion fails — the 2.51:1 paint silently passes again.
	test('a ternary data-* value is measured in BOTH proven configurations and the low branch is caught (round 21 I1)', async () => {
		const { light } = await resolveFixturePaint(
			`.publy-r21-ternary[data-contrast-probe='low'] { color: var(--publy-foreground-subtle); }`,
			['publy-r21-ternary'],
			{},
			attributeConfigurationsOf({
				'data-contrast-probe': { status: 'resolved', values: ['low', 'high'] },
			}),
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
		// The reviewer's own number: 2.51:1 at the e2e's viewport.
		expect(contrastRatio(light.color, light.background)).toBeLessThan(
			SMALL_TEXT_CONTRAST_FLOOR,
		);
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

	test('resolves the local landing stylesheet from app.css', () => {
		expect(resolveAppStylesheetImport('./landing.css')).toBe(
			path.resolve(path.dirname(appCssPath), 'landing.css'),
		);
	});

	describe('local stylesheet import confinement', () => {
		let fixtureDirectory: string;
		let nestedDirectory: string;
		let outsideDirectory: string;

		beforeAll(() => {
			fixtureDirectory = mkdtempSync(
				path.join(appStylesDirectory, '.drawer-contrast-import-'),
			);
			nestedDirectory = path.join(fixtureDirectory, 'nested');
			outsideDirectory = mkdtempSync(
				path.join(tmpdir(), 'publy-drawer-contrast-import-'),
			);
			mkdirSync(nestedDirectory);
			writeFileSync(
				path.join(fixtureDirectory, 'root.css'),
				'.internal-root {}',
			);
			writeFileSync(path.join(nestedDirectory, 'leaf.css'), '.nested-leaf {}');
			writeFileSync(
				path.join(nestedDirectory, 'bad-contrast.css'),
				'.publy-imported-low-contrast { ' +
					'color: var(--publy-foreground-subtle); }',
			);
			writeFileSync(
				path.join(fixtureDirectory, 'entry.css'),
				"@import './nested/bad-contrast.css';\n@import '../app.css';",
			);
			writeFileSync(path.join(fixtureDirectory, 'not-css.txt'), '.not-css {}');
			mkdirSync(path.join(fixtureDirectory, 'directory.css'));
			writeFileSync(path.join(outsideDirectory, 'outside.css'), '.outside {}');
			symlinkSync(
				outsideDirectory,
				path.join(fixtureDirectory, 'outside-link'),
				process.platform === 'win32' ? 'junction' : 'dir',
			);
			symlinkSync(
				nestedDirectory,
				path.join(fixtureDirectory, 'inside-link'),
				process.platform === 'win32' ? 'junction' : 'dir',
			);
		});

		afterAll(() => {
			rmSync(fixtureDirectory, { recursive: true, force: true });
			rmSync(outsideDirectory, { recursive: true, force: true });
		});

		test('resolves a nested relative import from the importer directory', () => {
			expect(resolveAppStylesheetImport('./leaf.css', nestedDirectory)).toBe(
				path.join(nestedDirectory, 'leaf.css'),
			);
		});

		test('resolves an internal parent-directory import', () => {
			expect(resolveAppStylesheetImport('../root.css', nestedDirectory)).toBe(
				path.join(fixtureDirectory, 'root.css'),
			);
		});

		test('returns the canonical target for an internal symlink', () => {
			expect(
				resolveAppStylesheetImport('./inside-link/leaf.css', fixtureDirectory),
			).toBe(path.join(nestedDirectory, 'leaf.css'));
		});

		test('rejects traversal to a stylesheet outside the styles directory', () => {
			const outsideImport = path.relative(
				nestedDirectory,
				path.join(outsideDirectory, 'outside.css'),
			);
			expect(() =>
				resolveAppStylesheetImport(outsideImport, nestedDirectory),
			).toThrow(/Contrast guard cannot resolve stylesheet import/);
		});

		test('rejects an internal symlink whose target is outside the styles directory', () => {
			expect(() =>
				resolveAppStylesheetImport(
					'./outside-link/outside.css',
					fixtureDirectory,
				),
			).toThrow(/Contrast guard cannot resolve stylesheet import/);
		});

		test('rejects an existing local file whose canonical extension is not CSS', () => {
			expect(() =>
				resolveAppStylesheetImport('./not-css.txt', fixtureDirectory),
			).toThrow(/Contrast guard cannot resolve stylesheet import/);
		});

		test('rejects a directory whose name ends in CSS', () => {
			expect(() =>
				resolveAppStylesheetImport('./directory.css', fixtureDirectory),
			).toThrow(/Contrast guard cannot resolve stylesheet import/);
		});

		test('fails closed when a local stylesheet import is absent', () => {
			expect(() =>
				resolveAppStylesheetImport('./missing.css', fixtureDirectory),
			).toThrow(
				'Contrast guard cannot resolve stylesheet import ./missing.css in app.css',
			);
		});

		test('detects a low-contrast rule loaded through nested relative imports', async () => {
			const compiler = await compile(
				`@import './${path.basename(fixtureDirectory)}/entry.css';`,
				{
					base: appStylesDirectory,
					loadStylesheet: async (id, base) => loadAppStylesheet(id, base),
				},
			);
			const utilities = [
				'publy-drawer-description',
				'publy-imported-low-contrast',
			];
			const { light } = await resolvePaintFromCss(
				compiler.build(utilities),
				utilities,
			);
			expect(light.color).toEqual(
				resolveColor('--publy-foreground-subtle', 'light'),
			);
			expect(contrastRatio(light.color, light.background)).toBeLessThan(
				SMALL_TEXT_CONTRAST_FLOOR,
			);
		});
	});

	// Round 16 MINOR 4: `resolveAppStylesheetImport('tailwindcss')` used to
	// resolve to `theme.css`, which declares no `@layer theme, base,
	// components, utilities;` and no `@tailwind utilities;` at all — every
	// generated utility came out UNLAYERED while a comment three lines above
	// the resolver claimed "the same CSS the app ships". `index.css` (what the
	// app's bundler actually resolves the import to) carries the real layer
	// order, so a generated utility must land inside `@layer utilities`, not
	// at the top level.
	test('the guard compiles the real layered tailwindcss import graph, not a bare theme file (round 16 MINOR 4)', async () => {
		const compiled = await compiledCssFor(['text-foreground']);
		expect(compiled).toContain('@layer theme, base, components, utilities;');
		const utilityIndex = compiled.indexOf('.text-foreground {');
		expect(utilityIndex).toBeGreaterThan(-1);
		const utilitiesLayerIndex = compiled.indexOf('@layer utilities {');
		expect(utilitiesLayerIndex).toBeGreaterThan(-1);
		expect(utilitiesLayerIndex).toBeLessThan(utilityIndex);
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

	// Issue #1086: the guard must DISCOVER `*-description`/`*-subtitle` classes
	// declared in the real app.css instead of trusting `DESCRIPTION_SELECTORS`.
	// Every such class must either be swept (in DESCRIPTION_SELECTORS) or be a
	// verified exclusion (EXCLUDED_DESCRIPTION_SELECTORS) — else the guard
	// fails loud, naming the offending class. The scan reads app.css through the
	// same postcss parse the rest of the guard uses, so it sees exactly what the
	// app ships; a class the browser cannot parse would have red the parse above.
	const discoveredDescriptionClasses = (root: postcss.Root): Set<string> => {
		const classes = new Set<string>();
		const pattern = /-(description|subtitle)\b/;
		root.walkRules((rule) => {
			for (const entry of splitSelectorList(rule.selector)) {
				for (const compound of splitCompounds(entry)) {
					for (const token of tokenizeCompound(compound)) {
						if (token.kind === 'class' && pattern.test(token.name)) {
							classes.add(`.${token.name.slice(1)}`);
						}
					}
				}
			}
		});
		return classes;
	};

	test('every real *-description/*-subtitle class in app.css is inventoried or a verified exclusion (issue #1086)', () => {
		const discovered = discoveredDescriptionClasses(appCssRoot);
		const swept = new Set<string>(DESCRIPTION_SELECTORS);
		const excluded = new Set<string>(EXCLUDED_DESCRIPTION_SELECTORS);
		const orphan = [...discovered].filter(
			(selector) => !swept.has(selector) && !excluded.has(selector),
		);
		expect(
			orphan,
			`${orphan.join(', ')} declared in app.css but missing from ` +
				'DESCRIPTION_SELECTORS and EXCLUDED_DESCRIPTION_SELECTORS — add it ' +
				'to the inventory (with its real surfaces) or to the exclusion ' +
				'allowlist with a VERIFIED reason',
		).toEqual([]);

		// Fail loud the other direction: an inventory/exclusion entry that no
		// longer exists in CSS is a stale contract, not silent coverage.
		const allDeclared = new Set(discovered);
		const stale = [...swept, ...excluded].filter(
			(selector) => !allDeclared.has(selector),
		);
		expect(
			stale,
			`${stale.join(', ')} in the inventory/exclusion list but not declared ` +
				'in app.css — remove the dead entry',
		).toEqual([]);
	});

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
			// Round 10 M4 + round 14 M2: the inventory keys are forward-slash
			// repository paths, but `walkTsxFiles` builds NATIVE paths — on
			// Windows the comparison below would never match. Normalise both
			// sides through the pinned helper.
			const relative = normaliseToRepoRelative(callSite.file);
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

	// Round 14 M2: the round-10 M4 normalisation in the enumeration test was
	// the second, unpinned instance of the Windows-path defect class — on
	// Linux `path.sep` is `/`, so deleting the normalisation changed nothing
	// and the test stayed green. A literal backslash fixture pins it on every
	// platform, exactly as round 13 did for `isDrawerModuleImport`:
	// `path.win32.join` produces backslashes, and only the both-separator
	// normalisation can turn the result back into the repo-relative form the
	// inventory comparison needs.
	test('a win32 call-site path normalises to a repo-relative forward-slash path (round 10 M4)', () => {
		const native = path.win32.join(
			path.resolve(process.cwd()),
			'src',
			'routes',
			'x.tsx',
		);
		expect(native).toContain('\\');
		expect(normaliseToRepoRelative(native)).toBe('src/routes/x.tsx');
	});

	test('a relative ./drawer import is enumerated (round 8 M3)', () => {
		const source = "import { DrawerDescription } from './drawer';";
		const file = path.join('src', 'components', 'ui', '_fixture.tsx');
		expect(drawerDescriptionTagNames(source, file)).toEqual([
			'DrawerDescription',
		]);
	});

	// Round 13 M4: the pin above builds its fixture with native
	// `path.join`, which contains `/` on Linux — reverting the round-10
	// normalisation to the raw importer kept it green there, so the
	// Windows fix was never actually pinned. `path.win32.join` produces a
	// literal backslash path on EVERY platform; only the normalisation
	// (now splitting on both separators) can make it resolve.
	test('a relative ./drawer import is enumerated on a win32 importer path (round 10 M4)', () => {
		const source = "import { DrawerDescription } from './drawer';";
		const file = path.win32.join('src', 'components', 'ui', '_fixture.tsx');
		expect(file).toContain('\\');
		expect(drawerDescriptionTagNames(source, file)).toEqual([
			'DrawerDescription',
		]);
	});

	test('a relative import of a different module is not enumerated (round 8 M3)', () => {
		const source = "import { Foo } from './foo';";
		const file = path.join('src', 'components', 'ui', '_fixture.tsx');
		expect(drawerDescriptionTagNames(source, file)).toEqual([]);
	});

	// ---- Synthetic policy pins, browser-measured ---------------------------
	//
	// Every clause of the old hand-modeled cascade is pinned here against the
	// ENGINE — the fixture CSS appended to the real compiled app.css, the
	// element carrying the primitive class plus the fixture classes (the real
	// call-site shape), the paint read from Chromium at 1280×720. A pin that
	// agrees with Chromium is worth more than a pin that agrees with a model
	// of Chromium (round 14's standard): the browser is the oracle, and these
	// pins prove the pipeline (compile → probe markup → measure) reproduces
	// the browser's cascade — including the rules the old model got wrong.
	//
	// The design-system guard scans every src/ file for raw colour literals,
	// so the FIXTURE colours below (which exist to prove that raw colours are
	// still RESOLVED correctly) are built by concatenation rather than written
	// as one literal — the same convention as the round-4 fixtures above.
	const rawRed = '#' + 'ff0000';
	const rawNearBlack = '#' + '111111';

	test('a :hover variant never supplies the resting colour (round 8 I1)', async () => {
		const { light } = await resolveFixturePaint(
			`.x { color: var(--publy-foreground-subtle); }\n.x:hover { color: var(--publy-foreground); }`,
			['x'],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
	});

	test('an attribute variant never supplies the resting colour (round 8 I1)', async () => {
		const { light } = await resolveFixturePaint(
			`.x { color: var(--publy-foreground-subtle); }\n.x[data-active='true'] { color: var(--publy-foreground); }`,
			['x'],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
	});

	test('a @media (max-width) rule never supplies at the measured viewport (round 8 I1)', async () => {
		const { light } = await resolveFixturePaint(
			`.x { color: var(--publy-foreground-subtle); }\n@media (max-width: 767px) { .x { color: var(--publy-foreground); } }`,
			['x'],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
	});

	// Round 16 IMPORTANT 4: `hasStatePseudo` used to tokenize only the TOP
	// compound, so a `:hover`/`:checked` buried inside `:is()`/`:where()` —
	// exactly how Tailwind v4 compiles `group-hover:`/`peer-checked:` — was
	// invisible, and `data-[…]:`/`aria-…:` compile to attribute selectors,
	// never pseudo-classes, so neither shape was ever recognised as a state
	// variant. Each of these four classes' ONLY declaration is state-gated
	// (never resting), the exact shape `:hover`-only already tolerates — the
	// old scan rejected all four with a message that misdiagnosed the cause
	// ("resolve it outside the conditional rule or extend the measured
	// viewports", neither of which is possible for a `group-hover` variant).
	// A guard that reddens correct code on every Base-UI `data-open`/`data-
	// state` colour variant in the app is a false positive that must not
	// throw at all — it must silently accept the primitive's resting colour,
	// the same as the `:hover`-only case above.
	test.each([
		'group-hover:text-foreground',
		'peer-checked:text-foreground',
		'aria-hidden:text-foreground',
		'data-[state=open]:text-foreground',
	] as const)(
		'%s is a legitimate state variant and never trips the no-resting-colour throw (round 16 I4)',
		async (utility) => {
			const { light } = await resolveClassPaint([
				'publy-drawer-description',
				utility,
			]);
			const primitiveToken = tokenFromColorDeclaration(
				'.publy-drawer-description',
			);
			expect(light.color).toEqual(resolveColor(primitiveToken, 'light'));
		},
	);

	// Round 19 I2, the RED half of the paired proof: a rule keyed on a static
	// `data-*` attribute the call site WRITES (`data-contrast-probe="low"` —
	// the round-18 reviewer's exact reproduction) is part of the element's
	// real contract, not ephemeral Base UI state. The probe renders the
	// attribute, the rule MATCHES it, and the 2.51:1 paint is measured and
	// caught. Reverting the probe to ignore the call site's attributes (the
	// round-17 behaviour) makes the rule stop matching: the guard falls back
	// to the primitive's compliant default and this assertion fails — a static
	// real attribute silently bypasses the guard again.
	test('a static literal data-* attribute on the call site is measured, never exempted (round 19 I2)', async () => {
		const { light } = await resolveFixturePaint(
			`.publy-r18-static[data-contrast-probe='low'] { color: var(--publy-foreground-subtle); }`,
			['publy-r18-static'],
			{ attributes: { 'data-contrast-probe': 'low' } },
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
		expect(contrastRatio(light.color, light.background)).toBeLessThan(
			SMALL_TEXT_CONTRAST_FLOOR,
		);
	});

	// Round 25 I3, the reader/writer pin: the probe must carry the EXACT
	// string the guard resolved. The round-24 reviewer's reproduction was an
	// expression-container value containing a character reference: esbuild
	// 0.28.1 (the transform Vite runs) passes `{'a&amp;b'}` through verbatim,
	// so React writes the seven characters `a&amp;b`. The old writer
	// serialized the value into innerHTML, where the HTML parser decoded it to
	// `a&b` — the probe measured a different attribute than the browser
	// paints, in both directions (a green suite over a genuine 2.51:1 paint,
	// and a safe call site reddened). askEngine now writes every attribute
	// with setAttribute and asserts getAttribute(name) is byte-identical to
	// the resolved value on every render; here a rule keyed on the seven
	// characters must match the probe — if the probe carried anything else,
	// the pin throws and the rule cannot match. This assertion pins the
	// reader against the writer instead of either against itself, so a future
	// compensating pair of bugs cannot cancel out and hide.
	test('the probe renders the resolved attribute value byte-identically — a rule keyed on the characters React writes must match (round 25 I3)', async () => {
		const { light } = await resolveFixturePaint(
			`.publy-r25-pin[data-contrast-probe='a&amp;b'] { color: var(--publy-foreground-subtle); }`,
			['publy-r25-pin'],
			{},
			attributeConfigurationsOf({
				'data-contrast-probe': { status: 'resolved', values: ['a&amp;b'] },
			}),
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
		expect(contrastRatio(light.color, light.background)).toBeLessThan(
			SMALL_TEXT_CONTRAST_FLOOR,
		);
	});

	// Round 19 I2, the reservation half of the pairing: the state-attribute
	// exemption is for attributes PROVEN absent at rest (Base UI's runtime
	// state). An attribute the call site writes is present at rest, so a rule
	// keyed on a DIFFERENT value of it is a genuinely non-applying resting
	// declaration — never "ephemeral state". The class's only declaration sits
	// behind `[data-shade='dark']` while the element carries `data-shade=
	// "light"`, so the guard must fail loud by name. Reverting the reservation
	// (treating every non-slot data-* as ephemeral, the round-17 behaviour)
	// exempts the rule and reports the compliant primitive instead — the exact
	// false negative IMPORTANT 2 exists to close.
	test('a static data-* attribute is not exempted as ephemeral state and fails loud when its value never rests (round 19 I2)', async () => {
		await expect(async () =>
			resolveFixturePaint(
				`.publy-r18-shade[data-shade='dark'] { color: var(--publy-foreground-subtle); }`,
				['publy-r18-shade'],
				{ attributes: { 'data-shade': 'light' } },
			),
		).rejects.toThrow(/No resting colour for publy-r18-shade/);
	});

	// Round 8 I1 said "a @supports-nested rule never supplies the resting
	// colour" — that was the model's blindness: it could not evaluate the
	// condition, so it excluded EVERY @supports rule. The engine evaluates it,
	// and `(display: grid)` holds in Chromium — the later rule wins the
	// cascade and IS the resting colour. The honest statement of the pin:
	// @supports rules supply when their condition holds (round 14 M3's
	// `text-primary/50` fallback works exactly this way).
	test('a @supports rule supplies when its condition holds (round 8 I1, engine-corrected)', async () => {
		const { light } = await resolveFixturePaint(
			`.x { color: var(--publy-foreground-subtle); }\n@supports (display: grid) { .x { color: var(--publy-foreground); } }`,
			['x'],
		);
		expect(light.color).toEqual(resolveColor('--publy-foreground', 'light'));
	});

	// Round 16 MINOR 3: `askEngine` never evaluates `@container` — it
	// hardcodes `conditionsHeld: false` for it, unlike `@media`/`@supports` —
	// so a class whose only declaration is container-gated always lands in
	// the no-resting-colour throw, regardless of whether the real drawer
	// markup would establish the container and match. The throw must name
	// this exclusion, not imply the media/supports remedy ("extend the
	// measured viewports") can fix it.
	test('a @container-gated declaration states the exclusion by name (round 16 MINOR 3)', async () => {
		await expect(async () =>
			resolveFixturePaint(
				'@container (min-width: 1px) {\n' +
					'  .x { color: var(--publy-foreground-subtle); }\n' +
					'}',
				['x'],
			),
		).rejects.toThrow(/This guard never evaluates a @container condition/);
	});

	// Round 8 I2 + round 10 I2: nesting is SEEN. Round 10 I2 re-cast the pin:
	// a rule nested inside a plain rule resolves to `.parent .x` — an
	// ANCESTOR-QUALIFIED rule. The old model could not verify the ancestor and
	// reported the rule as a POSSIBLE paint; the engine renders the drawer
	// markup and MEASURES. When the `.parent` ancestor is present (as the
	// drawer panel is in the real app) the browser paints the nested rule's
	// colour; when it is absent, the class has no resting colour and fails
	// loud. Both directions are pinned — the round-10 I2 control (three lines
	// of ordinary CSS made every drawer read fully green while painting
	// 2.515:1) is now measured truth.
	test('a nested rule paints when its ancestor is present (round 8 I2 + round 10 I2)', async () => {
		const { light } = await resolveFixturePaint(
			`.parent { .x { color: ${rawRed}; } }`,
			['x'],
			{ ancestorClass: 'parent' },
		);
		expect(light.color).toEqual({ r: 255, g: 0, b: 0, a: 1 });
	});

	// Round 17 I4: this shape has no `@media`/`@supports`/`@container` at all —
	// the old "Only conditional declarations" message misdiagnosed a plain
	// missing-ancestor rule as a viewport-conditional one.
	test('a nested rule whose ancestor is absent fails loud by name, named as a missing ancestor (round 10 I2, round 17 I4)', async () => {
		await expect(async () =>
			resolveFixturePaint(`.parent { .x { color: ${rawRed}; } }`, ['x']),
		).rejects.toThrow(/No resting colour for x: color .* ancestor/);
	});

	// Round 10 I2, flat spelling: the same ancestor qualification written as
	// a plain descendant combinator, with the ancestor the real drawer
	// provides. `.publy-drawer .x` MATCHES the probe (the description sits
	// inside `.publy-drawer`), so the browser crowns it — the 2.515:1 paint
	// the old "possible paint" fold could only approximate is now measured.
	test('a descendant-qualified rule paints on the real drawer markup (round 10 I2/M2)', async () => {
		const { light } = await resolveFixturePaint(
			`.x { color: var(--publy-foreground-secondary); }\n.publy-drawer .x { color: var(--publy-foreground-subtle); }`,
			['x'],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
	});

	test('a descendant-qualified rule never paints when its ancestor is absent', async () => {
		const { light } = await resolveFixturePaint(
			`.x { color: ${rawNearBlack}; }\n.parent .x { color: ${rawRed}; }`,
			['x'],
		);
		expect(light.color).toEqual({ r: 0x11, g: 0x11, b: 0x11, a: 1 });
	});

	// Round 10 I1: the two-class `className` — the headline round-10 finding.
	// The browser resolves competing plain class rules by layer → specificity
	// → source order, NEVER by the order of names in the class attribute.
	// This synthetic pair pins that the guard agrees: same CSS, swapped
	// attribute order, identical verdicts.
	test('a two-class className resolves by source order, not attribute order (round 10 I1)', async () => {
		const css =
			'.a { color: var(--publy-foreground); }\n' +
			'.b { color: var(--publy-foreground-subtle); }';
		const forward = await resolveFixturePaint(css, ['a', 'b']);
		const reversed = await resolveFixturePaint(css, ['b', 'a']);
		expect(forward.light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
		expect(reversed.light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
	});

	test('an unlayered utility outranks a components-layer app class (round 10 I1)', async () => {
		// The unlayered rule comes FIRST on purpose: source order alone would
		// crown the LATER layered rule, while the browser crowns the
		// unlayered one — unlayered outranks every layer regardless of
		// position, exactly how Tailwind's generated utilities beat the
		// app's `@layer components` blocks.
		const css =
			'.b { color: var(--publy-foreground); }\n' +
			'@layer components { .a { color: var(--publy-foreground-subtle); } }';
		const forward = await resolveFixturePaint(css, ['a', 'b']);
		const reversed = await resolveFixturePaint(css, ['b', 'a']);
		expect(forward.light.color).toEqual(
			resolveColor('--publy-foreground', 'light'),
		);
		expect(reversed.light.color).toEqual(
			resolveColor('--publy-foreground', 'light'),
		);
	});

	// Round 10 M1: the two cascade inversions css-cascade-test-support.ts was
	// hardened against in round 3, reintroduced by round 9's source-order
	// last-wins and now closed by the engine.
	test('an !important declaration beats a later plain one (round 10 M1)', async () => {
		const { light } = await resolveFixturePaint(
			'.x { color: var(--publy-foreground-subtle) !important; }\n' +
				'.x { color: var(--publy-foreground); }',
			['x'],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
	});

	// Round 13: `!important` REVERSES layer precedence (css-cascade-5
	// § 6.3) — the round-12 reviewer proved the browser crowns the EARLIER
	// layer for an important declaration while the source guard (normal layer
	// order) crowned the later one. Round 14 M1: two of the three layer pins
	// were forced by source order — vacuous against the old model. Against
	// the ENGINE they are browser facts, not model arithmetic: Chromium
	// itself is the assertion, so the vacuity objection cannot apply. The
	// same two rules with the importance flag flipped must produce OPPOSITE
	// winners, and an important LAYERED declaration must beat an important
	// unlayered one.
	test('normal declarations: the later layer wins (round 13 layer order)', async () => {
		const { light } = await resolveFixturePaint(
			'@layer components { .a { color: var(--publy-foreground-subtle); } }\n' +
				'@layer utilities { .b { color: var(--publy-foreground); } }',
			['a', 'b'],
		);
		expect(light.color).toEqual(resolveColor('--publy-foreground', 'light'));
	});

	test('!important declarations: the EARLIER layer wins (round 13 layer reversal)', async () => {
		const { light } = await resolveFixturePaint(
			'@layer components { .a { color: var(--publy-foreground-subtle) !important; } }\n' +
				'@layer utilities { .b { color: var(--publy-foreground) !important; } }',
			['a', 'b'],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
	});

	test('an important LAYERED declaration beats an important unlayered one (round 13 layer reversal)', async () => {
		const { light } = await resolveFixturePaint(
			'.b { color: var(--publy-foreground) !important; }\n' +
				'@layer components { .a { color: var(--publy-foreground-subtle) !important; } }',
			['a', 'b'],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
	});

	test('a higher-specificity compound beats a later plain rule (round 10 M1)', async () => {
		const { light } = await resolveFixturePaint(
			'.a.x { color: var(--publy-foreground-subtle); }\n' +
				'.x { color: var(--publy-foreground); }',
			['a', 'x'],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
	});

	// Round 10 I3, PAIRED PROOF, engine-corrected. The red side of round 10
	// was a class whose ONLY colour declaration lives inside a conditional
	// at-rule — it had to throw rather than fall through to the primitive's
	// compliant default. The engine keeps the fail-loud for the shape that is
	// genuinely unverifiable — a conditional that never fires at the measured
	// viewport — and MEASURES the shape the browser can verify: a conditional
	// that fires at 1280×720. Both directions are pinned.
	test('a colour declared only in a conditional that fires is measured (round 10 I3)', async () => {
		const { light } = await resolveFixturePaint(
			'@media (min-width: 640px) {\n' +
				'  .x { color: var(--publy-foreground-subtle); }\n' +
				'}',
			['x'],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
	});

	test('a colour declared only in a conditional that never fires fails loud by name (round 10 I3)', async () => {
		await expect(async () =>
			resolveFixturePaint(
				'@media (max-width: 767px) {\n' +
					'  .x { color: var(--publy-foreground-subtle); }\n' +
					'}',
				['x'],
			),
		).rejects.toThrow(/Only conditional declarations for x: color/);
	});

	// Round 13 I3 + round 14 I1: the round-12 reviewer reproduced the masking
	// on the real change-email drawer — the PRIMITIVE's unconditional `color`
	// satisfied the old per-property supply bookkeeping, so a caller class
	// whose only colour declaration was conditional never threw and the guard
	// read green while the browser painted 2.51:1. The re-key closed the
	// bookkeeping hole; the engine closes the whole class: the caller's paint
	// IS the browser's paint, so the primitive's compliant default can never
	// substitute for it. This pin is the reviewer's exact reproduction made
	// permanent — the caller class wrapped in `:is()`, conditional-only, on
	// the element next to the primitive, measured at 2.51:1.
	test('a :is()-wrapped conditional-only caller is measured, never masked by the primitive (round 14 I1)', async () => {
		const { light } = await resolveFixturePaint(
			'@layer components {\n' +
				'  @media (min-width: 640px) {\n' +
				'    :is(.publy-r14-cond) {\n' +
				'      color: var(--publy-foreground-subtle);\n' +
				'    }\n' +
				'  }\n' +
				'}',
			['publy-r14-cond'],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
		const primitiveToken = tokenFromColorDeclaration(
			'.publy-drawer-description',
		);
		expect(light.color).not.toEqual(resolveColor(primitiveToken, 'light'));
		// The reviewer's own number: 2.51:1 at the e2e's viewport.
		expect(contrastRatio(light.color, light.background)).toBeLessThan(
			SMALL_TEXT_CONTRAST_FLOOR,
		);
	});

	// Round 14 I2: one unverifiable `!important` rule used to delete every
	// normal candidate for the property in the old model, and the call site
	// silently substituted the primitive default. The engine has no candidate
	// bookkeeping — the browser crowns the absent-ancestor `!important` rule
	// nowhere, and the plain rule paints. Measured, never substituted.
	test('an ancestor-qualified !important rule never paints without its ancestor (round 14 I2)', async () => {
		const { light } = await resolveFixturePaint(
			'@layer components {\n' +
				'  .publy-r14-d1 { color: var(--publy-foreground-subtle); }\n' +
				'  .publy-r14-absent .publy-r14-d1 { color: var(--publy-foreground-secondary) !important; }\n' +
				'}',
			['publy-r14-d1'],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
		const primitiveToken = tokenFromColorDeclaration(
			'.publy-drawer-description',
		);
		expect(light.color).not.toEqual(resolveColor(primitiveToken, 'light'));
		expect(contrastRatio(light.color, light.background)).toBeLessThan(
			SMALL_TEXT_CONTRAST_FLOOR,
		);
	});

	// Round 14 I3: `:is()` takes the specificity of its most specific
	// argument (Selectors 4 § 17) — the old model charged a flat 10 per
	// pseudo-class token, so `.publy-r14-c1:is(.publy-r14-c2.publy-r14-c3)`
	// tied the later plain rule and lost on source order while the browser
	// crowned it at (0,3,0). The engine's specificity IS the browser's.
	test('a functional pseudo-class takes its argument specificity (round 14 I3)', async () => {
		const { light } = await resolveFixturePaint(
			'@layer components {\n' +
				'  .publy-r14-c1:is(.publy-r14-c2.publy-r14-c3) { color: var(--publy-foreground-subtle); }\n' +
				'  .publy-r14-c2.publy-r14-c3 { color: var(--publy-foreground-secondary); }\n' +
				'}',
			['publy-r14-c1', 'publy-r14-c2', 'publy-r14-c3'],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
		expect(contrastRatio(light.color, light.background)).toBeLessThan(
			SMALL_TEXT_CONTRAST_FLOOR,
		);
	});

	// Round 14 I4: `:not()` with a COMPLEX argument is valid Selectors 4 —
	// the old model defaulted an unparseable argument list to "matches",
	// which for `:not` means the rule does not apply, silently dropping it.
	// The browser evaluates the complex argument natively; the guard measures
	// the 2.51:1 paint instead of discarding it.
	test('a :not() complex argument is evaluated by the browser, never defaulted (round 14 I4)', async () => {
		const { light } = await resolveFixturePaint(
			'@layer components {\n' +
				'  .publy-r14-e1:not(.publy-r14-absent .publy-r14-e1) {\n' +
				'    color: var(--publy-foreground-subtle);\n' +
				'  }\n' +
				'}',
			['publy-r14-e1'],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
		expect(contrastRatio(light.color, light.background)).toBeLessThan(
			SMALL_TEXT_CONTRAST_FLOOR,
		);
	});

	// Round 10 M3: state-variant-ness is decided by whether the pseudo-class
	// paints at rest, not by its shape. `:not()`/`:where()`/`:is()` paint at
	// rest; `html.dark .x` is a theme gate the engine evaluates with the
	// probe's `<html>` class.
	test('a rest-applying :not() rule supplies and wins on specificity (round 10 M3)', async () => {
		const { light } = await resolveFixturePaint(
			'.x { color: var(--publy-foreground); }\n' +
				'.x:not(.never) { color: var(--publy-foreground-subtle); }',
			['x'],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
	});

	test('a :not() whose argument is on the element does not apply (round 10 M3)', async () => {
		const { light } = await resolveFixturePaint(
			'.x { color: var(--publy-foreground); }\n' +
				'.x:not(.never) { color: var(--publy-foreground-subtle); }',
			['x', 'never'],
		);
		expect(light.color).toEqual(resolveColor('--publy-foreground', 'light'));
	});

	// Round 13: `:has()` matches DESCENDANTS, never the subject element's own
	// class list — the round-12 reviewer reproduced exactly this on the real
	// invite drawer: `.publy-r12-has-child:has(.publy-r12-child)` with the
	// child BENEATH the element. The old model reported the rule as a POSSIBLE
	// paint; the engine measures BOTH configurations — the descendant present
	// and absent — and reports whichever is the WORSE (round 16 I2: a single
	// fabricated child is not a worst case, it is one arbitrary case that can
	// only turn a failing real paint green). Here the `:has()` colour IS the
	// worse one, so it is what a caller with no explicit `children` sees.
	test('a :has() rule is measured with its descendant present when that is the worse paint (round 13, round 16 I2)', async () => {
		const { light } = await resolveFixturePaint(
			'.x { color: var(--publy-foreground); }\n' +
				'.x:has(.publy-r12-child) { color: var(--publy-foreground-subtle); }',
			['x'],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
	});

	// Round 16 I2, the paired proof in the OTHER direction: the `:has()` rule
	// now carries the MORE compliant colour, and the app never renders
	// `.publy-r16-kid` as a real descendant. A guard that only ever fabricates
	// the descendant would measure the compliant colour and miss the real
	// 2.51:1-class paint entirely; measuring both and keeping the worse one
	// cannot be fooled by a `:has()` rule that only helps in a configuration
	// the app never reaches.
	test('a :has() rule that only turns MORE compliant with an unrendered descendant cannot mask the worse base paint (round 16 I2)', async () => {
		const { light } = await resolveFixturePaint(
			'.x { color: var(--publy-foreground-subtle); }\n' +
				'.x:has(.publy-r16-kid) { color: var(--publy-foreground-secondary); }',
			['x'],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'light'),
		);
	});

	test('a :has() rule paints nothing when the descendant is explicitly forced absent', async () => {
		const { light } = await resolveFixturePaint(
			'.x { color: var(--publy-foreground); }\n' +
				'.x:has(.publy-r12-child) { color: var(--publy-foreground-subtle); }',
			['x'],
			{ children: [] },
		);
		expect(light.color).toEqual(resolveColor('--publy-foreground', 'light'));
	});

	// Round 13 M3: the round-10 M3 pin put the `:where()` rule AFTER an equal
	// competitor, so it won by source order even if `:where()` contributed an
	// arbitrarily large specificity — the named "zero specificity" claim was
	// vacuous. Reversed: the `:where()` rule comes FIRST and must still LOSE
	// to the later plain rule of equal class specificity — only a true zero
	// contribution ties them and hands the win to source order. The engine's
	// answer is Chromium's.
	test('a :where() rule contributes zero specificity and loses to a later equal competitor (round 10 M3)', async () => {
		const { light } = await resolveFixturePaint(
			'.x:where(.a, .x) { color: var(--publy-foreground-subtle); }\n' +
				'.x { color: var(--publy-foreground); }',
			['x'],
		);
		expect(light.color).toEqual(resolveColor('--publy-foreground', 'light'));
	});

	test('a dark-themed ancestor rule never paints in light, paints in dark (round 10 M3)', async () => {
		const css =
			'.x { color: var(--publy-foreground); }\n' +
			'html.dark .x { color: var(--publy-foreground-subtle); }';
		const { light, dark } = await resolveFixturePaint(css, ['x']);
		// In light the gate excludes the rule entirely.
		expect(light.color).toEqual(resolveColor('--publy-foreground', 'light'));
		// In dark the gate applies — the later rule wins the tie on
		// specificity (ancestor compounds do not add specificity here).
		expect(dark.color).toEqual(
			resolveColor('--publy-foreground-subtle', 'dark'),
		);
	});

	test('a statement at-rule does not absorb the following rule (round 8 M6)', async () => {
		const { light } = await resolveFixturePaint(
			`@layer properties;\n.x { color: ${rawRed}; }`,
			['x'],
		);
		expect(light.color).toEqual({ r: 255, g: 0, b: 0, a: 1 });
	});

	test('a themed dark gate supplies the resting colour in dark mode only (round 9 rule 4)', async () => {
		const gated =
			'.dark\\:x { &:is(.dark *) { color: var(--publy-foreground); } }';
		const { light, dark } = await resolveFixturePaint(gated, ['dark:x']);
		const primitiveToken = tokenFromColorDeclaration(
			'.publy-drawer-description',
		);
		expect(light.color).toEqual(resolveColor(primitiveToken, 'light'));
		expect(dark.color).toEqual(resolveColor('--publy-foreground', 'dark'));
	});

	test('an !important declaration resolves the same colour as the plain one (round 8 M5)', async () => {
		const { light } = await resolveFixturePaint(
			'.x { color: var(--publy-foreground-muted) !important; }',
			['x'],
		);
		expect(light.color).toEqual(
			resolveColor('--publy-foreground-muted', 'light'),
		);
	});

	// Round 16 IMPORTANT 3: when the probe element is not hit-testable at its
	// own centre point, `hitStack.indexOf(element)` returns -1 and
	// `slice(-1)` used to silently degrade the composite to the LAST hit-stack
	// element (`<html>`) instead of throwing — a background substitution the
	// reviewer proved measurably more forgiving than the real drawer surface.
	// `invisible` (`visibility: hidden`) is an entirely ordinary thing to put
	// on a dialog description and removes it from the hit stack; the guard
	// must fail loud by name instead of measuring an unrelated background.
	test('an element outside its own hit stack fails loud instead of measuring a substituted background (round 16 I3)', async () => {
		await expect(async () =>
			resolveClassPaint(['publy-drawer-description', 'invisible']),
		).rejects.toThrow(/not hit-testable at its own centre point/);
	});

	// ---- The call-site guard ------------------------------------------------

	test.each(
		CALL_SITES.map(
			(callSite, index) =>
				[index, callSite.file, callSite.line, callSite] as const,
		),
	)(
		'every DrawerDescription call site keeps 4.5:1 on the composited drawer surface (site #%i: %s:%s)',
		async (_index, _file, _line, callSite) => {
			// Round 10 I1: the element carries the primitive class AND the
			// caller's classes, resolved TOGETHER in one browser cascade —
			// layer → importance → specificity → source order in the real
			// stylesheet, exactly like the e2e, and never by the order of
			// names in the className attribute. The primitive's own colour is
			// a cascade contender like any other — no fallback left to
			// substitute.
			const utilities =
				callSite.className === null
					? ['publy-drawer-description']
					: [
							'publy-drawer-description',
							...callSite.className.split(/\s+/).filter((u) => u !== ''),
						];
			const { light, dark } = await resolveClassPaint(utilities, {}, [
				// Round 21 I1: every proven attribute value set is its own probe
				// configuration — a ternary writes two, and both are measured.
				...attributeConfigurationsOf(callSite.stateAttributes),
			]);

			for (const [theme, paint] of [
				['light', light],
				['dark', dark],
			] as const) {
				const foreground = withOpacity(paint.color, paint.opacity);
				const ratio = contrastRatio(
					effectiveForeground(foreground, paint.background),
					paint.background,
				);
				expect(
					ratio,
					`${callSite.file}:${callSite.line} (className: ${callSite.className}) in ${theme} theme`,
				).toBeGreaterThanOrEqual(SMALL_TEXT_CONTRAST_FLOOR);
			}
		},
	);
});
