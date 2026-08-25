import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import postcss from 'postcss';
import { ts } from 'ts-morph';
import { createBuilder, isCSSRequest, type Plugin } from 'vite';

/**
 * Shared type aliases for the guard. The guard is a standalone `.mts` script
 * (no declaration emit), so these exist purely to keep strict checking green
 * without widening anything to `any`.
 */
type PostcssNode = postcss.Node;
type PostcssRoot = postcss.Root;
type TsSourceFile = ts.SourceFile;
type TsNode = ts.Node;
/** A diagnostic row every z-index guard check reports. */
export type ZIndexViolation = {
	ruleId: string;
	message: string;
	file?: string;
	line?: number;
	source?: string;
};

/**
 * The scanner is only consumed through its candidate extractor, so the guard
 * types it structurally: the real `@tailwindcss/oxide` Scanner satisfies it,
 * and unit fixtures can supply the same surface.
 */
export type ZIndexCandidateScanner = {
	getCandidatesWithPositions: (input: {
		file: string;
		content: string;
		extension: string;
	}) => Array<{ candidate: string; position: number }>;
};

/** Every node `nearestBinding` can resolve a name to. */
type ScriptBindingDeclaration =
	| ts.VariableDeclaration
	| ts.FunctionDeclaration
	| ts.FunctionExpression
	| ts.ClassDeclaration
	| ts.EnumDeclaration
	| ts.ParameterDeclaration
	| ts.ImportClause
	| ts.NamespaceImport
	| ts.ImportSpecifier;

export type RawImportBindingKind = 'default' | 'namespace' | 'named-non-default';
export type RawImportBindingEntry = {
	specifier: string;
	declaration: ScriptBindingDeclaration;
	kind: RawImportBindingKind;
};

type StaticStringValuesResult = {
	values: ReadonlySet<string> | null;
	partial: boolean;
	overflow?: boolean;
};
type StaticStringOutcome =
	| { kind: 'value'; value: string }
	| { kind: 'overflow' }
	| { kind: 'not-static' };
type MemberChainResult = { node: TsNode | null; overflow: boolean };
type RawSpecifierResolution = { specifiers: string[]; unresolved: boolean };
type StaticObjectMemberResult = {
	node: TsNode | null;
	unresolved: boolean;
	opaqueOnly: boolean;
	opaqueSpreadNode: TsNode | null;
	overflowKeys: boolean;
};
type LastJsxAttributeOccurrence = {
	valueNode: TsNode | null;
	established: boolean;
	unresolved: boolean;
	opaqueOnly: boolean;
	opaqueSpreadNode: TsNode | null;
	overflowKeys: boolean;
};
type DangerousHtmlPayloadResult = {
	payloadObject: ts.ObjectLiteralExpression | null;
	found: boolean;
	unresolved: boolean;
	opaqueOnly: boolean;
	opaqueSpreadNode: TsNode | null;
	overflowKeys: boolean;
};
type StaticMemberInfo = {
	owner: TsNode;
	name: string | null;
	overflow: boolean;
};
type StaticStylePayload = {
	css: ReadonlyArray<string> | null;
	staticParts: ReadonlyArray<string> | null;
	childrenSuppressed: boolean;
	overflow: boolean;
};
type CssContainerDescription =
	| { type: 'rule'; selector: string }
	| { type: 'at-rule'; name: string; params: string };
type ScannedCssDeclaration = {
	ancestors: CssContainerDescription[];
	decodedProperty: string;
	selector: string;
	property: string;
	value: string;
	line: number;
};
export type KnownRawZIndexDeclaration = {
	ancestors: CssContainerDescription[];
	selector: string;
	declaration: string;
	count: number;
	reason?: string;
};
type CssomReceiverKind = 'style-decl' | 'plain-object' | 'unresolved' | 'other';
type CssSetterCallKind = CssomReceiverKind | 'overflow';
type HeadFunction =
	| ts.ArrowFunction
	| ts.FunctionExpression
	| ts.FunctionDeclaration;
export type ModuleClassification = {
	filePath: string;
	hasQuery: boolean;
	kind:
		| 'css'
		| 'inline-css'
		| 'css-url'
		| 'url-asset'
		| 'raw'
		| 'script'
		| 'other';
};
export type ProductionBuildResult = {
	emittedCssRoot: string;
	authoredCssPaths: string[];
	authoredScriptPaths: string[];
	inlineCssPaths: string[];
	rawTextPaths: string[];
	rawTextIds: string[];
	queriedPaths: string[];
	cleanup: () => Promise<void>;
};
export type ZIndexGuardRunResult = {
	violations: ZIndexViolation[];
	compiled: string;
	emittedCssAssets: Array<{ path: string; content: string }>;
	candidateCount: number;
	fileCount: number;
};
type ScannerOptions = NonNullable<ConstructorParameters<typeof Scanner>[0]>;
type ScannerSource = NonNullable<ScannerOptions['sources']>[number];

const rootDir = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const appCssPath = path.join(rootDir, 'src/styles/app.css');

const SCRIPT_EXTENSIONS = new Set([
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'.mts',
	'.cts',
]);

const scriptKindForPath = (filePath: string): ts.ScriptKind => {
	if (filePath.endsWith('.tsx')) {
		return ts.ScriptKind.TSX;
	}
	if (filePath.endsWith('.jsx')) {
		return ts.ScriptKind.JSX;
	}
	return ts.ScriptKind.TS;
};

// The `finally` cleanup cannot run when the process is killed, so an
// interrupted guard run would otherwise leak its private build directory into
// the OS temp root. On SIGINT/SIGTERM the build is still mid-write, so instead
// of racing the `rm` against the running build, the handler exits the process
// immediately (which stops the build) and hands the directory to a detached
// child that sweeps it without the parent holding its lifecycle. A SIGKILL
// (kill -9) bypasses both — that residual is bounded to a stale
// `publy-zindex-guard-*` temp dir in the OS temp root, never the working tree.
/** Mirrors TypeScript's `FunctionLikeDeclaration` family for honest narrowing. */
const isFunctionLikeDeclaration = (
	node: TsNode,
): node is ts.FunctionLikeDeclaration =>
	ts.isFunctionDeclaration(node) ||
	ts.isMethodDeclaration(node) ||
	ts.isGetAccessorDeclaration(node) ||
	ts.isSetAccessorDeclaration(node) ||
	ts.isConstructorDeclaration(node) ||
	ts.isFunctionExpression(node) ||
	ts.isArrowFunction(node);

const activeBuildDirectories = new Set<string>();
const sweepBuildDirectories = (directories: string[]): void => {
	if (directories.length === 0) {
		return;
	}
	const payload = `
		const { rm } = require('node:fs/promises');
		(async () => {
			for (const dir of ${JSON.stringify(directories)}) {
				await rm(dir, { recursive: true, force: true });
			}
		})().catch(() => process.exit(1));
	`;
	const child = spawn(process.execPath, ['-e', payload], {
		stdio: 'ignore',
		detached: true,
	});
	child.unref();
};
for (const signal of ['SIGINT', 'SIGTERM']) {
	process.once(signal, () => {
		sweepBuildDirectories([...activeBuildDirectories]);
		process.exit(signal === 'SIGINT' ? 130 : 143);
	});
}

// ---------------------------------------------------------------------------
// #987 — z-index scale guard.
//
// The invariant: every z-index utility in `apps/front/src` must route through
// the `--publy-z-*` scale declared in src/styles/app.css. A raw numeric
// utility (`z-50`, `z-[60]`, `-z-10`) bypasses the scale and caused the bug
// this guard exists to prevent (a popup painted behind a drawer).
//
// Mechanism: the installed Tailwind extractor (`@tailwindcss/oxide` Scanner)
// reports exactly the candidates the production compiler recognises, scanned
// from the same sources the production build uses (derived from
// `@import 'tailwindcss' source('../')` in app.css via `@tailwindcss/node`'s
// `compile()`). Re-implementing class extraction from source is exactly what
// failed twice before, so the guard does not do that.
//
// Five components, in order of increasing distance from the source:
//   1. Candidate scan — every extractor candidate that is a raw z-index
//      utility is reported, unless it sits in a position that can never
//      become a delivered class (type literals, non-class JSX attributes,
//      comparison operands, CSS string values; comments are stripped first).
//   2. `@apply` scan — the extractor drops the token that ends an `@apply`
//      directive right before `;`, so `@apply block z-50;` yields no `z-50`
//      candidate; the directive text itself is scanned for raw utilities.
//   3. Substitution-boundary scan — `z-${level}` has no candidate at
//      extractor time; a class-delivery template literal whose static parts
//      carry a z-index fragment across a `${…}` boundary is reported.
//   4. Compiled-CSS gate — a real Vite build writes into a unique guard-owned
//      directory, and that exact output is scanned for `z-index:` declarations
//      that do not resolve through `var(--publy-z-…)`. This proves what this
//      invocation actually ships, which is the exact failure that killed the
//      previous attempt (its own fixture literals reached the stylesheet).
//   5. Scale-definition integrity — build-transformed project stylesheets and
//      their local CSS imports are the authored provenance set. Reserved
//      `--publy-z-*` tokens may only be defined once in a top-level :root in
//      src/styles/app.css. Tailwind's generated emitted form is recognised
//      separately. Literal script-object and setProperty() overrides are
//      rejected before they can shadow an accepted reference.
//
// Out of scope (documented, not silently absent — see
// docs/guides/front/z-index-guard.md):
//   - raw `z-index:` declarations in app.css that are NOT Tailwind utilities.
//     The single existing one (`.publy-data-table thead` sticky header,
//     `z-index: 5`) is allowlisted in KNOWN_RAW_Z_INDEX_DECLARATIONS below,
//     bound to its exact ancestor chain, selector list, AND an expected
//     occurrence count — a raw `z-index: 5` in any other context, on any
//     other selector, or in a duplicate of this rule reds the guard.
//   - inline `style={{ zIndex: … }}` objects (initials-avatar overlapping
//     avatars is the only user today; toaster.tsx already uses the token).
//   - z-index assembled at runtime from values that never appear literally
//     anywhere in `src` (e.g. from an API response).
//   - stylesheets injected at runtime through CSSStyleSheet, insertRule(), a
//     <style> element, or a dynamically assembled stylesheet <link>. They
//     never become production-build CSS assets. Literal JSX stylesheet links
//     and static link-descriptor objects are rejected by the script AST pass.
//   - reserved-token writes mediated by helper parameters (a key or name that
//     arrives through a function parameter or an unscanned import). Spreads
//     are NOT silent: a spread whose source resolves to a module-scope const
//     object literal — through any alias chain, followed to a cycle-guarded
//     fixpoint — is transparent, and a genuinely opaque spread in a provably
//     style-capable position (a `<style>` element, a dangerouslySetInnerHTML
//     payload object, a CSS.registerProperty() descriptor) is a named
//     `z-index-unresolved-spread-shadow` diagnostic even when it is the only
//     source — never a silent green. An opaque spread in an object literal
//     that is not provably a style descriptor stays in the runtime bucket.
//   - `?raw` consumed through a dynamic `import('./x.txt?raw')` or re-exported
//     across modules; the AST pass tracks static import declarations and
//     per-file bindings only. A style-sink expression that contains a
//     recorded raw binding in a position the guard cannot statically evaluate
//     is a named `z-index-unresolved-raw-expression` diagnostic.
//   - a class assembled by `+` string concatenation (`'z-' + 5`) produces no
//     extractor candidate, so it ships no rule on its own — it is dead text
//     UNLESS a rule for that class exists by another route. Any route that
//     generates such a rule (`@source inline("z-5")`, `@utility z-5`, a raw
//     app.css rule, a `z-5` literal elsewhere) emits `z-index: 5` into the
//     compiled CSS, which component 4 flags — the combination is red, not a
//     green bypass.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Comment stripping — string-aware so a `//` or `/*` inside a string/template
// literal is never mistaken for a comment. Comment bodies are replaced with
// same-length whitespace so candidate character offsets stay valid.
// ---------------------------------------------------------------------------
export const stripComments = (source: string): string => {
	const chars = source.split('');
	const n = chars.length;

	const blank = (from: number, to: number): void => {
		for (let k = from; k < to; k += 1) {
			if (chars[k] !== '\n') {
				chars[k] = ' ';
			}
		}
	};

	const scanTemplate = (openIndex: number): number => {
		let j = openIndex + 1;
		while (j < n) {
			const c = chars[j];
			if (c === '\\') {
				j += 2;
				continue;
			}
			if (c === '`') {
				return j + 1;
			}
			if (c === '$' && chars[j + 1] === '{') {
				j = scanCode(j + 2, '}');
				continue;
			}
			j += 1;
		}
		return n;
	};

	const scanCode = (start: number, terminator: string): number => {
		let j = start;
		while (j < n) {
			const c = chars[j];
			if (c === terminator) {
				return j + 1;
			}
			if (c === '/' && chars[j + 1] === '/') {
				let k = j;
				while (k < n && chars[k] !== '\n') {
					if (chars[k] !== '\n') {
						chars[k] = ' ';
					}
					k += 1;
				}
				j = k;
				continue;
			}
			if (c === '/' && chars[j + 1] === '*') {
				let k = j + 2;
				while (k < n) {
					if (chars[k] === '*' && chars[k + 1] === '/') {
						break;
					}
					k += 1;
				}
				blank(j, k + 2);
				j = k + 2;
				continue;
			}
			if (c === '"' || c === "'") {
				let k = j + 1;
				while (k < n) {
					if (chars[k] === '\\') {
						k += 2;
						continue;
					}
					if (chars[k] === c) {
						break;
					}
					k += 1;
				}
				j = k + 1;
				continue;
			}
			if (c === '`') {
				j = scanTemplate(j);
				continue;
			}
			j += 1;
		}
		return n;
	};

	scanCode(0, '\u0000');
	return chars.join('');
};

// ---------------------------------------------------------------------------
// Candidate classifier. The extractor reports candidate *strings*; a candidate
// is a z-index utility when its utility part (the last top-level `:`-separated
// segment, with leading/trailing `!` stripped) is `z-…` or `-z-…`. `z-index`
// is a CSS property name, never a utility, so it is excluded.
// ---------------------------------------------------------------------------
const splitUtilityPart = (candidate: string): string => {
	let depth = 0;
	let lastSplit = -1;
	for (let index = 0; index < candidate.length; index += 1) {
		const character = candidate[index];
		if (character === '[' || character === '(') {
			depth += 1;
		} else if (character === ']' || character === ')') {
			depth -= 1;
		} else if (character === ':' && depth === 0) {
			lastSplit = index;
		}
	}
	const utility = lastSplit === -1 ? candidate : candidate.slice(lastSplit + 1);
	return utility.replace(/^!/, '').replace(/!$/, '');
};

const isZIndexUtility = (utility: string): boolean =>
	/^z-(?!index)/.test(utility) ||
	utility.startsWith('-z-') ||
	isZIndexArbitraryProperty(utility);

// Non-numeric z-index values that cannot participate in stacking at all, so
// they need no scale tier (mirrors Tailwind's own `z-auto` exemption in the
// issue). `z-auto` is the only bare one Tailwind ships, but the arbitrary
// spellings of the same CSS-wide keywords are equally inert.
const NON_STACKING_KEYWORDS = new Set([
	'auto',
	'inherit',
	'initial',
	'unset',
	'revert',
	'revert-layer',
]);

const asciiLowerCase = (text: string): string =>
	text.replace(/[A-Z]/g, (character) =>
		String.fromCharCode(character.charCodeAt(0) + 32),
	);

// Cartesian product of string candidate sets, concatenated in order. Used to
// evaluate a template literal (static parts × substitution sets) or a `+` of
// two static operands to every string the expression can provably be.
//
// The product has a *work* budget, not a legitimacy cap (round-16 I2, round-19
// I2): several multi-candidate substitutions multiply without bound, and a
// pathological template would otherwise hang the guard instead of failing. The
// budget measures the actual job — the total characters allocated across the
// produced candidates, which is the allocation/parsing cost the enumeration
// pays (candidate count multiplied by candidate length) — and is checked
// *before* the next candidate is allocated, so the guard never over-allocates
// the way a post-push count check does. It is a resource ceiling, not a
// statement about how many candidates a payload may legitimately have: a
// 131,072-candidate rel (2^17, the round-19 B1 reproduction) and a
// 131,072-candidate harmless CSS payload enumerate comfortably, because their
// candidates are short. Only a product whose work truly cannot be paid fails,
// and it fails loud by name: beyond the budget the join is unresolvable, so the
// function returns null and every caller reports the named diagnostic — a
// static payload the guard cannot enumerate may ship unread, exactly like an
// unparseable one; it is never silently dropped into the runtime bucket.
export const CARTESIAN_WORK_BUDGET = 20_000_000;
const cartesianStringJoin = (
	sets: ReadonlyArray<ReadonlySet<string>>,
): Set<string> | null => {
	let results = [''];
	let work = 0;
	for (const set of sets) {
		const next = [];
		for (const prefix of results) {
			for (const value of set) {
				const candidateLength = prefix.length + value.length;
				if (work + candidateLength > CARTESIAN_WORK_BUDGET) {
					return null;
				}
				work += candidateLength;
				next.push(prefix + value);
			}
		}
		results = next;
	}
	return new Set(results);
};

// PostCSS failures on arbitrary static payloads carry a terse `reason`; the
// diagnostics name it so a developer can find the offending syntax without a
// stack trace into PostCSS internals.
const cssParseFailureReason = (error: unknown): string => {
	if (typeof error === 'object' && error != null && 'reason' in error) {
		const reason: unknown = error.reason;
		if (typeof reason === 'string') {
			return reason;
		}
	}
	if (typeof error === 'object' && error != null && 'message' in error) {
		const message: unknown = error.message;
		if (typeof message === 'string') {
			return message;
		}
	}
	return String(error);
};

// ---------------------------------------------------------------------------
// CSS identifier canonicalisation. CSS property names are ASCII-case-
// insensitive and may carry escapes (`z-\69ndex` is `z-index`), so property
// comparisons canonicalise instead of matching literal text.
// ---------------------------------------------------------------------------
const CSS_WHITESPACE = /[\t\n\f\r ]/;
const HEX_ESCAPE = /[0-9a-fA-F]/;

const decodeCssIdentifier = (raw: string): string => {
	let out = '';
	for (let i = 0; i < raw.length;) {
		const character = raw[i];
		if (character === '\\') {
			const next = raw[i + 1];
			if (next != null && HEX_ESCAPE.test(next)) {
				let hex = '';
				let k = i + 1;
				while (k < raw.length && HEX_ESCAPE.test(raw[k]) && hex.length < 6) {
					hex += raw[k];
					k += 1;
				}
				if (k < raw.length && CSS_WHITESPACE.test(raw[k])) {
					k += 1;
				}
				out += String.fromCodePoint(Number.parseInt(hex, 16));
				i = k;
			} else if (
				next != null &&
				next !== '\n' &&
				next !== '\r' &&
				next !== '\f'
			) {
				out += next;
				i += 2;
			} else {
				i += 1;
			}
		} else {
			out += character;
			i += 1;
		}
	}
	return out;
};

const canonicaliseCssProperty = (raw: string): string =>
	asciiLowerCase(decodeCssIdentifier(raw));

const isNonStackingKeyword = (value: string): boolean =>
	NON_STACKING_KEYWORDS.has(canonicaliseCssProperty(value.trim()));

const scaleVarReferenceToken = (value: string): string | null => {
	const trimmed = value.trim();
	const openParen = trimmed.indexOf('(');
	if (openParen <= 0 || !trimmed.endsWith(')')) {
		return null;
	}
	const propertyName = decodeCssIdentifier(
		trimmed.slice(openParen + 1, -1).trim(),
	);
	if (
		canonicaliseCssProperty(trimmed.slice(0, openParen)) === 'var' &&
		/^--publy-z-[\w-]+$/.test(propertyName)
	) {
		return propertyName;
	}
	return null;
};

const isScaleVarReference = (value: string): boolean => scaleVarReferenceToken(value) != null;

// First top-level `:` — the property/value separator. `:` inside parentheses,
// brackets, strings, or escapes never counts, so `url(http://…)` and
// attribute-selector values are not split by accident.
const findTopLevelColon = (text: string): number => {
	let depth = 0;
	for (let i = 0; i < text.length; i += 1) {
		const character = text[i];
		if (character === '\\') {
			i += 1;
			continue;
		}
		if (character === '"' || character === "'") {
			const quote = character;
			i += 1;
			while (i < text.length) {
				if (text[i] === '\\') {
					i += 1;
				} else if (text[i] === quote) {
					break;
				}
				i += 1;
			}
			continue;
		}
		if (character === '(' || character === '[') {
			depth += 1;
		} else if (character === ')' || character === ']') {
			depth -= 1;
		} else if (character === ':' && depth === 0) {
			return i;
		}
	}
	return -1;
};

// Tailwind arbitrary-property utilities (`[z-index:5]`) are a raw declaration
// shim: they emit `z-index: <value>` into the compiled stylesheet. The
// property name is canonicalised (`[Z-INDEX:5]` is the same declaration);
// `[-z-index:5]` emits a bogus `-z-index` property and is not a z-index shim.
const isZIndexArbitraryProperty = (utility: string): boolean => {
	if (utility[0] !== '[' || utility[utility.length - 1] !== ']') {
		return false;
	}
	const inner = utility.slice(1, -1);
	const colon = findTopLevelColon(inner);
	if (colon === -1) {
		return false;
	}
	return canonicaliseCssProperty(inner.slice(0, colon).trim()) === 'z-index';
};

const arbitraryPropertyValue = (utility: string): string => {
	const inner = utility.slice(1, -1);
	const colon = findTopLevelColon(inner);
	return inner.slice(colon + 1).trim();
};

const scaleTokenFromUtility = (utility: string): string | null => {
	const directReference = /^z-\((--publy-z-[\w-]+)\)$/.exec(utility);
	if (directReference != null) {
		return directReference[1];
	}
	const bracketReference = /^z-\[--publy-z-([\w-]+)\]$/.exec(utility);
	if (bracketReference != null) {
		return `--publy-z-${bracketReference[1]}`;
	}
	if (isZIndexArbitraryProperty(utility)) {
		return scaleVarReferenceToken(arbitraryPropertyValue(utility));
	}
	if (utility.startsWith('z-[') && utility.endsWith(']')) {
		return scaleVarReferenceToken(utility.slice(3, -1));
	}
	return null;
};

const isAllowedScaleToken = (
	utility: string,
	canonicalScaleTokens: ReadonlySet<string> | null,
): boolean => {
	const token = scaleTokenFromUtility(utility);
	if (token == null) {
		return true;
	}
	return (canonicalScaleTokens ?? DEFAULT_CANONICAL_SCALE_TOKENS).has(token);
};

const isAllowedZIndexUtility = (
	utility: string,
	canonicalScaleTokens: ReadonlySet<string> | null = null,
): boolean => {
	if (isZIndexArbitraryProperty(utility)) {
		// Only a pure scale reference (`var(--publy-z-…)`) or a non-stacking
		// keyword may ship through an arbitrary-property shim. A bare custom
		// property (`[z-index:--publy-z-menu]`) emits invalid CSS and stays raw.
		const value = arbitraryPropertyValue(utility);
		return (
			isNonStackingKeyword(value) ||
			(isScaleVarReference(value) &&
				isAllowedScaleToken(utility, canonicalScaleTokens))
		);
	}
	if (utility === 'z-auto') {
		return true;
	}
	if (
		utility.startsWith('z-[') &&
		utility.endsWith(']') &&
		isNonStackingKeyword(utility.slice(3, -1))
	) {
		return true;
	}
	if (/^z-\(--publy-z-[\w-]+\)$/.test(utility)) {
		return isAllowedScaleToken(utility, canonicalScaleTokens);
	}
	// Arbitrary values are only permitted when they are a pure scale reference
	// (`z-[var(--publy-z-menu)]`, `z-[--publy-z-menu]`). Anything else —
	// including a scale reference carrying a raw fallback such as
	// `z-[var(--publy-z-menu,50)]` — stays raw and is reported.
	if (/^z-\[--publy-z-[\w-]+\]$/.test(utility)) {
		return isAllowedScaleToken(utility, canonicalScaleTokens);
	}
	if (
		utility.startsWith('z-[') &&
		utility.endsWith(']') &&
		isScaleVarReference(utility.slice(3, -1))
	) {
		return isAllowedScaleToken(utility, canonicalScaleTokens);
	}
	return false;
};

// Returns 'allowed' | 'raw' | null (null = not a z-index candidate).
export const classifyZUtility = (
	candidate: string,
	canonicalScaleTokens: ReadonlySet<string> | null = null,
): 'allowed' | 'raw' | null => {
	const utility = splitUtilityPart(candidate);
	if (!isZIndexUtility(utility)) {
		return null;
	}
	return isAllowedZIndexUtility(utility, canonicalScaleTokens)
		? 'allowed'
		: 'raw';
};

// ---------------------------------------------------------------------------
// Source-level suppression. A z-index candidate occurrence is *innocent* when
// it sits in a position that can never become a delivered class. The extractor
// (correctly) scans every token in a file; these ranges narrow it to
// class-delivery positions without re-implementing extraction.
//   - literal types / template literal types (`type Layer = 'z-50'`)
//   - JSX attributes other than className/class (`data-example="z-50"`)
//   - comparison operands (`kind === 'z-50'`)
//   - every quoted string in CSS (attribute selectors, content, url(), …)
// Everything else is a delivery position by default, including plain variable
// initializers — a class string defined in one module and consumed in another
// is exactly the cross-module evasion the withdrawn guard missed.
// ---------------------------------------------------------------------------
const COMPARISON_OPERATORS = new Set([
	ts.SyntaxKind.EqualsEqualsToken,
	ts.SyntaxKind.EqualsEqualsEqualsToken,
	ts.SyntaxKind.ExclamationEqualsToken,
	ts.SyntaxKind.ExclamationEqualsEqualsToken,
	ts.SyntaxKind.LessThanToken,
	ts.SyntaxKind.GreaterThanToken,
	ts.SyntaxKind.LessThanEqualsToken,
	ts.SyntaxKind.GreaterThanEqualsToken,
	ts.SyntaxKind.InKeyword,
]);

const CLASS_ATTRIBUTE_NAMES = new Set(['className', 'class']);

const collectScriptSuppressionRanges = (
	relativePath: string,
	source: string,
): Array<[number, number]> => {
	const ranges: Array<[number, number]> = [];
	const sourceFile = ts.createSourceFile(
		relativePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKindForPath(relativePath),
	);

	const addLiteralRange = (node: TsNode | null | undefined): void => {
		if (
			node != null &&
			(ts.isStringLiteral(node) ||
				ts.isNoSubstitutionTemplateLiteral(node) ||
				ts.isTemplateExpression(node))
		) {
			ranges.push([node.getStart(sourceFile), node.getEnd()]);
		}
	};

	const visit = (node: TsNode): void => {
		if (ts.isLiteralTypeNode(node) || ts.isTemplateLiteralTypeNode(node)) {
			ranges.push([node.getStart(sourceFile), node.getEnd()]);
		} else if (ts.isJsxAttribute(node)) {
			const name =
				node.name.kind === ts.SyntaxKind.Identifier
					? node.name.text
					: node.name.getText(sourceFile);
			if (!CLASS_ATTRIBUTE_NAMES.has(name) && node.initializer != null) {
				if (ts.isStringLiteral(node.initializer)) {
					ranges.push([
						node.initializer.getStart(sourceFile),
						node.initializer.getEnd(),
					]);
				} else if (ts.isJsxExpression(node.initializer)) {
					addLiteralRange(node.initializer.expression);
				}
			}
		} else if (ts.isBinaryExpression(node)) {
			if (COMPARISON_OPERATORS.has(node.operatorToken.kind)) {
				addLiteralRange(node.left);
				if (node.operatorToken.kind !== ts.SyntaxKind.InKeyword) {
					addLiteralRange(node.right);
				}
			}
		}
		node.forEachChild(visit);
	};

	visit(sourceFile);
	ranges.sort((a, b) => a[0] - b[0]);
	return ranges;
};

const CSS_STRING_PATTERN = /(["'])(?:\\.|(?!\1)[^\\])*\1/g;
const collectCssSuppressionRanges = (
	source: string,
): Array<[number, number]> => {
	const ranges: Array<[number, number]> = [];
	let match;
	while ((match = CSS_STRING_PATTERN.exec(source))) {
		ranges.push([match.index, match.index + match[0].length]);
	}
	return ranges;
};

const isInsideAnyRange = (
	position: number,
	ranges: ReadonlyArray<readonly [number, number]>,
): boolean => {
	for (const [start, end] of ranges) {
		if (position >= start && position < end) {
			return true;
		}
	}
	return false;
};

const lineForOffset = (source: string, offset: number): number =>
	source.slice(0, offset).split('\n').length;

// ---------------------------------------------------------------------------
// Component 3 pattern. A class-delivery template literal assembles a z-index
// utility across a `${…}` boundary when one of its static literal parts ends,
// at a token boundary, in a `z-`, `z-[` or `z-(` prefix — the substitution
// then supplies the value part (`z-${level}`, `z-[${value}]`, `-z-${value}`).
// A `-` immediately before `z` is *not* a boundary, so a custom class like
// `` `foo-z-${x}` `` stays clean while the negative `-z-` form is caught.
// ---------------------------------------------------------------------------
const DANGEROUS_TEMPLATE_PART_PATTERN = /(?:^|[\s:]|!)-?z-(?:\[|\(|$)/;

// ---------------------------------------------------------------------------
// Components 1–3 — source-level scans over one file.
// ---------------------------------------------------------------------------
export const scanZIndexFile = ({
	scanner,
	relativePath,
	content,
	// Optional production candidate set (disk-mode `scanner.scan()`, which is
	// what the real build consumes). Content-mode extraction is a superset of
	// disk-mode for CSS files, so when the set is provided a candidate is only
	// reported if production would actually recognise it.
	productionCandidates = null,
	canonicalScaleTokens = null,
	checkBuildReachableScript = true,
	checkClassDelivery = true,
	// Raw-sink provenance: `baseDir` roots specifier resolution,
	// `rawTextPaths` is the build's recorded set of `?raw` module paths (the
	// pending classification), `rawTextIds` is the build's recorded set of
	// full `?raw` module IDs — path plus query — and is the source of truth
	// when present (round-19 I1: a `?url` ID for a file that is also
	// `?raw`-imported is a distinct module and provably not raw text),
	// `queriedPaths` is the recorded set of every query-carrying module's
	// file (so a queried specifier the guard cannot map to any record fails
	// loud by name instead of going quiet, while a queried file the build
	// recorded under a non-raw query stays quiet), and `rawImportTexts` maps
	// each recorded path to its bytes. With all present, a `?raw` import
	// binding consumed by a style-capable sink (a `<style>` element or a
	// dangerouslySetInnerHTML payload) is walked as shipped CSS/HTML; without
	// them the walk is skipped, which keeps unit fixtures free of raw-file
	// scaffolding.
	baseDir = null,
	rawImportTexts = null,
	rawTextPaths = null,
	rawTextIds = null,
	queriedPaths = null,
}: {
	scanner: ZIndexCandidateScanner;
	relativePath: string;
	content: string;
	productionCandidates?: ReadonlySet<string> | null;
	canonicalScaleTokens?: ReadonlySet<string> | null;
	checkBuildReachableScript?: boolean;
	checkClassDelivery?: boolean;
	baseDir?: string | null;
	rawImportTexts?: ReadonlyMap<string, string> | null;
	rawTextPaths?: ReadonlySet<string> | null;
	rawTextIds?: ReadonlySet<string> | null;
	queriedPaths?: ReadonlySet<string> | null;
}): ZIndexViolation[] => {
	const violations: ZIndexViolation[] = [];
	const extension = path.extname(relativePath);
	const deCommented = stripComments(content);
	let suppressionRanges: Array<[number, number]> = [];
	if (extension === '.css') {
		suppressionRanges = collectCssSuppressionRanges(content);
	} else if (SCRIPT_EXTENSIONS.has(extension)) {
		suppressionRanges = collectScriptSuppressionRanges(relativePath, content);
	}

	const withPositions = scanner.getCandidatesWithPositions({
		file: relativePath,
		content: deCommented,
		extension: extension.replace(/^\./, ''),
	});
	for (const { candidate, position } of checkClassDelivery
		? withPositions
		: []) {
		if (classifyZUtility(candidate, canonicalScaleTokens) !== 'raw') {
			continue;
		}
		// Content-mode extraction (`getCandidatesWithPositions`) is a superset
		// of the disk-mode `scanner.scan()` result the production compiler
		// actually recognises. The membership filter drops candidates the
		// production build would never emit, so the pass reports only real
		// shipped rules. Removing it only makes the guard *stricter* (more
		// false positives), never green on a shipped raw value — it exists to
		// keep the guard honest, not to widen the door.
		if (productionCandidates != null && !productionCandidates.has(candidate)) {
			continue;
		}
		if (isInsideAnyRange(position, suppressionRanges)) {
			continue;
		}
		violations.push({
			ruleId: 'z-index-utility-not-on-scale',
			message:
				`raw z-index utility \`${candidate}\` does not route through the ` +
				'`--publy-z-*` scale — use `z-(--publy-z-…)` (add a tier to ' +
				':root in src/styles/app.css if no existing tier fits).',
			file: relativePath,
			line: lineForOffset(deCommented, position),
			source: candidate,
		});
	}

	if (extension === '.css' && checkClassDelivery) {
		// Component 2 — the extractor drops the `;`-terminated last token of an
		// `@apply` directive, so the directive text is scanned directly.
		const applyPattern = /@apply\b([^;]*)/g;
		let applyMatch;
		while ((applyMatch = applyPattern.exec(deCommented))) {
			const directive = applyMatch[1];
			const offset =
				applyMatch.index +
				deCommented
					.slice(applyMatch.index, applyMatch.index + applyMatch[0].length)
					.indexOf(directive);
			for (const token of directive.split(/\s+/).filter(Boolean)) {
				if (classifyZUtility(token, canonicalScaleTokens) !== 'raw') {
					continue;
				}
				violations.push({
					ruleId: 'z-index-utility-not-on-scale',
					message:
						`raw z-index utility \`${token}\` in @apply does not route through ` +
						'the `--publy-z-*` scale.',
					file: relativePath,
					line: lineForOffset(deCommented, offset),
					source: `@apply ${directive.trim()}`,
				});
			}
		}
	}

	if (SCRIPT_EXTENSIONS.has(extension)) {
		// Component 3 — substitution-boundary z-index assembly.
		const sourceFile = ts.createSourceFile(
			relativePath,
			content,
			ts.ScriptTarget.Latest,
			true,
			scriptKindForPath(relativePath),
		);
		const visitTemplates = (node: TsNode): void => {
			if (ts.isTemplateExpression(node)) {
				const start = node.getStart(sourceFile);
				if (!isInsideAnyRange(start, suppressionRanges)) {
					const literalParts = [
						node.head.text,
						...node.templateSpans.map((span) => span.literal.text),
					];
					if (
						literalParts.some((part) =>
							DANGEROUS_TEMPLATE_PART_PATTERN.test(part.trimEnd()),
						)
					) {
						violations.push({
							ruleId: 'z-index-utility-not-on-scale',
							message:
								'dynamically assembles a z-index utility across a template ' +
								'substitution (`z-${…}`) — use the static ' +
								'`z-(--publy-z-…)` scale instead.',
							file: relativePath,
							line: lineForOffset(content, start),
							source: node.getText(sourceFile),
						});
					}
				}
			}
			node.forEachChild(visitTemplates);
		};
		if (checkClassDelivery) {
			visitTemplates(sourceFile);
		}

		const unwrapTransparentExpression = (
			node: TsNode | null | undefined,
		): TsNode | null => {
			let expression: TsNode | null | undefined = node;
			while (
				expression != null &&
				(ts.isParenthesizedExpression(expression) ||
					ts.isAsExpression(expression) ||
					ts.isTypeAssertionExpression(expression) ||
					ts.isNonNullExpression(expression) ||
					ts.isSatisfiesExpression(expression))
			) {
				expression = expression.expression;
			}
			return expression ?? null;
		};
		const literalText = (node: TsNode | null | undefined): string | null => {
			const expression = unwrapTransparentExpression(node);
			if (expression == null) {
				return null;
			}
			if (
				ts.isStringLiteral(expression) ||
				ts.isNoSubstitutionTemplateLiteral(expression)
			) {
				return expression.text;
			}
			return null;
		};
		// Every module-scope `const` with an identifier name and an initializer.
		// The initializer node is kept so the same one-hop constant following
		// serves the string rules (a `const` bound to a string literal), the
		// object rules (a `const` bound to an object literal is a transparent
		// spread source), and the `?raw` binding rules (a `const` bound to a
		// raw import is the same binding).
		const moduleConstInitializers = new Map<
			string,
			{ declaration: ts.VariableDeclaration; initializer: ts.Expression }
		>();
		for (const statement of sourceFile.statements) {
			if (
				!ts.isVariableStatement(statement) ||
				(statement.declarationList.flags & ts.NodeFlags.Const) === 0
			) {
				continue;
			}
			for (const declaration of statement.declarationList.declarations) {
				if (!ts.isIdentifier(declaration.name)) {
					continue;
				}
				if (declaration.initializer != null) {
					moduleConstInitializers.set(declaration.name.text, {
						declaration,
						initializer: declaration.initializer,
					});
				}
			}
		}
		const bindingNameIncludes = (
			bindingName:
				| ts.Identifier
				| ts.ObjectBindingPattern
				| ts.ArrayBindingPattern,
			name: string,
		): boolean => {
			if (ts.isIdentifier(bindingName)) {
				return bindingName.text === name;
			}
			for (const element of bindingName.elements) {
				if (
					ts.isBindingElement(element) &&
					bindingNameIncludes(element.name, name)
				) {
					return true;
				}
			}
			return false;
		};
		const variableBindingIn = (
			declarationList: ts.VariableDeclarationList,
			name: string,
		): ts.VariableDeclaration | null =>
			declarationList.declarations.find((declaration) =>
				bindingNameIncludes(declaration.name, name),
			) ?? null;
		const statementBinding = (
			statement: ts.Statement,
			name: string,
		): ScriptBindingDeclaration | null => {
			if (ts.isVariableStatement(statement)) {
				return variableBindingIn(statement.declarationList, name);
			}
			if (
				(ts.isFunctionDeclaration(statement) ||
					ts.isClassDeclaration(statement) ||
					ts.isEnumDeclaration(statement)) &&
				statement.name?.text === name
			) {
				return statement;
			}
			if (!ts.isImportDeclaration(statement)) {
				return null;
			}
			const importClause = statement.importClause;
			if (importClause?.name?.text === name) {
				return importClause;
			}
			const bindings = importClause?.namedBindings;
			if (bindings != null && ts.isNamespaceImport(bindings)) {
				return bindings.name.text === name ? bindings : null;
			}
			if (bindings != null && ts.isNamedImports(bindings)) {
				return (
					bindings.elements.find((element) => element.name.text === name) ??
					null
				);
			}
			return null;
		};
		const hoistedVarBinding = (
			scope: TsNode,
			name: string,
		): ts.VariableDeclaration | null => {
			let binding: ts.VariableDeclaration | null = null;
			const visit = (node: TsNode): void => {
				if (
					binding != null ||
					(node !== scope.body &&
						(ts.isFunctionLike(node) || ts.isClassLike(node)))
				) {
					return;
				}
				if (
					ts.isVariableDeclarationList(node) &&
					(node.flags & ts.NodeFlags.BlockScoped) === 0
				) {
					binding = variableBindingIn(node, name);
					if (binding != null) {
						return;
					}
				}
				node.forEachChild(visit);
			};
			if (scope.body != null) {
				visit(scope.body);
			}
			return binding;
		};
		const bindingInScope = (
			scope: TsNode,
			name: string,
		): ScriptBindingDeclaration | null => {
			if (
				ts.isSourceFile(scope) ||
				ts.isBlock(scope) ||
				ts.isModuleBlock(scope)
			) {
				for (const statement of scope.statements) {
					const binding = statementBinding(statement, name);
					if (binding != null) {
						return binding;
					}
				}
			}
			if (isFunctionLikeDeclaration(scope)) {
				for (const parameter of scope.parameters) {
					if (bindingNameIncludes(parameter.name, name)) {
						return parameter;
					}
				}
				if (
					(ts.isFunctionExpression(scope) || ts.isFunctionDeclaration(scope)) &&
					scope.name?.text === name
				) {
					return scope;
				}
				const varBinding = hoistedVarBinding(scope, name);
				if (varBinding != null) {
					return varBinding;
				}
			}
			if (ts.isCaseBlock(scope)) {
				for (const clause of scope.clauses) {
					for (const statement of clause.statements) {
						const binding = statementBinding(statement, name);
						if (binding != null) {
							return binding;
						}
					}
				}
			}
			if (
				ts.isCatchClause(scope) &&
				scope.variableDeclaration != null &&
				bindingNameIncludes(scope.variableDeclaration.name, name)
			) {
				return scope.variableDeclaration;
			}
			if (
				(ts.isForStatement(scope) ||
					ts.isForInStatement(scope) ||
					ts.isForOfStatement(scope)) &&
				scope.initializer != null &&
				ts.isVariableDeclarationList(scope.initializer)
			) {
				return variableBindingIn(scope.initializer, name);
			}
			return null;
		};
		const nearestBinding = (
			node: TsNode,
			name: string,
		): ScriptBindingDeclaration | null => {
			let scope: TsNode | null | undefined = node.parent;
			while (scope != null) {
				const binding = bindingInScope(scope, name);
				if (binding != null) {
					return binding;
				}
				scope = scope.parent;
			}
			return null;
		};
		// Every module-scope const resolution follows the alias chain to a
		// fixpoint: `const a = b; const b = c; …` resolves to the final
		// initializer, cycle-guarded (a cycle is opaque, not an infinite
		// loop), with the shadowing check reapplied at every hop. A bound of
		// one hop is exactly the "I stopped looking" defect round 13 exists
		// to remove — the language allows unbounded alias chains, so the
		// resolver does not bound them.
		const resolveModuleConstFixpoint = (
			node: TsNode | null | undefined,
			visitedConsts: ReadonlySet<string> = new Set(),
		): TsNode | null => {
			const expression = unwrapTransparentExpression(node);
			if (expression == null) {
				return null;
			}
			if (!ts.isIdentifier(expression)) {
				return expression;
			}
			if (visitedConsts.has(expression.text)) {
				return null;
			}
			const moduleConstant = moduleConstInitializers.get(expression.text);
			if (moduleConstant == null) {
				return null;
			}
			if (
				nearestBinding(expression, expression.text) !==
				moduleConstant.declaration
			) {
				return null;
			}
			const next = new Set(visitedConsts);
			next.add(expression.text);
			return resolveModuleConstFixpoint(moduleConstant.initializer, next);
		};
		// Resolves a chain of property/element accesses rooted in module-scope
		// consts to the value node it provably reads: `a.b.c` where `a` is a
		// const object literal resolves through member `b` to the node `c`
		// reads. Returns `{ node, overflow }`: `node` null when any hop is
		// unprovable (absent member, opaque spread, non-const root), and
		// `overflow` true when an element-access key is provably static text
		// whose candidate space is too large to enumerate (round-21 B1) — the
		// member identity is unresolvable, so the consumer must not treat the
		// read as a benign runtime value, and callers that reach a CSS sink
		// fail loud by name.
		const resolveMemberChain = (
			node: TsNode,
			visitedConsts: ReadonlySet<string> = new Set(),
		): MemberChainResult => {
			const unwrapped = unwrapTransparentExpression(node);
			if (unwrapped == null) {
				return { node: null, overflow: false };
			}
			if (ts.isPropertyAccessExpression(unwrapped)) {
				const ownerResult = resolveMemberChain(
					unwrapped.expression,
					visitedConsts,
				);
				if (ownerResult.overflow) {
					return { node: null, overflow: true };
				}
				if (
					ownerResult.node == null ||
					!ts.isObjectLiteralExpression(ownerResult.node)
				) {
					return { node: null, overflow: false };
				}
				return {
					node: staticObjectMemberNode(ownerResult.node, unwrapped.name.text)
						.node,
					overflow: false,
				};
			}
			if (ts.isElementAccessExpression(unwrapped)) {
				// All three outcomes are named (round-23 B1): a resolved key
				// reads the member; an overflowing key is UNRESOLVED — the
				// member cannot be ruled out — and stays loud; a provably
				// runtime key resolves no member, exactly as #987's runtime
				// bucket declares.
				return staticString(
					unwrapped.argumentExpression,
					(value) => {
						const ownerResult = resolveMemberChain(
							unwrapped.expression,
							visitedConsts,
						);
						if (ownerResult.overflow) {
							return { node: null, overflow: true };
						}
						if (
							ownerResult.node == null ||
							!ts.isObjectLiteralExpression(ownerResult.node)
						) {
							return { node: null, overflow: false };
						}
						return {
							node: staticObjectMemberNode(ownerResult.node, value).node,
							overflow: false,
						};
					},
					() => ({ node: null, overflow: true }),
					() => ({ node: null, overflow: false }),
				);
			}
			return {
				node: resolveModuleConstFixpoint(unwrapped, visitedConsts),
				overflow: false,
			};
		};
		// `String(x)` preserves the imported bytes exactly; only the unshadowed
		// global spelling counts (a locally shadowed `String` is not a
		// coercion the guard can reason about).
		const isStringCoercion = (expression: TsNode): boolean => {
			if (
				!ts.isCallExpression(expression) ||
				expression.arguments.length !== 1
			) {
				return false;
			}
			const callee = unwrapTransparentExpression(expression.expression);
			return isDirectGlobalString(callee);
		};
		// Static evaluation of the transparent expression family to the set of
		// strings the expression can provably be: literals, const alias chains
		// (fixpoint), both branches of a conditional, `String(...)`, raw-text
		// `String.raw` templates, member reads through const object literals,
		// template literals whose every substitution is static (the product of
		// their candidate sets), and `+` where both operands are static (the
		// product of concatenations).
		// Returns `{ values, partial, overflow }`: `values` is the candidate
		// set, `partial` says the set contains provable *substrings* of the
		// expression's possible values (the static operand of a one-sided
		// `+`) rather than complete values, and `overflow` says the candidates
		// are too numerous to enumerate (the Cartesian product cap) — the
		// payload is provably static text the guard cannot inspect, so the
		// caller fails loud by name instead of dropping it in the runtime
		// bucket. The style-payload walk scans partial sets — the static
		// operand's text ships either way — but an identity consumer
		// (`staticString`: an element-access key, a computed property name)
		// must reject them: reading member `a` because `'a' + rt` provably
		// starts with `'a'` is reading a member the code may never read
		// (round-15 B1). A branch that is not statically string-valued makes
		// the expression partially static: the provably-shipped strings of
		// the static branches still ship, so they are returned, and the
		// caller treats the expression as runtime for everything else (the
		// raw-sink walk covers recorded `?raw` bindings). Returns null when
		// no string provably ships.
		const staticStringValues = (
			node: TsNode,
			visitedConsts: ReadonlySet<string> = new Set(),
		): StaticStringValuesResult | null => {
			const expression = unwrapTransparentExpression(node);
			if (expression == null) {
				return null;
			}
			if (
				ts.isStringLiteral(expression) ||
				ts.isNoSubstitutionTemplateLiteral(expression)
			) {
				return { values: new Set([expression.text]), partial: false };
			}
			if (ts.isIdentifier(expression)) {
				const fixpoint = resolveModuleConstFixpoint(expression, visitedConsts);
				return fixpoint == null
					? null
					: staticStringValues(fixpoint, visitedConsts);
			}
			if (ts.isConditionalExpression(expression)) {
				const whenTrue = staticStringValues(expression.whenTrue, visitedConsts);
				const whenFalse = staticStringValues(
					expression.whenFalse,
					visitedConsts,
				);
				if (whenTrue == null && whenFalse == null) {
					return null;
				}
				// Overflow is monotone through every combinator (round-16 B2):
				// an overflowing branch makes the whole conditional
				// unenumerable — the sibling's compliant value must never
				// replace the overflowing branch as the complete answer, so
				// the caller fails loud by name instead.
				if (whenTrue?.overflow || whenFalse?.overflow) {
					return { values: null, partial: false, overflow: true };
				}
				// A runtime branch (a branch that is not statically string-valued)
				// makes the conditional a *partial* set, exactly like the static
				// operand of a one-sided `+`: the static branch's candidates
				// still ship, so they are returned, but the complete value is
				// unprovable — `styles[flag ? 'safe' : runtimeKey]` must never
				// read member `safe` as if the runtime branch did not exist
				// (review B1). The style-payload walk scans the returned
				// candidates; identity consumers reject the partial set.
				return {
					values: new Set([
						...(whenTrue?.values ?? []),
						...(whenFalse?.values ?? []),
					]),
					partial:
						whenTrue == null ||
						whenFalse == null ||
						(whenTrue?.partial ?? false) ||
						(whenFalse?.partial ?? false),
				};
			}
			if (isStringCoercion(expression)) {
				return staticStringValues(expression.arguments[0], visitedConsts);
			}
			if (
				ts.isTaggedTemplateExpression(expression) &&
				isStringRawTag(expression.tag)
			) {
				return staticStringRawTemplateValues(
					expression.template,
					visitedConsts,
				);
			}
			if (ts.isTemplateExpression(expression)) {
				let sets = [new Set([expression.head.text])];
				let partial = false;
				for (const span of expression.templateSpans) {
					const substitution = staticStringValues(
						span.expression,
						visitedConsts,
					);
					if (substitution == null) {
						return null;
					}
					if (substitution.overflow) {
						return { values: null, partial: false, overflow: true };
					}
					sets.push(substitution.values);
					partial = partial || substitution.partial;
					sets.push(new Set([span.literal.text]));
				}
				const joined = cartesianStringJoin(sets);
				if (joined == null) {
					return { values: null, partial: false, overflow: true };
				}
				return { values: joined, partial };
			}
			if (
				ts.isPropertyAccessExpression(expression) ||
				ts.isElementAccessExpression(expression)
			) {
				const memberResult = resolveMemberChain(expression, visitedConsts);
				// Overflow is monotone through a member read (round-21 B1): an
				// element-access key whose candidate space is unenumerable
				// makes the read unresolvable, so the enclosing payload must
				// stay loud by name — the sibling's value must never replace
				// the overflowing branch as the complete answer.
				if (memberResult.overflow) {
					return { values: null, partial: false, overflow: true };
				}
				return memberResult.node == null
					? null
					: staticStringValues(memberResult.node, visitedConsts);
			}
			if (
				ts.isBinaryExpression(expression) &&
				expression.operatorToken.kind === ts.SyntaxKind.PlusToken
			) {
				const left = staticStringValues(expression.left, visitedConsts);
				const right = staticStringValues(expression.right, visitedConsts);
				// Overflow is monotone through the `+` combinator too: an
				// overflowing operand makes the concatenation unenumerable.
				if (left?.overflow || right?.overflow) {
					return { values: null, partial: false, overflow: true };
				}
				if (left != null && right != null) {
					const joined = cartesianStringJoin([left.values, right.values]);
					if (joined == null) {
						return { values: null, partial: false, overflow: true };
					}
					return {
						values: joined,
						partial: left.partial || right.partial,
					};
				}
				// One static operand: its text always ships as a substring of
				// the concatenation (`'{z-index: 9}' + runtime` ships the
				// literal part), so its candidates are returned — as a
				// *partial* set, since the operand is a substring, not the
				// complete value. The runtime operand stays in the declared
				// runtime bucket.
				if (left != null) {
					return { values: left.values, partial: true };
				}
				if (right != null) {
					return { values: right.values, partial: true };
				}
				return null;
			}
			return null;
		};
		const staticStringRawTemplateValues = (
			template: TsNode,
			visitedConsts: ReadonlySet<string> = new Set(),
		): StaticStringValuesResult => {
			if (ts.isNoSubstitutionTemplateLiteral(template)) {
				return { values: new Set([template.rawText]), partial: false };
			}
			let sets = [new Set([template.head.rawText])];
			let partial = false;
			for (const span of template.templateSpans) {
				const substitution = staticStringValues(span.expression, visitedConsts);
				if (substitution == null) {
					return null;
				}
				if (substitution.overflow) {
					return { values: null, partial: false, overflow: true };
				}
				sets.push(substitution.values);
				partial = partial || substitution.partial;
				sets.push(new Set([span.literal.rawText]));
			}
			const joined = cartesianStringJoin(sets);
			if (joined == null) {
				return { values: null, partial: false, overflow: true };
			}
			return { values: joined, partial };
		};
		// A single-value projection of the family: used where exactly one
		// static string is required (computed property names, `?raw` element
		// keys). Returns a discriminated result so every caller can tell the
		// three outcomes apart (round-21 B1): `kind: 'value'` is a resolved
		// singleton, `kind: 'not-static'` is provably not a single static
		// string (a runtime value, a multi-candidate set, or a provable
		// substring), and `kind: 'overflow'` is UNRESOLVED — a statically
		// string-valued expression whose candidate space is too large to
		// enumerate. The pre-fix single `null` conflated the last two, so an
		// overflowing element-access key read as "runtime value, not our
		// business" and the enclosing CSS-sink consumer printed OK. Overflow
		// is never survivable by a caller that reaches a CSS sink: it must
		// report by name, exactly like an unparseable payload.
		//
		// This projection is PRIVATE: the only permitted caller is the
		// `staticString` funnel below. The mechanical test enumerates every
		// call site of this function in the guard script and fails when a new
		// consumption bypasses the funnel (round-23 B1 — a hand-written audit
		// of the consumers failed once on this exact property).
		const staticStringRaw = (node: TsNode): StaticStringOutcome => {
			const result = staticStringValues(node);
			if (result == null) {
				return { kind: 'not-static' };
			}
			if (result.overflow) {
				return { kind: 'overflow' };
			}
			if (result.partial || result.values.size !== 1) {
				return { kind: 'not-static' };
			}
			return { kind: 'value', value: [...result.values][0] };
		};
		// One funnel for every `staticString()` consumption (round-23 B1).
		// The raw projection answers a three-valued question, and every
		// consumer must declare what all three outcomes mean for its own rule
		// by passing handlers — `onValue(value)`, `onOverflow()`, and
		// `onNotStatic()`. There is no default: omitting a handler throws, so
		// an UNRESOLVED outcome can never be silently coerced into a benign
		// `null` by a `?? null` or a truthiness-guarded `.value` read at a
		// future call site. The mechanical test verifies that every call site
		// names all three outcomes.
		const staticString = <R>(
			node: TsNode,
			onValue: (value: string) => R,
			onOverflow: () => R,
			onNotStatic: () => R,
		): R => {
			if (
				typeof onValue !== 'function' ||
				typeof onOverflow !== 'function' ||
				typeof onNotStatic !== 'function'
			) {
				throw new Error(
					'staticString requires handlers for all three outcomes: ' +
						'resolved value, UNRESOLVED overflow, and provably-not-static.',
				);
			}
			const kind = staticStringRaw(node);
			if (kind.kind === 'value') {
				return onValue(kind.value);
			}
			if (kind.kind === 'overflow') {
				return onOverflow();
			}
			return onNotStatic();
		};
		const propertyName = (name: TsNode): string | null => {
			if (ts.isComputedPropertyName(name)) {
				// A computed key goes through the funnel with all three
				// outcomes named (round-23 B1). An unnameable key (overflow
				// or runtime) reads as no name here, but it is not a silent
				// drop: the occurrence-level object walk separately flags an
				// overflowing computed key (`overflowKeys`) at every position
				// that may carry the requested member name, and style-capable
				// callers turn that into the named diagnostic.
				return staticString(
					name.expression,
					(value) => value,
					() => null,
					() => null,
				);
			}
			if (ts.isIdentifier(name)) {
				return name.text;
			}
			return literalText(name);
		};
		const spreadSourceObjectLiteral = (
			expression: TsNode,
		): ts.ObjectLiteralExpression | null => {
			// Resolves a spread source to the object literal it provably is: a
			// literal (through transparent wrappers) or a module-scope `const`
			// chain bound to one, followed to a cycle-guarded fixpoint — the
			// two-hop const-object alias is the same static payload as the
			// literal, at any depth. Returns null when the fixpoint is
			// genuinely not a static object — a parameter, an import, a call,
			// a cycle — and the caller must fail loud by name instead of
			// assuming compliant.
			const fixpoint = resolveModuleConstFixpoint(expression);
			return fixpoint != null && ts.isObjectLiteralExpression(fixpoint)
				? fixpoint
				: null;
		};
		const staticObjectMemberNode = (
			object: ts.ObjectLiteralExpression,
			name: string,
			visitedObjects: ReadonlySet<ts.ObjectLiteralExpression> = new Set(),
		): StaticObjectMemberResult => {
			// Order-aware member resolution mirroring real object semantics:
			// the last member with the name wins, and a static object-literal
			// spread is transparent (its member is hoisted in place). A spread
			// whose source resolves to a module-scope const object literal —
			// through any alias chain, to a cycle-guarded fixpoint — is
			// equally transparent. A genuinely opaque spread (`{...props}` from
			// a parameter, import, or call) is the declared data-flow boundary:
			// it may carry the name, so it invalidates any fact established
			// before it, and a later explicit member (or static spread carrying
			// the member) may establish the value again — but the resolved
			// value is then only provable when the opaque spread does not sit
			// after the last establishing occurrence, and `unresolved` says
			// whether it does. `opaqueOnly` says an opaque spread exists with
			// no establishing occurrence at all: the member's final value is
			// unprovable either way. Callers turn `unresolved`/`opaqueOnly`
			// into the named `z-index-unresolved-spread-shadow` diagnostic at
			// positions they can prove style-capable instead of treating the
			// spread as a compliant default; positions that are not provably
			// style-capable (an ordinary object literal) keep the fact-based
			// rule so `<div {...props}>`-shaped runtime data stays green.
			// `visitedObjects` is the cycle guard for object-literal spread
			// cycles (`const a = {...b}; const b = {...a};`): the same object
			// literal re-entered up the resolution stack is opaque, never an
			// infinite loop.
			if (visitedObjects.has(object)) {
				return {
					node: null,
					unresolved: false,
					opaqueOnly: true,
					opaqueSpreadNode: null,
					overflowKeys: false,
				};
			}
			const nextVisitedObjects = new Set(visitedObjects);
			nextVisitedObjects.add(object);
			let foundNode: TsNode | null = null;
			let lastOccurrenceIndex = -1;
			let lastOpaqueSpreadIndex = -1;
			let opaqueSpreadNode: TsNode | null = null;
			let overflowKeys = false;
			for (let index = 0; index < object.properties.length; index += 1) {
				const candidate = object.properties[index];
				let valueNode: TsNode | null = null;
				if (ts.isPropertyAssignment(candidate)) {
					if (ts.isComputedPropertyName(candidate.name)) {
						// An overflowing computed key (round-21 B1) is an
						// occurrence that may carry the requested name: the
						// member identity is unresolvable, so it shadows
						// static facts exactly like an opaque spread, and
						// `overflowKeys` lets a style-capable caller name the
						// unresolvable input precisely. The funnel names all
						// three outcomes (round-23 B1); only overflow shadows
						// the occurrence — a provably runtime key cannot
						// establish a member here, and a resolved key is
						// matched by the `propertyName` check below.
						staticString(
							candidate.name.expression,
							() => {},
							() => {
								overflowKeys = true;
								lastOpaqueSpreadIndex = index;
								opaqueSpreadNode = candidate;
							},
							() => {},
						);
					}
					if (propertyName(candidate.name) === name) {
						valueNode = candidate.initializer;
						lastOccurrenceIndex = index;
					}
				} else if (ts.isShorthandPropertyAssignment(candidate)) {
					if (candidate.name.text === name) {
						valueNode = candidate.name;
						lastOccurrenceIndex = index;
					}
				} else if (ts.isSpreadAssignment(candidate)) {
					const spreadObject = spreadSourceObjectLiteral(candidate.expression);
					if (spreadObject == null) {
						lastOpaqueSpreadIndex = index;
						opaqueSpreadNode = candidate;
					} else {
						const nested = staticObjectMemberNode(
							spreadObject,
							name,
							nextVisitedObjects,
						);
						if (nested.overflowKeys) {
							overflowKeys = true;
						}
						if (nested.node != null) {
							valueNode = nested.node;
							lastOccurrenceIndex = index;
							if (nested.unresolved || nested.opaqueOnly) {
								lastOpaqueSpreadIndex = index;
								opaqueSpreadNode = candidate;
							}
						} else if (nested.unresolved || nested.opaqueOnly) {
							lastOpaqueSpreadIndex = index;
							opaqueSpreadNode = candidate;
						}
					}
				}
				if (valueNode != null) {
					foundNode = valueNode;
				}
			}
			return {
				node: foundNode,
				unresolved:
					lastOpaqueSpreadIndex >= 0 &&
					lastOccurrenceIndex >= 0 &&
					lastOpaqueSpreadIndex >= lastOccurrenceIndex,
				opaqueOnly: lastOpaqueSpreadIndex >= 0 && lastOccurrenceIndex < 0,
				opaqueSpreadNode,
				overflowKeys,
			};
		};
		const staticObjectProperty = (
			object: ts.ObjectLiteralExpression,
			name: string,
		): StaticObjectMemberResult => {
			const member = staticObjectMemberNode(object, name);
			return {
				node: member.node,
				unresolved: member.unresolved,
				opaqueOnly: member.opaqueOnly,
				opaqueSpreadNode: member.opaqueSpreadNode,
				overflowKeys: member.overflowKeys,
			};
		};
		// The shared source-ordered reader for a JSX attribute list: the last
		// occurrence wins — an explicit attribute, a static object-literal
		// spread (`{...{rel: 'stylesheet'}}`, whose source may be a
		// module-scope const object literal through any alias chain), or a
		// later explicit re-establishment. A genuinely opaque spread may
		// carry the attribute, so it shadows static facts established before
		// it exactly as a later override would (round-16 I1): `unresolved`
		// says an opaque spread sits after the last establishing occurrence,
		// in which case the final value is not provable and the caller must
		// fail loud by name; `opaqueOnly` says an opaque spread exists with
		// no establishing occurrence at all, which the reader reports and the
		// caller dismisses only when the position is not provably
		// style-capable. Every JSX attribute reader goes through this one
		// walker, so the readers cannot disagree about spreads.
		const lastJsxAttributeValueNode = (
			attributes: ts.JsxAttributes,
			attributeName: string,
		): LastJsxAttributeOccurrence => {
			let valueNode: TsNode | null = null;
			let lastOccurrenceIndex = -1;
			let lastOpaqueSpreadIndex = -1;
			let opaqueSpreadNode: TsNode | null = null;
			let overflowKeys = false;
			for (let index = 0; index < attributes.properties.length; index += 1) {
				const property = attributes.properties[index];
				if (ts.isJsxAttribute(property)) {
					if (
						property.name.kind !== ts.SyntaxKind.Identifier ||
						property.name.text !== attributeName
					) {
						continue;
					}
					// A bare attribute (`rel` with no initializer) is React's
					// `rel={true}`: an establishing occurrence that carries no
					// string, so the value stays unprovable either way.
					if (property.initializer == null) {
						valueNode = null;
					} else if (ts.isJsxExpression(property.initializer)) {
						valueNode = property.initializer.expression;
					} else {
						valueNode = property.initializer;
					}
					lastOccurrenceIndex = index;
				} else if (ts.isJsxSpreadAttribute(property)) {
					const spreadObject = spreadSourceObjectLiteral(property.expression);
					if (spreadObject == null) {
						lastOpaqueSpreadIndex = index;
						opaqueSpreadNode = property;
						continue;
					}
					const member = staticObjectMemberNode(spreadObject, attributeName);
					if (member.node != null) {
						valueNode = member.node;
						lastOccurrenceIndex = index;
					}
					if (member.overflowKeys) {
						overflowKeys = true;
					}
					if (member.unresolved || member.opaqueOnly) {
						lastOpaqueSpreadIndex = index;
						opaqueSpreadNode = property;
					}
				}
			}
			const unresolved =
				lastOpaqueSpreadIndex >= 0 &&
				lastOccurrenceIndex >= 0 &&
				lastOpaqueSpreadIndex >= lastOccurrenceIndex;
			return {
				valueNode,
				// A bare attribute (`rel` with no initializer) is React's
				// `rel={true}`: an establishing occurrence that carries no
				// string — `established` distinguishes it from no occurrence
				// at all for readers that care about presence.
				established: lastOccurrenceIndex >= 0,
				unresolved,
				opaqueOnly: lastOpaqueSpreadIndex >= 0 && lastOccurrenceIndex < 0,
				opaqueSpreadNode,
				overflowKeys,
			};
		};
		const staticJsxAttributeValues = (
			attributes: ts.JsxAttributes,
			attributeName: string,
		): {
			values: ReadonlySet<string> | null;
			overflow: boolean;
			unresolved: boolean;
			opaqueOnly: boolean;
			opaqueSpreadNode: TsNode | null;
			overflowKeys: boolean;
		} => {
			// The candidate set of a JSX attribute value over the transparent
			// expression family — a conditional `rel` can provably evaluate to
			// `stylesheet`, so the link rule must see it. Source-order
			// last-write-wins through the shared walker: the last occurrence
			// decides, whether it is an explicit attribute (round-15 M1), a
			// static object-literal spread, or a later explicit
			// re-establishment, and an opaque spread after the last static
			// fact makes the final value unprovable (round-16 I1).
			// `overflow` says the candidate set itself exceeded the work
			// budget (round-19 B1): the value is provably static text the
			// guard cannot enumerate, so the caller must fail loud by name
			// instead of treating the overflow as an ordinary unknown — the
			// analyser's inability to resolve is an unresolvable input, never
			// a compliant default.
			const occurrence = lastJsxAttributeValueNode(attributes, attributeName);
			const result =
				occurrence.valueNode == null
					? null
					: staticStringValues(occurrence.valueNode);
			return {
				values: occurrence.unresolved || result == null ? null : result.values,
				overflow: result?.overflow ?? false,
				unresolved: occurrence.unresolved,
				opaqueOnly: occurrence.opaqueOnly,
				opaqueSpreadNode: occurrence.opaqueSpreadNode,
				overflowKeys: occurrence.overflowKeys,
			};
		};
		const dangerousHtmlPayloadObject = (
			attributes: ts.JsxAttributes,
		): DangerousHtmlPayloadResult => {
			// Resolves the `dangerouslySetInnerHTML={{ __html: … }}` payload
			// object of a JSX attributes list with real JSX semantics through
			// the shared source-ordered walker: the last occurrence wins,
			// whether it is an explicit attribute or a static object-literal
			// spread, and a genuinely opaque spread may carry the attribute,
			// so it shadows earlier static occurrences exactly as a later
			// attribute override would — source-order last-write-wins — and a
			// later explicit occurrence establishes the payload again.
			// `unresolved` says whether an opaque spread sits after the last
			// establishing occurrence, in which case the final payload is not
			// provable and the caller must fail loud by name. Transparent
			// parentheses/assertions around the payload object or around a
			// spread's member are equivalent spellings.
			const occurrence = lastJsxAttributeValueNode(
				attributes,
				'dangerouslySetInnerHTML',
			);
			const memberObject = unwrapTransparentExpression(occurrence.valueNode);
			return {
				payloadObject:
					occurrence.unresolved ||
					memberObject == null ||
					!ts.isObjectLiteralExpression(memberObject)
						? null
						: memberObject,
				found:
					(occurrence.valueNode != null || occurrence.established) &&
					!occurrence.unresolved,
				unresolved: occurrence.unresolved,
				opaqueOnly: occurrence.opaqueOnly,
				opaqueSpreadNode: occurrence.opaqueSpreadNode,
				overflowKeys: occurrence.overflowKeys,
			};
		};
		const staticMember = (expression: TsNode): StaticMemberInfo | null => {
			const member = unwrapTransparentExpression(expression);
			if (member != null && ts.isPropertyAccessExpression(member)) {
				return {
					owner: member.expression,
					name: member.name.text,
					overflow: false,
				};
			}
			if (member != null && ts.isElementAccessExpression(member)) {
				// An overflowing element-access method name cannot name the
				// method at all (round-21 B1): the receiver is a member read
				// the guard cannot pin, so recognition callers must treat it
				// as UNRESOLVED and fail loud instead of concluding the
				// method is not the one under test. The funnel names all
				// three outcomes (round-23 B1).
				return staticString(
					member.argumentExpression,
					(value) => ({
						owner: member.expression,
						name: value,
						overflow: false,
					}),
					() => ({
						owner: member.expression,
						name: null,
						overflow: true,
					}),
					() => ({
						owner: member.expression,
						name: null,
						overflow: false,
					}),
				);
			}
			return null;
		};
		const isDirectGlobalString = (candidate: TsNode): boolean => {
			const expression = unwrapTransparentExpression(candidate);
			if (expression == null) {
				return false;
			}
			if (ts.isIdentifier(expression)) {
				return (
					expression.text === 'String' &&
					nearestBinding(expression, expression.text) == null
				);
			}
			const member = staticMember(expression);
			const owner = unwrapTransparentExpression(member?.owner);
			if (
				member?.name !== 'String' ||
				owner == null ||
				!ts.isIdentifier(owner) ||
				!['globalThis', 'window', 'self'].includes(owner.text)
			) {
				return false;
			}
			return nearestBinding(owner, owner.text) == null;
		};
		const isStringRawTag = (candidate, visitedConsts = new Set()) => {
			const member = staticMember(candidate);
			if (member?.name === 'raw' && isDirectGlobalString(member.owner)) {
				return true;
			}
			const expression = unwrapTransparentExpression(candidate);
			if (
				expression == null ||
				!ts.isIdentifier(expression) ||
				visitedConsts.has(expression.text)
			) {
				return false;
			}
			const resolved = resolveModuleConstFixpoint(expression, visitedConsts);
			return (
				resolved != null &&
				resolved !== expression &&
				isStringRawTag(resolved, new Set([...visitedConsts, expression.text]))
			);
		};
		const isDirectGlobalCss = (candidate) => {
			const expression = unwrapTransparentExpression(candidate);
			if (expression == null) {
				return false;
			}
			if (ts.isIdentifier(expression)) {
				return (
					expression.text === 'CSS' &&
					nearestBinding(expression, expression.text) == null
				);
			}
			const member = staticMember(expression);
			const owner = unwrapTransparentExpression(member?.owner);
			if (
				member?.name !== 'CSS' ||
				owner == null ||
				!ts.isIdentifier(owner) ||
				!['globalThis', 'window', 'self'].includes(owner.text)
			) {
				return false;
			}
			return nearestBinding(owner, owner.text) == null;
		};
		const staticStyleElementCss = (node) => {
			// Both JSX spellings carry the same payload: a `<style>` element
			// and a self-closing `<style … />` are the same DOM node, so the
			// `dangerouslySetInnerHTML` attribute lives in a different
			// `attributes` shape on each. A `dangerouslySetInnerHTML` payload
			// on a `<style>` element is the same static CSS text, just spelled
			// through the attribute. When the attribute is present, it decides
			// the element's shipped content: React ignores children in that
			// case, so there is nothing static to inspect beyond the payload
			// itself — a static payload is the shipped CSS, a non-static one
			// is the declared runtime bucket, and `childrenSuppressed` tells
			// the caller not to walk the children either.
			const selfClosing = ts.isJsxSelfClosingElement(node);
			if (!ts.isJsxElement(node) && !selfClosing) {
				return null;
			}
			const attributes = selfClosing
				? node.attributes
				: node.openingElement.attributes;
			const tag = selfClosing ? node.tagName : node.openingElement.tagName;
			if (!ts.isIdentifier(tag) || tag.text !== 'style') {
				return null;
			}
			const payload = dangerousHtmlPayloadObject(attributes);
			if (payload.found) {
				if (payload.payloadObject != null) {
					const member = staticObjectMemberNode(
						payload.payloadObject,
						'__html',
					);
					// An unresolved/opaque spread inside the payload may
					// override the member, so the value is not provable — the
					// caller reports the spread by name and nothing else. A
					// static payload is the set of strings it can provably be;
					// every candidate is walked as shipped CSS. A payload
					// whose candidates overflow the Cartesian cap is
					// provably static text the guard cannot inspect —
					// surfaced as `overflow` so the caller fails loud by
					// name instead of treating it as runtime.
					const cssResult =
						member.node == null ? null : staticStringValues(member.node);
					return {
						css:
							member.unresolved || cssResult == null || cssResult.values == null
								? null
								: [...cssResult.values],
						childrenSuppressed: true,
						overflow: cssResult?.overflow ?? false,
					};
				}
				return { css: null, childrenSuppressed: true, overflow: false };
			}
			if (selfClosing) {
				return { css: null, childrenSuppressed: false, overflow: false };
			}
			// Children. A text node always ships. A static expression ships
			// every string it can provably evaluate to; a non-static expression
			// is the declared runtime bucket — the static siblings still ship,
			// so they are returned as `staticParts` for the caller to walk
			// individually. When every child is static, the payload is the
			// Cartesian join of the child candidate sets and is walked as one
			// stylesheet (so a declaration spanning two children is caught).
			const partSets = [];
			let fullyStatic = true;
			let overflow = false;
			for (const child of node.children) {
				if (ts.isJsxText(child)) {
					partSets.push(new Set([child.text]));
				} else if (ts.isJsxExpression(child)) {
					const result = staticStringValues(child.expression);
					const values = result == null ? null : result.values;
					// A child that also reaches a recorded raw binding is not
					// fully static: `cond ? rawCss : ''` ships the raw bytes
					// in one branch, and the raw walk must still run. The
					// static branches still ship, so their candidates are
					// kept for the individual-part scan. A partial candidate
					// set (the static operand of a one-sided `+`) is likewise
					// not joinable — its members are provable substrings, not
					// complete values — so it ships individually and keeps
					// the payload out of the Cartesian join. An overflowing
					// candidate space is not enumerable at all — the payload
					// ships unread and `overflow` makes the caller fail loud
					// by name.
					if (
						values == null ||
						result.overflow ||
						result.partial ||
						expressionContainsRawBinding(child.expression)
					) {
						fullyStatic = false;
						if (values != null) {
							partSets.push(values);
						}
						if (result?.overflow) {
							overflow = true;
						}
						continue;
					}
					partSets.push(values);
				} else {
					fullyStatic = false;
				}
			}
			if (fullyStatic) {
				const joined = cartesianStringJoin(partSets);
				if (joined == null) {
					return {
						css: null,
						staticParts: null,
						childrenSuppressed: false,
						overflow: true,
					};
				}
				return {
					css: [...joined],
					staticParts: null,
					childrenSuppressed: false,
					overflow: false,
				};
			}
			const staticParts = [];
			for (const set of partSets) {
				staticParts.push(...set);
			}
			return {
				css: null,
				staticParts: staticParts.length === 0 ? null : staticParts,
				childrenSuppressed: false,
				overflow,
			};
		};
		const tagNameText = (node: TsNode): string => {
			if (
				ts.isJsxElement(node) &&
				ts.isIdentifier(node.openingElement.tagName)
			) {
				return node.openingElement.tagName.text;
			}
			if (ts.isJsxSelfClosingElement(node) && ts.isIdentifier(node.tagName)) {
				return node.tagName.text;
			}
			return null;
		};
		const scanHtmlStyleEscapes = (html: string): StaticHtmlStyleEscape[] => {
			// Static-HTML payloads can embed a `<style>` element (declaration
			// walk over its text) or a `<link rel="stylesheet">` (opaque, same
			// as the JSX link rule). Only literal attribute values are read, so
			// runtime-assembled HTML stays in the declared runtime bucket. A
			// payload the declaration walk cannot parse is reported as opaque —
			// never a crash, never a silent pass. A `<style>` element closes at
			// its `</style>` OR at EOF (browser fragment parsing closes an open
			// raw-text style element at the end of the input), so an unterminated
			// `<style>` still ships its CSS and must be walked — an unparseable
			// or partial static payload is never treated as compliant
			// (round-19 B3).
			const escapes: StaticHtmlStyleEscape[] = [];
			const stylePattern = /<style\b[^>]*>([\s\S]*?)(?:<\/style\s*>|$)/gi;
			let match;
			while ((match = stylePattern.exec(html))) {
				const css = match[1];
				let escape;
				try {
					if (
						checkCompiledCssZIndex(
							css,
							KNOWN_RAW_Z_INDEX_DECLARATIONS,
							'compiled stylesheet',
							{ canonicalScaleTokens },
						).length === 0
					) {
						continue;
					}
					escape = {
						ruleId: 'z-index-style-element-shipped',
						message:
							'static HTML payload ships a <style> element whose CSS never ' +
							'becomes an emitted asset — route every z-index through ' +
							'the scale or import the stylesheet through the build graph.',
						source: match[0],
					};
				} catch (error) {
					escape = {
						ruleId: 'z-index-unparseable-static-css',
						message:
							'static HTML <style> payload cannot be parsed as CSS ' +
							`(${cssParseFailureReason(error)}) — the guard cannot ` +
							'inspect what ships; fix the payload or import the ' +
							'stylesheet through the build graph.',
						source: match[0],
					};
				}
				escapes.push(escape);
			}
			const linkPattern = /<link\b[^>]*>/gi;
			while ((match = linkPattern.exec(html))) {
				const relValue = match[0].match(
					/\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
				);
				const hrefValue = match[0].match(
					/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
				);
				const rel = relValue?.[1] ?? relValue?.[2] ?? relValue?.[3] ?? '';
				const href = hrefValue?.[1] ?? hrefValue?.[2] ?? hrefValue?.[3];
				const relTokens = rel
					.split(/[\t\n\f\r ]+/)
					.filter(Boolean)
					.map(asciiLowerCase);
				if (href != null && relTokens.includes('stylesheet')) {
					escapes.push({
						ruleId: 'z-index-opaque-stylesheet-link',
						message:
							'static HTML payload ships a stylesheet link as an opaque ' +
							'browser request instead of an emitted asset — import the ' +
							'stylesheet through the build graph.',
						source: match[0],
					});
				}
			}
			return escapes;
		};
		// The recorded raw-binding record of one script: every binding a static
		// import declaration can introduce, for the recorded `?raw` modules —
		// the default clause, the namespace clause, named elements
		// (`{ default as x }` is the default under another spelling), and
		// mixed spellings (`import d, * as ns`) — each clause is recorded,
		// never one branch of an else-if (round-15 B2). Whether an import IS
		// a raw import is never re-derived from the specifier text (round-16
		// B1): the specifier resolves to a file path through the single
		// classifier, and the binding exists only when the build's provenance
		// record contains that path — `?v=1?raw` is raw because the build
		// transformed it as raw and recorded the file, exactly like any other
		// spelling. `kind` tells the walk what each binding provably ships:
		// the default text, a namespace object readable through `.default`,
		// or — for a named element that is not `default` — nothing at all
		// (undefined on a raw module, recorded by name so shadowing
		// resolution stays exact, green by name rather than by omission).
		// Exported so the fixture suite can assert the record itself
		// (round-16 I3 — "recorded by name" must be observable, not claimed).
		// The sourceFile is passed in so the recorded declaration nodes are
		// the very nodes `nearestBinding` resolves to later.
		const rawImportBindings = collectRawImportBindings(sourceFile, {
			relativePath,
			baseDir,
			rawTextPaths,
			rawTextIds,
			queriedPaths,
		});
		const rawImportEntryForExpression = (
			expression: TsNode,
			visitedConsts: ReadonlySet<string>,
		): RawImportBindingEntry | null => {
			// Resolves an expression to the `?raw` import entry it reaches —
			// the default import directly, the namespace form through
			// `.default`, or a module-scope `const` alias of either (following
			// alias chains, cycle-guarded). Only the declaration the binding
			// actually resolves to counts, so a shadowed identifier is never
			// mistaken for the raw import.
			const unwrapped = unwrapTransparentExpression(expression);
			if (unwrapped == null) {
				return null;
			}
			if (ts.isIdentifier(unwrapped)) {
				const entry = rawImportBindings.get(unwrapped.text);
				if (
					entry != null &&
					nearestBinding(unwrapped, unwrapped.text) === entry.declaration
				) {
					return entry;
				}
				const alias = moduleConstInitializers.get(unwrapped.text);
				if (
					alias != null &&
					!visitedConsts.has(unwrapped.text) &&
					nearestBinding(unwrapped, unwrapped.text) === alias.declaration
				) {
					const next = new Set(visitedConsts);
					next.add(unwrapped.text);
					return rawImportEntryForExpression(alias.initializer, next);
				}
				return null;
			}
			return null;
		};
		// Scans an expression subtree for identifiers that resolve (through
		// const alias chains, with the shadowing check at every hop) to a
		// recorded `?raw` import binding. Used to decide whether an
		// expression the guard cannot statically evaluate still carries raw
		// bytes into a style sink — the fail-loud condition for the resolver
		// family (round-12 B2).
		const expressionContainsRawBinding = (
			node: TsNode,
			visitedConsts: ReadonlySet<string> = new Set(),
		): boolean => {
			const expression = unwrapTransparentExpression(node);
			if (expression == null) {
				return false;
			}
			if (ts.isIdentifier(expression)) {
				const entry = rawImportBindings.get(expression.text);
				if (
					entry != null &&
					// A named element that is not `default` is undefined on a
					// raw module — it ships nothing, so it cannot put raw
					// bytes into an unevaluable expression.
					entry.kind !== 'named-non-default' &&
					nearestBinding(expression, expression.text) === entry.declaration
				) {
					return true;
				}
				const alias = moduleConstInitializers.get(expression.text);
				if (
					alias != null &&
					!visitedConsts.has(expression.text) &&
					nearestBinding(expression, expression.text) === alias.declaration
				) {
					const next = new Set(visitedConsts);
					next.add(expression.text);
					return expressionContainsRawBinding(alias.initializer, next);
				}
				return false;
			}
			if (ts.isPropertyAccessExpression(expression)) {
				return expressionContainsRawBinding(
					expression.expression,
					visitedConsts,
				);
			}
			if (ts.isElementAccessExpression(expression)) {
				return (
					expressionContainsRawBinding(expression.expression, visitedConsts) ||
					expressionContainsRawBinding(
						expression.argumentExpression,
						visitedConsts,
					)
				);
			}
			if (ts.isConditionalExpression(expression)) {
				// The condition is evaluated as a boolean, never shipped.
				return (
					expressionContainsRawBinding(expression.whenTrue, visitedConsts) ||
					expressionContainsRawBinding(expression.whenFalse, visitedConsts)
				);
			}
			if (ts.isCallExpression(expression)) {
				// The callee's identity never ships; only the arguments do.
				return expression.arguments.some((argument) =>
					expressionContainsRawBinding(argument, visitedConsts),
				);
			}
			let found = false;
			expression.forEachChild((child) => {
				if (!found) {
					found = expressionContainsRawBinding(child, visitedConsts);
				}
			});
			return found;
		};
		// Resolves a member read (`owner.name`) whose owner reaches a
		// recorded raw binding: a namespace import only through `.default`
		// (any other member of raw text is undefined and ships nothing);
		// otherwise the owner is resolved to a module-scope const object
		// literal chain and the member value is resolved recursively. An
		// owner that cannot be resolved still fails loud when a recorded raw
		// binding occurs inside it — the bytes may ship under that member.
		// The absent-member answer `{ specifiers: [], unresolved: false }` is
		// only reached with a provably complete key, so it is a genuine
		// provable absence (`o.other`), never a key the guard failed to pin
		// down (round-15 B1).
		const rawSpecifiersForNamedMemberAccess = (owner, name, visitedConsts) => {
			const ownerEntry = rawImportEntryForExpression(owner, visitedConsts);
			if (ownerEntry != null) {
				return ownerEntry.kind === 'namespace' && name === 'default'
					? { specifiers: [ownerEntry.specifier], unresolved: false }
					: { specifiers: [], unresolved: false };
			}
			const ownerChainResult = resolveMemberChain(owner, visitedConsts);
			// An unresolvable owner chain — including an element-access key
			// whose candidate space overflowed — is the same data-flow
			// boundary as an unresolvable owner: the raw bytes may ship under
			// the member, so `unresolved` mirrors what a raw binding inside
			// the expression would donate (round-21 B1 explicit handle).
			if (ownerChainResult.overflow) {
				return {
					specifiers: [],
					unresolved: expressionContainsRawBinding(owner, visitedConsts),
				};
			}
			const ownerChain = ownerChainResult.node;
			if (ownerChain != null && ts.isObjectLiteralExpression(ownerChain)) {
				const member = staticObjectMemberNode(ownerChain, name);
				if (member.node != null) {
					return rawBindingSpecifiersForExpression(member.node, visitedConsts);
				}
				if (member.unresolved || member.opaqueOnly) {
					return {
						specifiers: [],
						unresolved: expressionContainsRawBinding(ownerChain, visitedConsts),
					};
				}
				return { specifiers: [], unresolved: false };
			}
			return {
				specifiers: [],
				unresolved: expressionContainsRawBinding(owner, visitedConsts),
			};
		};
		const rawBindingSpecifiersForExpression = (
			node: TsNode,
			visitedConsts: ReadonlySet<string> = new Set(),
		): RawSpecifierResolution => {
			// Every `?raw` specifier whose bytes reach the expression, over
			// the statically transparent expression family: the import
			// binding directly (or through module-scope const alias chains,
			// followed to a cycle-guarded fixpoint), every substitution of a
			// template literal, both branches of a conditional, the argument
			// of `String(...)`, and object-member reads through const object
			// literals (`<style>{obj.css}</style>` ships the member's bytes)
			// — nested arbitrarily. When a recorded raw binding occurs inside
			// an expression node the family cannot evaluate, `unresolved` is
			// true and the caller fails loud by name: the raw bytes may ship
			// as CSS the guard cannot read (round-12 B2's property,
			// conditional, and String spellings are exactly this family).
			const expression = unwrapTransparentExpression(node);
			if (expression == null) {
				return { specifiers: [], unresolved: false };
			}
			if (ts.isTemplateExpression(expression)) {
				const specifiers = [];
				let unresolved = false;
				for (const span of expression.templateSpans) {
					const result = rawBindingSpecifiersForExpression(
						span.expression,
						visitedConsts,
					);
					specifiers.push(...result.specifiers);
					unresolved = unresolved || result.unresolved;
				}
				return { specifiers, unresolved };
			}
			if (ts.isConditionalExpression(expression)) {
				const whenTrue = rawBindingSpecifiersForExpression(
					expression.whenTrue,
					visitedConsts,
				);
				const whenFalse = rawBindingSpecifiersForExpression(
					expression.whenFalse,
					visitedConsts,
				);
				return {
					specifiers: [...whenTrue.specifiers, ...whenFalse.specifiers],
					unresolved: whenTrue.unresolved || whenFalse.unresolved,
				};
			}
			if (isStringCoercion(expression)) {
				return rawBindingSpecifiersForExpression(
					expression.arguments[0],
					visitedConsts,
				);
			}
			if (ts.isPropertyAccessExpression(expression)) {
				if (expression.name.text === 'default') {
					const ownerEntry = rawImportEntryForExpression(
						expression.expression,
						visitedConsts,
					);
					if (ownerEntry != null && ownerEntry.kind === 'namespace') {
						return { specifiers: [ownerEntry.specifier], unresolved: false };
					}
				}
				return rawSpecifiersForNamedMemberAccess(
					expression.expression,
					expression.name.text,
					visitedConsts,
				);
			}
			if (ts.isElementAccessExpression(expression)) {
				// The funnel names all three outcomes (round-23 B1): a
				// resolved key reads the named member; an overflowing key is
				// handled exactly like a provably-incomplete one — the member
				// cannot be named, so the raw-byte question is decided by
				// whether a recorded raw binding is reachable inside the
				// expression.
				return staticString(
					expression.argumentExpression,
					(value) =>
						rawSpecifiersForNamedMemberAccess(
							expression.expression,
							value,
							visitedConsts,
						),
					() => ({
						specifiers: [],
						unresolved: expressionContainsRawBinding(expression, visitedConsts),
					}),
					() => ({
						specifiers: [],
						unresolved: expressionContainsRawBinding(expression, visitedConsts),
					}),
				);
			}
			if (ts.isIdentifier(expression)) {
				// The direct binding, or a module-scope const alias chain that
				// descends into the whole family — `const cond = flag ? rawCss
				// : ''` ships the raw bytes through the conditional, so the
				// identifier spelling must reach the same resolution.
				const entry = rawImportBindings.get(expression.text);
				if (
					entry != null &&
					nearestBinding(expression, expression.text) === entry.declaration
				) {
					// Only the default binding's identifier is the raw text
					// itself; a namespace identifier is a module object (read
					// through `.default`) and a named element that is not
					// `default` is undefined on a raw module and ships
					// nothing — both stay green by name, never by omission.
					return entry.kind === 'default'
						? { specifiers: [entry.specifier], unresolved: false }
						: { specifiers: [], unresolved: false };
				}
				const alias = moduleConstInitializers.get(expression.text);
				if (
					alias != null &&
					!visitedConsts.has(expression.text) &&
					nearestBinding(expression, expression.text) === alias.declaration
				) {
					const next = new Set(visitedConsts);
					next.add(expression.text);
					return rawBindingSpecifiersForExpression(alias.initializer, next);
				}
				return { specifiers: [], unresolved: false };
			}
			return {
				specifiers: [],
				unresolved: expressionContainsRawBinding(expression, visitedConsts),
			};
		};
		const reportRawImportSink = (
			specifier: string,
			kind: 'css' | 'html',
			sinkNode: TsNode,
		): void => {
			// A `?raw` import whose binding reaches a style-capable sink is
			// shipped text the emitted gate can never see. The raw bytes are
			// walked only when the import binding is consumed by such a sink:
			// text displayed in `<pre>`/`<p>` is displayed text, not a
			// stylesheet. A style-sink payload the declaration walk cannot
			// parse is a named diagnostic, never a crash and never a silent
			// pass.
			if (baseDir == null || rawImportTexts == null) {
				return;
			}
			// The file part comes from the single classifier — the same
			// cleanUrl semantics the build used — so the multi-query spelling
			// (`./x.txt?v=1?raw`) resolves to the same recorded file as any
			// other spelling (round-16 B1).
			const resolvedPath = resolveRawSpecifierPath(
				classifyModuleKind(specifier, {}).filePath,
				relativePath,
				baseDir,
			);
			const text = rawImportTexts.get(resolvedPath);
			if (text == null) {
				// The build records every `?raw` module it transforms, so a
				// miss after correct resolution means the specifier spelling
				// is one the guard cannot map or the import never entered this
				// build's graph. Either way the guard cannot inspect what
				// ships — a named diagnostic, never a silent pass.
				violations.push({
					ruleId: 'z-index-unresolved-raw-import',
					message:
						`raw import \`${specifier}\` consumed by a style-capable sink ` +
						'cannot be resolved to a recorded ?raw module — the guard ' +
						'cannot inspect what ships; import the stylesheet through ' +
						'the build graph.',
					file: relativePath,
					line: lineForOffset(content, sinkNode.getStart(sourceFile)),
					source: specifier,
				});
				return;
			}
			const base = {
				file: path.relative(baseDir, resolvedPath),
				line: 1,
				source: text.slice(0, 120),
			};
			try {
				if (kind === 'html') {
					for (const escape of scanHtmlStyleEscapes(text)) {
						violations.push({ ...escape, ...base });
					}
				} else {
					violations.push(
						...checkCompiledCssZIndex(
							text,
							KNOWN_RAW_Z_INDEX_DECLARATIONS,
							base.file,
							{ canonicalScaleTokens },
						),
					);
				}
			} catch (error) {
				violations.push({
					ruleId: 'z-index-unparseable-static-css',
					message:
						`raw-imported text in ${base.file} is consumed by a style sink ` +
						`and cannot be parsed as CSS (${cssParseFailureReason(error)}) — ` +
						'the guard cannot inspect what ships; fix the payload or ' +
						'import the stylesheet through the build graph.',
					...base,
				});
			}
		};
		const reportRawSinkExpression = (expression, kind, sinkNode) => {
			// Walks a style-sink expression over the raw resolver family:
			// every specifier whose bytes provably reach the sink is walked as
			// shipped CSS/HTML, and an expression the family cannot evaluate
			// that still contains a recorded raw binding fails loud by name —
			// the raw bytes may ship unread (round-12 B2's object-property,
			// conditional, and String spellings resolve here; a call like
			// `fn(rawCss)` or a binary like `rawCss + x` cannot).
			const result = rawBindingSpecifiersForExpression(expression);
			for (const specifier of result.specifiers) {
				reportRawImportSink(specifier, kind, sinkNode);
			}
			if (result.unresolved) {
				violations.push({
					ruleId: 'z-index-unresolved-raw-expression',
					message:
						'a recorded ?raw import binding occurs inside a style-sink ' +
						'expression the guard cannot statically evaluate — the raw ' +
						'bytes may ship as CSS the guard cannot inspect; move the ' +
						'raw import out of the expression or import the stylesheet ' +
						'through the build graph.',
					file: relativePath,
					line: lineForOffset(content, sinkNode.getStart(sourceFile)),
					source: expression.getText(sourceFile),
				});
			}
		};
		const unresolvedSpreadViolation = (hostNode, opaqueSpreadNode, site) => {
			const base = {
				file: relativePath,
				line: lineForOffset(content, hostNode.getStart(sourceFile)),
			};
			if (opaqueSpreadNode != null) {
				base.source = opaqueSpreadNode.getText(sourceFile);
			}
			violations.push({
				ruleId: 'z-index-unresolved-spread-shadow',
				message:
					'an unresolvable spread may carry or override the member this ' +
					`rule must inspect (${site}) — the guard cannot verify what ` +
					'ships; spread only a module-scope const object literal here, ' +
					'or import the stylesheet through the build graph.',
				...base,
			});
		};
		// A link descriptor object is policed only when it provably reaches the
		// framework head API — the `head:` route-config slot whose `links` array
		// `<HeadContent>` renders, e.g. TanStack Router's
		// `head: () => ({ meta: [...], links: [...] })` (round-21 I2, round-23
		// I2). An object literal that merely has `rel`/`href` keys establishes
		// nothing about a sink — and neither does an object whose `head` slot
		// is only *shaped* like a route config: the literal rules must prove
		// the containing config object actually reaches a TanStack route
		// creator call (`createRootRoute({ head: ... })`, `createRoute(...)`),
		// directly or through a module-scope const alias. A standalone object
		// — a metadata factory, a dead `const` — is neither a violation nor
		// declared a safe descriptor.
		const isHeadPropertyAssignment = (node) =>
			node != null &&
			ts.isPropertyAssignment(node) &&
			propertyName(node.name) === 'head';
		// Walks past parentheses that wrap a node (`({...})`), returning the
		// node's effective parent.
		const transparentWrapperParent = (node) => {
			let current = node;
			while (
				current != null &&
				current.parent != null &&
				ts.isParenthesizedExpression(current.parent) &&
				current.parent.expression === current
			) {
				current = current.parent;
			}
			return current.parent;
		};
		// The TanStack route-creator family whose config argument `<HeadContent>`
		// renders. `createRootRouteWithContext<...>()({...})` is the outer call
		// of a call chain; every call chain unwraps to one of these names.
		const routeCreatorNames = new Set([
			'createRootRoute',
			'createRootRouteWithContext',
			'createRoute',
			'createRouteWithContext',
		]);
		const isRouteCreatorCall = (node) => {
			if (!ts.isCallExpression(node)) {
				return false;
			}
			let callee = unwrapTransparentExpression(node.expression);
			while (callee != null && ts.isCallExpression(callee)) {
				callee = unwrapTransparentExpression(callee.expression);
			}
			if (callee == null) {
				return false;
			}
			if (ts.isIdentifier(callee)) {
				return routeCreatorNames.has(callee.text);
			}
			if (ts.isPropertyAccessExpression(callee)) {
				return routeCreatorNames.has(callee.name.text);
			}
			return false;
		};
		// Computed once per file: every object literal that provably serves as
		// a route config — the config argument of a route-creator call,
		// directly or through a module-scope const alias chain (`const config
		// = {...}; createRootRoute(config)`). A `head:` slot inside one of
		// these literals is the only shape the literal rules police
		// (round-23 I2 — reachability, not shape).
		const routeConfigObjectLiterals = new Set<ts.ObjectLiteralExpression>();
		{
			const recordRouteConfigArgument = (argument: TsNode): void => {
				const unwrapped = unwrapTransparentExpression(argument);
				if (unwrapped == null) {
					return;
				}
				if (ts.isObjectLiteralExpression(unwrapped)) {
					routeConfigObjectLiterals.add(unwrapped);
					return;
				}
				if (ts.isIdentifier(unwrapped)) {
					const fixpoint = resolveModuleConstFixpoint(unwrapped);
					if (fixpoint != null && ts.isObjectLiteralExpression(fixpoint)) {
						routeConfigObjectLiterals.add(fixpoint);
					}
				}
			};
			const visitForRouteConfigs = (node: TsNode): void => {
				if (ts.isCallExpression(node) && isRouteCreatorCall(node)) {
					for (const argument of node.arguments) {
						recordRouteConfigArgument(argument);
					}
				}
				node.forEachChild(visitForRouteConfigs);
			};
			visitForRouteConfigs(sourceFile);
		}
		// The head function a `head:` value provably is: an inline arrow or
		// function expression, a module-scope const chain resolving to one
		// (`head: routeHead` — a normal, genuine route path), or a function
		// declaration. Returns null when the value's identity is unprovable.
		const headFunctionValueOf = (valueNode: TsNode): HeadFunction | null => {
			const unwrapped = unwrapTransparentExpression(valueNode);
			if (unwrapped == null) {
				return null;
			}
			if (ts.isArrowFunction(unwrapped) || ts.isFunctionExpression(unwrapped)) {
				return unwrapped;
			}
			if (ts.isIdentifier(unwrapped)) {
				const fixpoint = resolveModuleConstFixpoint(unwrapped);
				if (
					fixpoint != null &&
					(ts.isArrowFunction(fixpoint) || ts.isFunctionExpression(fixpoint))
				) {
					return fixpoint;
				}
				const binding = nearestBinding(unwrapped, unwrapped.text);
				if (binding != null && ts.isFunctionDeclaration(binding)) {
					return binding;
				}
			}
			return null;
		};
		// Computed once per file: every `head:` property assignment mapped to
		// the head function its value provably is (null when unprovable).
		const headFunctionByConfigObject = new Map<
			ts.ObjectLiteralExpression,
			HeadFunction | null
		>();
		{
			const visitForHeadSlots = (node) => {
				if (ts.isPropertyAssignment(node) && isHeadPropertyAssignment(node)) {
					const configObject = node.parent;
					if (ts.isObjectLiteralExpression(configObject)) {
						headFunctionByConfigObject.set(
							configObject,
							headFunctionValueOf(node.initializer),
						);
					}
				}
				node.forEachChild(visitForHeadSlots);
			};
			visitForHeadSlots(sourceFile);
		}
		// The object containing the `links:` array must be the returned object
		// of the head function — inline, block-bodied, or supplied by
		// identifier — and that head function must sit in a `head:` slot of a
		// route config object the file provably hands to a route creator.
		const isHeadConfigObject = (
			configObject: ts.ObjectLiteralExpression,
		): boolean => {
			const parent = transparentWrapperParent(configObject);
			if (parent == null) {
				return false;
			}
			let headFunctionNode = null;
			if (ts.isArrowFunction(parent) || ts.isFunctionExpression(parent)) {
				headFunctionNode = parent;
			} else if (ts.isReturnStatement(parent)) {
				// A block-bodied head function: `head: () => { return {...}; }`.
				const block = parent.parent;
				if (block != null && ts.isBlock(block)) {
					let cursor = block.parent;
					while (cursor != null && !ts.isFunctionLike(cursor)) {
						cursor = cursor.parent;
					}
					headFunctionNode = cursor;
				}
			}
			if (headFunctionNode == null) {
				return false;
			}
			// The inline spelling: the head function is the value of a
			// `head:` slot directly.
			const slotParent = transparentWrapperParent(headFunctionNode);
			if (isHeadPropertyAssignment(slotParent)) {
				return routeConfigObjectLiterals.has(slotParent.parent);
			}
			// The identifier spelling: a `head:` slot elsewhere in the file
			// whose value resolves to this head function.
			for (const [
				candidateConfig,
				headFunction,
			] of headFunctionByConfigObject) {
				if (
					headFunction === headFunctionNode &&
					routeConfigObjectLiterals.has(candidateConfig)
				) {
					return true;
				}
			}
			return false;
		};
		const isHeadConfiguredLinkDescriptor = (node: TsNode): boolean => {
			const arrayNode = node.parent;
			if (arrayNode == null || !ts.isArrayLiteralExpression(arrayNode)) {
				return false;
			}
			if (
				arrayNode.parent == null ||
				!ts.isPropertyAssignment(arrayNode.parent) ||
				propertyName(arrayNode.parent.name) !== 'links'
			) {
				return false;
			}
			const linksOwnerObject = arrayNode.parent.parent;
			return (
				linksOwnerObject != null &&
				ts.isObjectLiteralExpression(linksOwnerObject) &&
				isHeadConfigObject(linksOwnerObject)
			);
		};
		const relTokenValues = (
			values: Iterable<string> | null,
		): Set<string> | null => {
			if (values == null) {
				return null;
			}
			const tokens = new Set();
			for (const value of values) {
				for (const token of value.split(/[\t\n\f\r ]+/).filter(Boolean)) {
					tokens.add(asciiLowerCase(token));
				}
			}
			return tokens;
		};
		// A rel candidate set that is provably free of the `stylesheet` token
		// (every enumerable candidate lacks it) cannot load a stylesheet, so an
		// overflowing or static `href` on such a link is inert — `<link
		// rel="icon">` with an overflowing href must stay green (round-21 I2).
		const relProvablyNotStylesheet = (
			values: Iterable<string> | null,
		): boolean => {
			if (values == null) {
				return false;
			}
			const tokens = relTokenValues(values);
			return tokens != null && !tokens.has('stylesheet');
		};
		const visitStaticStyleEscapes = (node: TsNode): void => {
			const styleResult = staticStyleElementCss(node);
			const styleCssCandidates = styleResult == null ? null : styleResult.css;
			const staticParts = styleResult?.staticParts ?? null;
			const childrenSuppressed = styleResult?.childrenSuppressed ?? false;
			// A dangerouslySetInnerHTML payload overflow is reported by the
			// payload branch below with its own named message; the generic
			// `<style>`-payload diagnostic would only duplicate it
			// (round-17 B2 proof).
			if (styleResult?.overflow && !childrenSuppressed) {
				// The payload is provably static text with too many candidates
				// to enumerate — an unresolvable payload the guard cannot
				// inspect, exactly like an unparseable one, and a hang would
				// be a worse failure than a red. Named, never silent
				// (round-15 M2, round-16 I2).
				violations.push({
					ruleId: 'z-index-static-candidate-overflow',
					message:
						`static <style> payload exceeds the guard's work budget of ` +
						`${CARTESIAN_WORK_BUDGET} candidate characters — ` +
						'an unresolvable payload the guard cannot enumerate; ' +
						'simplify the payload or import the ' +
						'stylesheet through the build graph.',
					file: relativePath,
					line: lineForOffset(content, node.getStart(sourceFile)),
					source: node.getText(sourceFile),
				});
			}
			const scanStaticCss = (cssCandidate) => {
				const base = {
					file: relativePath,
					line: lineForOffset(content, node.getStart(sourceFile)),
					source: node.getText(sourceFile),
				};
				let cssViolations;
				try {
					cssViolations = checkCompiledCssZIndex(
						cssCandidate,
						KNOWN_RAW_Z_INDEX_DECLARATIONS,
						'compiled stylesheet',
						{ canonicalScaleTokens },
					).map((violation) => ({
						ruleId: 'z-index-style-element-shipped',
						message:
							'static <style> element ships CSS that never becomes an ' +
							'emitted asset — ' +
							`\`${violation.source}\` does not resolve through ` +
							'var(--publy-z-…); route every z-index through the ' +
							'scale or import the stylesheet through the build ' +
							'graph.',
					}));
				} catch (error) {
					// A payload the walk cannot parse is a violation, not a
					// crash and not a silent pass — the CSS ships unread.
					cssViolations = [
						{
							ruleId: 'z-index-unparseable-static-css',
							message:
								'static <style> payload cannot be parsed as CSS ' +
								`(${cssParseFailureReason(error)}) — the guard cannot ` +
								'inspect what ships; fix the payload or import the ' +
								'stylesheet through the build graph.',
						},
					];
				}
				for (const violation of cssViolations) {
					violations.push({ ...violation, ...base });
				}
			};
			if (styleCssCandidates != null) {
				// Every candidate is a payload the element can provably ship;
				// any candidate containing a raw declaration reds.
				for (const cssCandidate of styleCssCandidates) {
					scanStaticCss(cssCandidate);
				}
			} else if (staticParts != null) {
				// A mixed payload (static parts beside runtime children): the
				// static text still ships, so each part is walked individually.
				for (const staticPart of staticParts) {
					scanStaticCss(staticPart);
				}
			}
			const isStyleElement = tagNameText(node) === 'style';
			let elementAttributes = null;
			if (ts.isJsxElement(node)) {
				elementAttributes = node.openingElement.attributes;
			} else if (ts.isJsxSelfClosingElement(node)) {
				elementAttributes = node.attributes;
			}
			const payload =
				elementAttributes == null
					? null
					: dangerousHtmlPayloadObject(elementAttributes);
			if (isStyleElement && payload?.overflowKeys) {
				// A spread descriptor with an unenumerable computed member may
				// carry `dangerouslySetInnerHTML` on this provably
				// style-capable element (round-21 B1).
				violations.push({
					ruleId: 'z-index-static-candidate-overflow',
					message:
						`static <style> element's attribute spread has a computed ` +
						'member key the guard cannot enumerate — it may carry ' +
						'`dangerouslySetInnerHTML`; simplify the key or import the ' +
						'stylesheet through the build graph.',
					file: relativePath,
					line: lineForOffset(content, node.getStart(sourceFile)),
					source: node.getText(sourceFile),
				});
			}
			if (isStyleElement && (payload?.unresolved || payload?.opaqueOnly)) {
				// An unresolvable spread on a `<style>` element may carry
				// `dangerouslySetInnerHTML` — the payload could be anything,
				// so the element leaves the guarded class by name. An opaque
				// spread with no static facts at all is the same hole: the
				// element is provably style-capable, so the spread cannot be
				// dismissed as unrelated runtime data.
				unresolvedSpreadViolation(
					node,
					payload.opaqueSpreadNode,
					'a <style> element',
				);
			}
			if (
				isStyleElement &&
				styleCssCandidates == null &&
				!childrenSuppressed &&
				ts.isJsxElement(node)
			) {
				// A `<style>` element whose children include a `?raw` import
				// binding ships that file's bytes as CSS — the binding is the
				// provenance, so text displayed elsewhere (a `<pre>`) is not
				// walked. Aliases, template substitutions, and the namespace
				// `.default` spelling are the same binding. The raw walk runs
				// whenever the children were not fully consumed as static CSS
				// (a fully static payload contains no raw binding by
				// construction), and reports unparseable bytes by name.
				// Every child position is walked — a slice bound of any size
				// is the same class of defect as a one-hop resolver.
				for (const child of node.children) {
					if (ts.isJsxExpression(child) && child.expression != null) {
						reportRawSinkExpression(child.expression, 'style', child);
					}
				}
			}
			const payloadObject = payload == null ? null : payload.payloadObject;
			if (payloadObject != null) {
				const member = staticObjectMemberNode(payloadObject, '__html');
				if (member.overflowKeys) {
					// A computed member key whose candidate space overflows
					// (round-21 B1) may BE the `__html` the guard must read —
					// the payload object is provably a dSIH payload, so the
					// unresolvable member fails loud by name.
					violations.push({
						ruleId: 'z-index-static-candidate-overflow',
						message:
							`static dangerouslySetInnerHTML payload has a computed ` +
							`member key the guard cannot enumerate — it may be ` +
							`\`__html\`; simplify the key or import the stylesheet ` +
							'through the build graph.',
						file: relativePath,
						line: lineForOffset(content, node.getStart(sourceFile)),
						source: node.getText(sourceFile),
					});
				} else if (member.unresolved || member.opaqueOnly) {
					// `{ __html: …, ...opaque }` or `{ ...opaque }` — the
					// spread may override or supply the payload the guard
					// would otherwise inspect. The payload object is provably
					// a dSIH payload, so the opaque-only spread fails loud
					// exactly like the shadowing one.
					unresolvedSpreadViolation(
						node,
						member.opaqueSpreadNode,
						'a dangerouslySetInnerHTML payload',
					);
				} else if (member.node != null) {
					const htmlResult = staticStringValues(member.node);
					const htmlValues = htmlResult == null ? null : htmlResult.values;
					if (htmlResult?.overflow) {
						violations.push({
							ruleId: 'z-index-static-candidate-overflow',
							message:
								'static dangerouslySetInnerHTML payload exceeds the ' +
								`guard's work budget of ${CARTESIAN_WORK_BUDGET} ` +
								'candidate characters — an unresolvable payload the ' +
								'guard cannot enumerate; simplify the payload or ' +
								'import the stylesheet through the build graph.',
							file: relativePath,
							line: lineForOffset(content, node.getStart(sourceFile)),
							source: node.getText(sourceFile),
						});
					}
					if (htmlValues != null) {
						for (const dangerousHtml of htmlValues) {
							const htmlEscapes = scanHtmlStyleEscapes(dangerousHtml);
							for (const escape of htmlEscapes) {
								violations.push({
									...escape,
									file: relativePath,
									line: lineForOffset(content, node.getStart(sourceFile)),
								});
							}
						}
					}
					// The raw walk owns recorded bindings even when another
					// branch is static — `cond ? rawHtml : '<style>…'` ships
					// the raw bytes in one branch and the static HTML in the
					// other, so both must be inspected.
					if (htmlResult == null || expressionContainsRawBinding(member.node)) {
						reportRawSinkExpression(
							member.node,
							isStyleElement ? 'style' : 'html',
							node,
						);
					}
				}
			}
			let relValues = null;
			let hrefValues = null;
			if (
				(ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
				ts.isIdentifier(node.tagName) &&
				node.tagName.text === 'link'
			) {
				const relResult = staticJsxAttributeValues(node.attributes, 'rel');
				const hrefResult = staticJsxAttributeValues(node.attributes, 'href');
				// The shared source-ordered reader gives link attributes the
				// same explicit/static-spread/opaque-spread model as every
				// other JSX reader (round-16 I1): a later static spread can
				// override an earlier explicit `rel` and vice versa, and an
				// opaque spread after the last static fact makes the value
				// unprovable — the named diagnostic fires, and the literal
				// rule must not fire on an unprovable member.
				relValues =
					relResult.unresolved || relResult.values == null
						? null
						: relResult.values;
				hrefValues =
					hrefResult.unresolved || hrefResult.values == null
						? null
						: hrefResult.values;
				if (
					!relProvablyNotStylesheet(relValues) &&
					(relResult.overflow ||
						hrefResult.overflow ||
						relResult.overflowKeys ||
						hrefResult.overflowKeys)
				) {
					// The rel/href candidate set overflowed the work budget, or
					// an attribute spread carries a computed member key the
					// guard cannot enumerate (round-21 B1): the value is
					// provably static text the guard cannot enumerate, so it
					// might be `stylesheet` pointing at a data URL — an
					// unresolvable input that must fail loud by name, never
					// resolve to a compliant default (round-19 B1). A link
					// whose rel is provably free of `stylesheet` cannot load a
					// stylesheet, so an overflowing href on it is inert
					// (round-21 I2).
					violations.push({
						ruleId: 'z-index-static-candidate-overflow',
						message:
							`static <link> rel/href candidate space exceeds the guard's ` +
							`work budget of ${CARTESIAN_WORK_BUDGET} candidate ` +
							'characters — an unresolvable payload the guard cannot ' +
							'enumerate; simplify the rel/href expression or import ' +
							'the stylesheet through the build graph.',
						file: relativePath,
						line: lineForOffset(content, node.getStart(sourceFile)),
						source: node.getText(sourceFile),
					});
				} else if (relResult.unresolved || hrefResult.unresolved) {
					unresolvedSpreadViolation(
						node,
						relResult.opaqueSpreadNode ?? hrefResult.opaqueSpreadNode,
						'a <link> element',
					);
				}
			} else if (
				ts.isObjectLiteralExpression(node) &&
				isHeadConfiguredLinkDescriptor(node)
			) {
				// Only a descriptor that provably reaches the framework head
				// API (`head: () => ({ links: [...] })`) is policed by the
				// literal rules; an object that merely has `rel`/`href` keys
				// establishes no sink and is not a violation (round-21 I2).
				const relResult = staticObjectProperty(node, 'rel');
				const hrefResult = staticObjectProperty(node, 'href');
				// An unresolved spread may override the member, so the value is
				// not provable — the named diagnostic carries the case and the
				// literal rule must not fire on an unprovable member. An
				// opaque-only spread stays in the runtime bucket: this object
				// literal is not provably a link descriptor, so the spread
				// cannot be policed as one (that is what the `{...props}`
				// green proof pins). An overflowing candidate set of either
				// member is the same unresolvable input the JSX link branch
				// reports by name (round-19 B1).
				const relStringResult =
					relResult.unresolved || relResult.node == null
						? null
						: staticStringValues(relResult.node);
				const hrefStringResult =
					hrefResult.unresolved || hrefResult.node == null
						? null
						: staticStringValues(hrefResult.node);
				relValues = relStringResult?.values ?? null;
				hrefValues = hrefStringResult?.values ?? null;
				if (
					!relProvablyNotStylesheet(relValues) &&
					(relStringResult?.overflow ||
						hrefStringResult?.overflow ||
						relResult.overflowKeys ||
						hrefResult.overflowKeys)
				) {
					violations.push({
						ruleId: 'z-index-static-candidate-overflow',
						message:
							`static link-descriptor rel/href candidate space exceeds ` +
							`the guard's work budget of ${CARTESIAN_WORK_BUDGET} ` +
							'candidate characters — an unresolvable payload the ' +
							'guard cannot enumerate; simplify the rel/href ' +
							'expression or import the stylesheet through the build ' +
							'graph.',
						file: relativePath,
						line: lineForOffset(content, node.getStart(sourceFile)),
						source: node.getText(sourceFile),
					});
				} else if (relResult.unresolved || hrefResult.unresolved) {
					unresolvedSpreadViolation(
						node,
						relResult.opaqueSpreadNode ?? hrefResult.opaqueSpreadNode,
						'a link descriptor',
					);
				}
			}
			const relHasStylesheet =
				relValues != null &&
				[...relValues].some((value) =>
					value
						.split(/[\t\n\f\r ]+/)
						.filter(Boolean)
						.map(asciiLowerCase)
						.includes('stylesheet'),
				);
			if (hrefValues != null && relHasStylesheet) {
				violations.push({
					ruleId: 'z-index-opaque-stylesheet-link',
					message:
						'literal stylesheet-link CSS is shipped as an opaque browser ' +
						'request instead of an emitted asset — import the stylesheet ' +
						'through the build graph.',
					file: relativePath,
					line: lineForOffset(content, node.getStart(sourceFile)),
					source: node.getText(sourceFile),
				});
			}
			const registrationMember = ts.isCallExpression(node)
				? staticMember(node.expression)
				: null;
			// An overflowing method name on a call whose owner is provably the
			// CSS global may BE `registerProperty` (round-21 B1): the guard
			// cannot rule out a registration, so it fails loud by name.
			if (
				ts.isCallExpression(node) &&
				registrationMember?.overflow &&
				isDirectGlobalCss(registrationMember.owner) &&
				ts.isObjectLiteralExpression(node.arguments[0])
			) {
				violations.push({
					ruleId: 'z-index-static-candidate-overflow',
					message:
						`static CSS registration call's method name candidate space ` +
						`exceeds the guard's work budget of ` +
						`${CARTESIAN_WORK_BUDGET} candidate characters — it may be ` +
						'`CSS.registerProperty()`; simplify the method-name ' +
						'expression.',
					file: relativePath,
					line: lineForOffset(content, node.getStart(sourceFile)),
					source: node.getText(sourceFile),
				});
			} else if (
				ts.isCallExpression(node) &&
				registrationMember?.name === 'registerProperty' &&
				isDirectGlobalCss(registrationMember.owner) &&
				ts.isObjectLiteralExpression(node.arguments[0])
			) {
				const propertyResult = staticObjectProperty(node.arguments[0], 'name');
				if (propertyResult.overflowKeys) {
					// A computed descriptor key the guard cannot enumerate may
					// BE `name` — the descriptor object is provably a
					// registerProperty descriptor, so it fails loud (round-21
					// B1).
					violations.push({
						ruleId: 'z-index-static-candidate-overflow',
						message:
							`static CSS.registerProperty() descriptor has a computed ` +
							'member key the guard cannot enumerate — it may be ' +
							'`name`; simplify the key expression.',
						file: relativePath,
						line: lineForOffset(content, node.getStart(sourceFile)),
						source: node.getText(sourceFile),
					});
				} else if (propertyResult.unresolved || propertyResult.opaqueOnly) {
					// An opaque spread may supply or override `name`. The
					// argument object is provably a registerProperty
					// descriptor, so the opaque-only spread fails loud.
					unresolvedSpreadViolation(
						node,
						propertyResult.opaqueSpreadNode,
						'CSS.registerProperty()',
					);
				} else {
					const nameResult =
						propertyResult.node == null
							? null
							: staticStringValues(propertyResult.node);
					if (nameResult?.overflow) {
						// The name candidate space overflowed the work budget:
						// the name is provably static text the guard cannot
						// enumerate, so it may be a reserved `--publy-z-*`
						// token — an unresolvable input that must fail loud by
						// name (round-19 B1).
						violations.push({
							ruleId: 'z-index-static-candidate-overflow',
							message:
								`static CSS.registerProperty() name candidate space ` +
								`exceeds the guard's work budget of ` +
								`${CARTESIAN_WORK_BUDGET} candidate characters — ` +
								'an unresolvable payload the guard cannot ' +
								'enumerate; simplify the name expression.',
							file: relativePath,
							line: lineForOffset(content, node.getStart(sourceFile)),
							source: node.getText(sourceFile),
						});
					} else {
						const nameCandidates =
							nameResult == null ? null : nameResult.values;
						if (nameCandidates != null) {
							const reservedName = [...nameCandidates].find((name) =>
								name.startsWith('--publy-z-'),
							);
							if (reservedName != null) {
								violations.push({
									ruleId: 'z-index-scale-token-registered',
									message:
										`script registration of reserved scale token \`${reservedName}\` can ` +
										'replace its inherited tier value — the --publy-z-* namespace ' +
										'must not be registered with CSS.registerProperty().',
									file: relativePath,
									line: lineForOffset(content, node.getStart(sourceFile)),
									source: `CSS.registerProperty(${reservedName})`,
								});
							}
						}
					}
				}
			}
			node.forEachChild(visitStaticStyleEscapes);
		};
		if (checkBuildReachableScript) {
			visitStaticStyleEscapes(sourceFile);
		}
		// --- CSSOM receiver semantics (round-21 I1, round-23 identity) -------
		// `setProperty` is a CSSOM write only when it provably reaches a
		// `CSSStyleDeclaration`. The guard decides that from the receiver's
		// identity, not from the call's spelling: a dot or bracket call, a
		// bound method alias, or a destructured method all reduce to the same
		// question — is the eventual `this` a CSSStyleDeclaration? — and a
		// method merely *named* `setProperty` on an unrelated object counts
		// for nothing.
		//
		// Identity is a three-way fact (round-23 I1):
		//   - PROVEN CSSOM — the receiver is a `.style` member of a value the
		//     source types as a DOM element, or a value typed
		//     `CSSStyleDeclaration` itself. A type annotation is a static fact
		//     of the source, the same class of proof as an object literal.
		//   - PROVEN NOT CSSOM — the `.style` owner is a plain object literal
		//     or a class instance (a `new Class()` never yields the DOM
		//     accessor unless the class extends a DOM element), or the method
		//     is unbound-destructured (a bare destructured Web-IDL method
		//     raises `TypeError: Illegal invocation` and writes nothing).
		//   - UNRESOLVED — a parameter without a DOM/CSSOM annotation, an
		//     import, a global, a function result: absence of proof is not
		//     proof of absence, so the write fails loud by name at the sink.
		// Resolving a static object to a plain object literal uses the same
		// transparent wrapper + alias-chain model as the rest of the guard.
		const resolvedStaticObject = (node, visited = new Set()) => {
			const expression = unwrapTransparentExpression(node);
			if (expression != null && ts.isObjectLiteralExpression(expression)) {
				return expression;
			}
			if (expression != null && ts.isIdentifier(expression)) {
				if (visited.has(expression.text)) {
					return null;
				}
				const next = new Set(visited);
				next.add(expression.text);
				const binding = nearestBinding(expression, expression.text);
				if (
					binding != null &&
					ts.isVariableDeclaration(binding) &&
					binding.initializer != null
				) {
					return resolvedStaticObject(binding.initializer, next);
				}
			}
			return null;
		};
		// The guard's `nearestBinding` resolves a destructure target to the whole
		// `VariableDeclaration`, so the recognizer digs into the object pattern
		// for the exact binding element that carries the identifier.
		const findBindingElement = (pattern, name) => {
			for (const element of pattern.elements) {
				if (
					ts.isBindingElement(element) &&
					element.name.kind === ts.SyntaxKind.Identifier &&
					element.name.text === name
				) {
					return element;
				}
				if (element.name.kind !== ts.SyntaxKind.Identifier) {
					const nested = findBindingElement(element.name, name);
					if (nested != null) {
						return nested;
					}
				}
			}
			return null;
		};
		// The named type references of a parameter/const annotation, unwrapped
		// through nullable unions: `HTMLElement`, `HTMLElement | null`, and
		// `CSSStyleDeclaration` are the identities this guard can prove. An
		// empty list means the annotation (if any) names nothing the guard
		// understands — the identity is unprovable.
		const namedTypeCandidates = (type) => {
			if (type == null) {
				return [];
			}
			if (ts.isTypeReferenceNode(type)) {
				return ts.isIdentifier(type.typeName) ? [type.typeName.text] : [];
			}
			if (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type)) {
				return type.types.flatMap(namedTypeCandidates);
			}
			return [];
		};
		// The two provable receiver identities a type annotation can carry
		// (round-23 I1):
		//   - a CSSStyleDeclaration-typed value is the accessor itself;
		//   - a DOM-element-typed value carries the accessor under `.style`
		//     and has no `setProperty` member of its own — a direct call on
		//     it is provably not a write.
		const receiverIdentityFromTypeNames = (names) => {
			if (
				names.some(
					(name) =>
						name === 'CSSStyleDeclaration' || name.endsWith('StyleDeclaration'),
				)
			) {
				return 'style-decl';
			}
			if (
				names.some((name) => name === 'Element' || name.endsWith('Element'))
			) {
				return 'element';
			}
			return null;
		};
		const typeAnnotationNames = (node) => {
			// The named types of the nearest annotated binding of a value
			// expression (a parameter or a variable declaration).
			if (!ts.isIdentifier(node)) {
				return [];
			}
			const binding = nearestBinding(node, node.text);
			if (binding == null) {
				return [];
			}
			if (ts.isParameter(binding) || ts.isVariableDeclaration(binding)) {
				return namedTypeCandidates(binding.type);
			}
			return [];
		};
		// Resolves a `.style` owner to a class instance it provably is — a
		// `new X()` through identifier/alias chains — returning the class
		// declaration, or null when the owner is not provably a class
		// instance (an import, a parameter, a function result).
		const classInstanceOwner = (node, visited = new Set()) => {
			const expression = unwrapTransparentExpression(node);
			if (expression == null) {
				return null;
			}
			if (ts.isNewExpression(expression)) {
				const callee = unwrapTransparentExpression(expression.expression);
				if (callee != null && ts.isIdentifier(callee)) {
					const binding = nearestBinding(callee, callee.text);
					if (binding != null && ts.isClassDeclaration(binding)) {
						return binding;
					}
				}
				return null;
			}
			if (ts.isIdentifier(expression)) {
				if (visited.has(expression.text)) {
					return null;
				}
				const next = new Set(visited);
				next.add(expression.text);
				const binding = nearestBinding(expression, expression.text);
				if (
					binding != null &&
					ts.isVariableDeclaration(binding) &&
					binding.initializer != null
				) {
					return classInstanceOwner(binding.initializer, next);
				}
			}
			return null;
		};
		const classExtendsDomElement = (classDeclaration) => {
			// A class extending a DOM element (`class Panel extends
			// HTMLElement`) inherits the real CSSOM accessor, so its
			// instances are not provable data carriers.
			for (const clause of classDeclaration.heritageClauses ?? []) {
				if (clause.token !== ts.SyntaxKind.ExtendsKeyword) {
					continue;
				}
				for (const heritageType of clause.types) {
					const expression = unwrapTransparentExpression(
						heritageType.expression,
					);
					if (
						expression != null &&
						ts.isIdentifier(expression) &&
						(expression.text === 'Element' ||
							expression.text.endsWith('Element'))
					) {
						return true;
					}
				}
			}
			return false;
		};
		// The identity of a `.style` member's owner (round-23 I1): a plain
		// object literal or an ordinary class instance is provably data; a
		// DOM-element-typed value is provably the CSSOM accessor; everything
		// else — a parameter, an import, a function result — is UNRESOLVED.
		const styleMemberOwnerKind = (owner) => {
			const resolvedOwner = resolvedStaticObject(owner);
			if (
				resolvedOwner != null &&
				ts.isObjectLiteralExpression(resolvedOwner)
			) {
				return 'plain-object';
			}
			const classDeclaration = classInstanceOwner(owner);
			if (
				classDeclaration != null &&
				!classExtendsDomElement(classDeclaration)
			) {
				return 'plain-object';
			}
			const identity = receiverIdentityFromTypeNames(
				typeAnnotationNames(owner),
			);
			return identity == null ? 'unresolved' : 'style-decl';
		};
		// Shared member-name decision for both spellings of a `.style`
		// member read: a resolved member that is not `style` is provably not
		// the CSSOM accessor; a `style` member's identity belongs to its
		// owner.
		const styleDeclarationReceiverKindForMember = (memberName, expression) => {
			if (memberName !== 'style') {
				return 'other';
			}
			return styleMemberOwnerKind(expression.expression);
		};
		// The receiver of a call — `element.style`, `el['style']`, `s`, `{ style }`
		// — is a CSSStyleDeclaration only when its identity is proven.
		// Returns 'style-decl' (proven CSSOM), 'plain-object' (proven
		// ordinary data), 'unresolved' (a computed member key the guard
		// cannot enumerate may be `style`, or the receiver's identity cannot
		// be proven either way — round-23 B1/I1), or 'other'.
		const styleDeclarationReceiverKind = (node, visited = new Set()) => {
			const expression = unwrapTransparentExpression(node);
			if (expression == null) {
				return 'other';
			}
			if (
				ts.isPropertyAccessExpression(expression) ||
				ts.isElementAccessExpression(expression)
			) {
				if (ts.isPropertyAccessExpression(expression)) {
					return styleDeclarationReceiverKindForMember(
						expression.name.text,
						expression,
					);
				}
				// A computed `.style` member goes through the funnel with all
				// three outcomes named (round-23 B1). An overflowing key is
				// UNRESOLVED: it is provably static text the guard cannot
				// enumerate, the member may be `style`, and the receiver may
				// be a CSSStyleDeclaration — the call cannot be waved through
				// as an ordinary unknown. A provably runtime key is the same
				// unprovable member question: it may be `style` at runtime.
				return staticString(
					expression.argumentExpression,
					(memberName) =>
						styleDeclarationReceiverKindForMember(memberName, expression),
					() => 'unresolved',
					() => 'unresolved',
				);
			}
			if (ts.isIdentifier(expression)) {
				if (visited.has(expression.text)) {
					// An alias cycle is unprovable, not provably benign
					// (round-23 I1).
					return 'unresolved';
				}
				const next = new Set(visited);
				next.add(expression.text);
				const binding = nearestBinding(expression, expression.text);
				if (binding != null && ts.isVariableDeclaration(binding)) {
					if (ts.isObjectBindingPattern(binding.name)) {
						const element = findBindingElement(binding.name, expression.text);
						// `const { style } = X;` — the receiver is `X.style`.
						if (element != null) {
							const memberName =
								element.propertyName?.text ??
								(element.name.kind === ts.SyntaxKind.Identifier
									? element.name.text
									: null);
							if (memberName !== 'style') {
								return 'other';
							}
							return binding.initializer == null
								? 'unresolved'
								: styleMemberOwnerKind(binding.initializer);
						}
						return 'other';
					}
					if (binding.initializer != null) {
						return styleDeclarationReceiverKind(binding.initializer, next);
					}
					return 'unresolved';
				}
				if (binding != null && ts.isParameter(binding)) {
					const identity = receiverIdentityFromTypeNames(
						namedTypeCandidates(binding.type),
					);
					if (identity === 'style-decl') {
						return 'style-decl';
					}
					if (identity === 'element') {
						// A DOM-element value has no `.style` chain question
						// here — the receiver itself is the value, and an
						// element is provably not a style declaration.
						return 'other';
					}
					return 'unresolved';
				}
				// An import or a global: identity unprovable either way.
				return 'unresolved';
			}
			return 'other';
		};
		// The method side of `X.bind(thisArg)` (round-23 I1): is X provably
		// `setProperty`? Returns 'setter-method' (the member is provably
		// `setProperty`), 'unresolved-method' (the member identity is
		// unprovable — the bound call may be a write), or 'other-method'.
		const cssSetterMethodKind = (node, visited = new Set()) => {
			const expression = unwrapTransparentExpression(node);
			if (expression == null) {
				return 'other-method';
			}
			if (ts.isPropertyAccessExpression(expression)) {
				return expression.name.text === 'setProperty'
					? 'setter-method'
					: 'other-method';
			}
			if (ts.isElementAccessExpression(expression)) {
				return staticString(
					expression.argumentExpression,
					(key) => (key === 'setProperty' ? 'setter-method' : 'other-method'),
					() => 'unresolved-method',
					() => 'unresolved-method',
				);
			}
			if (ts.isIdentifier(expression)) {
				if (visited.has(expression.text)) {
					return 'unresolved-method';
				}
				const next = new Set(visited);
				next.add(expression.text);
				const binding = nearestBinding(expression, expression.text);
				if (binding != null && ts.isVariableDeclaration(binding)) {
					if (ts.isObjectBindingPattern(binding.name)) {
						const element = findBindingElement(binding.name, expression.text);
						const boundMember =
							element?.propertyName?.text ??
							(element != null && element.name.kind === ts.SyntaxKind.Identifier
								? element.name.text
								: null);
						return boundMember === 'setProperty'
							? 'setter-method'
							: 'other-method';
					}
					if (binding.initializer != null) {
						return cssSetterMethodKind(binding.initializer, next);
					}
				}
				return 'unresolved-method';
			}
			return 'other-method';
		};
		// Classifies a `setProperty` call's callee over the aliased,
		// destructured, and bound spellings. Returns 'style-decl' (a real
		// CSSStyleDeclaration write), 'plain-object' (provably an unrelated
		// object's method — not a write), 'unresolved' (the receiver's
		// identity cannot be proven either way — loud at the sink), 'overflow'
		// (the method name is unresolvable — the receiver is a style
		// declaration, so the write cannot be ruled out), or 'other'.
		const cssStyleSetterCallKind = (node, visited = new Set()) => {
			const callee = unwrapTransparentExpression(node);
			if (callee == null) {
				return 'other';
			}
			if (ts.isCallExpression(callee)) {
				// A bound method alias: `X.bind(thisArg)`. The eventual
				// write's receiver is `thisArg` — the write reaches CSSOM
				// when `thisArg` is a style declaration, exactly as the
				// direct spelling does (round-23 I1; Chromium measured the
				// bound alias performing the real write).
				const boundAccess = unwrapTransparentExpression(callee.expression);
				if (
					boundAccess == null ||
					!ts.isPropertyAccessExpression(boundAccess) ||
					boundAccess.name.text !== 'bind'
				) {
					return 'other';
				}
				const methodKind = cssSetterMethodKind(boundAccess.expression, visited);
				if (methodKind === 'other-method') {
					return 'other';
				}
				if (methodKind === 'unresolved-method') {
					return 'unresolved';
				}
				return styleDeclarationReceiverKind(callee.arguments[0], visited);
			}
			if (ts.isPropertyAccessExpression(callee)) {
				if (callee.name.text !== 'setProperty') {
					return 'other';
				}
				return styleDeclarationReceiverKind(callee.expression, visited);
			}
			if (ts.isElementAccessExpression(callee)) {
				// The funnel names all three outcomes (round-23 B1): a
				// resolved method name decides the receiver; an overflowing
				// method name on a receiver the guard cannot rule out as a
				// style declaration stays loud; a provably runtime method
				// name stays in the declared runtime bucket.
				return staticString(
					callee.argumentExpression,
					(key) =>
						key !== 'setProperty'
							? 'other'
							: styleDeclarationReceiverKind(callee.expression, visited),
					() => {
						const receiverKind = styleDeclarationReceiverKind(
							callee.expression,
							visited,
						);
						return receiverKind === 'style-decl' ||
							receiverKind === 'unresolved'
							? 'overflow'
							: 'other';
					},
					() => 'other',
				);
			}
			if (ts.isIdentifier(callee)) {
				if (visited.has(callee.text)) {
					return 'other';
				}
				const next = new Set(visited);
				next.add(callee.text);
				const binding = nearestBinding(callee, callee.text);
				if (binding != null && ts.isVariableDeclaration(binding)) {
					if (ts.isObjectBindingPattern(binding.name)) {
						// `const { setProperty } = X;` — the destructured
						// method, UNBOUND: a bare call of a Web-IDL method
						// raises `TypeError: Illegal invocation` in the
						// browser and writes nothing, whatever X is, and a
						// data object's method writes to that object, never
						// to CSSOM (round-23 I1 — Chromium measured the
						// unbound destructured call throwing).
						return 'other';
					}
					if (binding.initializer != null) {
						return cssStyleSetterCallKind(binding.initializer, next);
					}
					return 'other';
				}
				if (binding != null && ts.isParameter(binding)) {
					const identity = receiverIdentityFromTypeNames(
						namedTypeCandidates(binding.type),
					);
					if (identity === 'style-decl') {
						return 'style-decl';
					}
				}
				// The callee's identity is unproven — a parameter, an import,
				// or a global like `String(...)`: the call is not provably
				// `setProperty` at all, so it is not provably a write. The
				// UNRESOLVED-loud rule applies to the *receiver* of a proven
				// `setProperty` member call (`handle.setProperty(...)`), not
				// to a bare identifier whose method identity the guard
				// cannot establish (round-23 I1).
				return 'other';
			}
			return 'other';
		};
		const recordScaleTokenDefinition = (name, node) => {
			if (name == null || !name.startsWith('--publy-z-')) {
				return;
			}
			violations.push({
				ruleId: 'z-index-scale-token-redefined',
				message:
					`script code redefines the reserved scale token \`${name}\` — ` +
					'define z-index tiers once in :root in src/styles/app.css.',
				file: relativePath,
				line: lineForOffset(content, node.getStart(sourceFile)),
				source: name,
			});
		};
		const recordScaleTokenDefinitionCandidates = (nameResult, node) => {
			// Returns whether a violation was recorded, so a caller that must
			// also be loud when nothing here fires (an UNRESOLVED receiver at
			// a setProperty sink, round-23 B1) knows the key analysis found
			// nothing to report.
			if (nameResult?.overflow) {
				violations.push({
					ruleId: 'z-index-static-candidate-overflow',
					message:
						`static scale-token write candidate space exceeds the guard's ` +
						`work budget of ${CARTESIAN_WORK_BUDGET} candidate ` +
						'characters — an unresolvable payload the guard cannot ' +
						'enumerate; simplify the property-name expression.',
					file: relativePath,
					line: lineForOffset(content, node.getStart(sourceFile)),
					source: node.getText(sourceFile),
				});
				return true;
			}
			const nameValues = nameResult?.values ?? null;
			if (nameValues == null) {
				return false;
			}
			for (const name of nameValues) {
				if (name.startsWith('--publy-z-')) {
					recordScaleTokenDefinition(name, node);
					return true;
				}
			}
			return false;
		};
		const visitScaleTokenDefinitions = (node) => {
			if (ts.isPropertyAssignment(node)) {
				if (ts.isComputedPropertyName(node.name)) {
					// A computed key is candidate-aware: `['--publy-z-' + x]`
					// writes the reserved namespace for every completion of
					// the partial key, so the first reserved candidate reds
					// even though the key never resolves to one exact name.
					recordScaleTokenDefinitionCandidates(
						staticStringValues(node.name.expression),
						node,
					);
				} else {
					recordScaleTokenDefinition(propertyName(node.name), node);
				}
			} else if (ts.isCallExpression(node)) {
				const setterKind = cssStyleSetterCallKind(node.expression);
				if (setterKind === 'style-decl' || setterKind === 'unresolved') {
					// A CSSOM write — however it is spelled (dot, bracket,
					// aliased receiver, or destructured method, round-21 I1)
					// — or a receiver the guard cannot rule out as one
					// (round-23 B1): the key is still a possible reserved
					// scale-token write.
					const reported = recordScaleTokenDefinitionCandidates(
						staticStringValues(node.arguments[0]),
						node,
					);
					if (setterKind === 'unresolved' && !reported) {
						// An UNRESOLVED receiver reached a setProperty sink
						// and the key analysis found nothing to report: the
						// call cannot be proven a CSSOM write and cannot be
						// proven not to be, so it must fail loud by name
						// instead of resolving to a compliant default
						// (round-23 B1 — absence of proof is not proof of
						// absence).
						violations.push({
							ruleId: 'z-index-cssom-write-unresolved',
							message:
								'a setProperty call receiver cannot be proven to be a ' +
								'CSSStyleDeclaration or proven not to be — the write ' +
								'cannot be ruled out; make the receiver provably ' +
								'ordinary data (a plain object or class field) or ' +
								'provably the DOM accessor.',
							file: relativePath,
							line: lineForOffset(content, node.getStart(sourceFile)),
							source: node.getText(sourceFile),
						});
					}
				} else if (setterKind === 'overflow') {
					// The receiver provably reaches a CSSStyleDeclaration and
					// the method name cannot be enumerated — it may be
					// `setProperty`, so the write cannot be ruled out
					// (round-21 B1).
					violations.push({
						ruleId: 'z-index-static-candidate-overflow',
						message:
							`static CSSOM write's method name candidate space exceeds ` +
							`the guard's work budget of ${CARTESIAN_WORK_BUDGET} ` +
							'candidate characters — it may be `setProperty` on a ' +
							'CSSStyleDeclaration; simplify the method-name expression.',
						file: relativePath,
						line: lineForOffset(content, node.getStart(sourceFile)),
						source: node.getText(sourceFile),
					});
				}
				// 'plain-object' (an unrelated object's method, provably not a
				// CSSOM write) and 'other' (not identified as a setProperty
				// call) stay green — the spelling alone reds nothing.
			}
			node.forEachChild(visitScaleTokenDefinitions);
		};
		if (checkBuildReachableScript) {
			visitScaleTokenDefinitions(sourceFile);
		}
	}

	return violations;
};

// ---------------------------------------------------------------------------
// Component 4 — the compiled CSS gate. Every `z-index:` declaration in the
// production-equivalent build output must resolve through `var(--publy-z-…)`
// or be a non-numeric keyword, unless it is the one explicitly allowlisted
// raw declaration. Declarations are *parsed*, not regex-matched: the property
// name is canonicalised (CSS is ASCII-case-insensitive and may carry escapes,
// so `Z-INDEX: 50` and `z-\69ndex: 50` are the same declaration), the optional
// `!important` is normalised, and each declaration is attributed to its full
// rule/at-rule ancestry so the allowlist can bind to one exact CSS context.
// ---------------------------------------------------------------------------
// The one raw `z-index:` declaration in app.css is deliberate: the sticky
// table header. `.publy-table-card`'s `overflow: hidden` does NOT establish a
// stacking context (it only clips), so the header's `z-index: 5` competes in
// the page-level stacking context — which is exactly why the value must stay
// below every scale tier: `--publy-z-raised` is 10, so nothing scale-routed
// collides. The header needs *some* z-index because the sticky cells are
// earlier in DOM order than the body rows they scroll over, and a later,
// painted body cell would otherwise cover them; the value just needs to be
// above those rows and below every tier. Inventing a scale tier for a single
// internal rule would widen the scale for no architectural gain. This is the
// documented out-of-scope bucket for raw CSS declarations — it is seen here,
// named, bound to its exact selector list and expected occurrence count, and
// reasoned about, not silently ignored.
export const KNOWN_RAW_Z_INDEX_DECLARATIONS: KnownRawZIndexDeclaration[] = [
	{
		ancestors: [{ type: 'at-rule', name: 'layer', params: 'components' }],
		selector:
			".publy-data-table thead [data-slot='table-column'], " +
			".publy-data-table thead [data-slot='table-sortable-column-header'], " +
			".publy-data-table thead [data-slot='table-selection-cell']",
		declaration: 'z-index: 5',
		count: 1,
		reason:
			'.publy-data-table thead sticky cells: lifted above the scrolled body rows ' +
			'inside the table scroll container, deliberately below --publy-z-raised: 10 ' +
			'(the card does not create a stacking context). Bound to this exact @layer ' +
			'ancestry, selector list, and expected occurrence count, so a raw z-index: 5 ' +
			'anywhere else reds.',
	},
];

const KNOWN_EMITTED_RAW_Z_INDEX_DECLARATIONS: KnownRawZIndexDeclaration[] = [
	{
		...KNOWN_RAW_Z_INDEX_DECLARATIONS[0],
		selector:
			'.publy-data-table thead [data-slot=table-column],' +
			'.publy-data-table thead [data-slot=table-sortable-column-header],' +
			'.publy-data-table thead [data-slot=table-selection-cell]',
	},
];

const normalizeWhitespace = (text: string): string =>
	text.replace(/[\t\n\f\r ]+/g, ' ').trim();

const stripImportant = (value: string): string => {
	const bang = value.lastIndexOf('!');
	if (bang === -1) {
		return value.trim();
	}
	const identifier = value.slice(bang + 1).trim();
	if (canonicaliseCssProperty(identifier) !== 'important') {
		return value.trim();
	}
	return value.slice(0, bang).trim();
};

const describeCssContainer = (node: PostcssNode): CssContainerDescription => {
	if (node.type === 'rule') {
		return {
			type: 'rule',
			selector: normalizeWhitespace(node.selector),
		};
	}
	return {
		type: 'at-rule',
		name: canonicaliseCssProperty(node.name),
		params: normalizeWhitespace(node.params),
	};
};

const cssAncestorsFor = (declaration: PostcssNode): CssContainerDescription[] => {
	const ancestors: CssContainerDescription[] = [];
	let node: PostcssNode | null | undefined =
		declaration.parent?.type === 'rule'
			? declaration.parent.parent
			: declaration.parent;
	while (node != null && node.type !== 'root') {
		ancestors.unshift(describeCssContainer(node));
		node = node.parent;
	}
	return ancestors;
};

const cssAncestorsEqual = (
	left: CssContainerDescription[],
	right: CssContainerDescription[],
): boolean =>
	JSON.stringify(left) === JSON.stringify(right);

// Parse the compiled stylesheet with a CSS grammar and return each real
// declaration. PostCSS keeps comment syntax, nested rules, at-rules, and
// component-value braces distinct, so declaration ownership comes from the
// AST instead of delimiter counting.
const scanCssDeclarations = (root: PostcssRoot): ScannedCssDeclaration[] => {
	const declarations: ScannedCssDeclaration[] = [];
	root.walkDecls((declaration) => {
		const rule = declaration.parent;
		declarations.push({
			ancestors: cssAncestorsFor(declaration),
			decodedProperty: decodeCssIdentifier(declaration.prop),
			selector: rule?.type === 'rule' ? normalizeWhitespace(rule.selector) : '',
			property: canonicaliseCssProperty(declaration.prop),
			value: declaration.value.trim(),
			line: declaration.source?.start?.line ?? 1,
		});
	});
	return declarations;
};

const isGlobalScaleDefinition = (
	declaration: ScannedCssDeclaration,
	emitted: boolean,
): boolean => {
	if (declaration.selector === ':root' && declaration.ancestors.length === 0) {
		return true;
	}
	return (
		(declaration.selector === ':root, :host' ||
			(emitted && declaration.selector === ':root,:host')) &&
		cssAncestorsEqual(declaration.ancestors, [
			{ type: 'at-rule', name: 'layer', params: 'theme' },
		])
	);
};

const findReservedScaleTokenRegistrations = (
	root: PostcssRoot,
	sourceName: string,
): ZIndexViolation[] => {
	const violations: ZIndexViolation[] = [];
	root.walkAtRules((atRule) => {
		if (canonicaliseCssProperty(atRule.name) !== 'property') {
			return;
		}
		const property = decodeCssIdentifier(atRule.params.trim());
		if (!property.startsWith('--publy-z-')) {
			return;
		}
		const source = `@property ${property}`;
		violations.push({
			ruleId: 'z-index-scale-token-registered',
			message:
				`reserved scale token registration \`${source}\` can replace its ` +
				'inherited tier value — the --publy-z-* namespace must not be ' +
				'registered with @property.',
			file: sourceName,
			line: atRule.source?.start?.line ?? 1,
			source,
		});
	});
	return violations;
};

export const checkCompiledCssZIndex = (
	compiledCss: string,
	allowlisted: readonly KnownRawZIndexDeclaration[] = KNOWN_RAW_Z_INDEX_DECLARATIONS,
	sourceName = 'compiled stylesheet',
	{
		emitted = false,
		scaleDefinitionCounts = new Map(),
		canonicalScaleTokens = null,
		allowlistCounts = new Map(),
	}: {
		emitted?: boolean;
		scaleDefinitionCounts?: Map<string, number>;
		canonicalScaleTokens?: ReadonlySet<string> | null;
		allowlistCounts?: Map<string, number>;
	} = {},
): ZIndexViolation[] => {
	const effectiveCanonicalScaleTokens =
		canonicalScaleTokens ?? DEFAULT_CANONICAL_SCALE_TOKENS;
	const root = postcss.parse(compiledCss, { from: undefined });
	const violations = findReservedScaleTokenRegistrations(root, sourceName);
	root.walkAtRules((atRule) => {
		if (canonicaliseCssProperty(atRule.name) !== 'import') {
			return;
		}
		const source = `@import ${atRule.params};`;
		violations.push({
			ruleId: 'z-index-residual-css-import',
			message:
				`shipped residual \`${source}\` cannot be inspected by the z-index ` +
				'guard — every CSS import must resolve into the emitted asset.',
			file: sourceName,
			line: atRule.source?.start?.line ?? 1,
			source,
		});
	});
	for (const declaration of scanCssDeclarations(root)) {
		if (declaration.decodedProperty.startsWith('--publy-z-')) {
			const source = `${declaration.decodedProperty}: ${declaration.value}`;
			if (!isGlobalScaleDefinition(declaration, emitted)) {
				violations.push({
					ruleId: 'z-index-scale-token-redefined',
					message:
						`shipped \`${source}\` outside the global scale — define ` +
						'z-index tiers once in :root in src/styles/app.css.',
					file: sourceName,
					line: declaration.line,
					source,
				});
				continue;
			}
			if (!effectiveCanonicalScaleTokens.has(declaration.decodedProperty)) {
				violations.push({
					ruleId: 'z-index-scale-token-unowned',
					message:
						`shipped scale tier \`${source}\` has no canonical definition in ` +
						'src/styles/app.css — dependencies and generated CSS cannot add to ' +
						'the reserved --publy-z-* namespace.',
					file: sourceName,
					line: declaration.line,
					source,
				});
				continue;
			}
			const count =
				(scaleDefinitionCounts.get(declaration.decodedProperty) ?? 0) + 1;
			scaleDefinitionCounts.set(declaration.decodedProperty, count);
			if (count > 1) {
				violations.push({
					ruleId: 'z-index-scale-token-duplicate',
					message:
						`shipped duplicate scale tier \`${source}\` — each reserved ` +
						'token must be defined exactly once.',
					file: sourceName,
					line: declaration.line,
					source,
				});
			}
			continue;
		}
		if (declaration.property !== 'z-index') {
			continue;
		}
		const value = stripImportant(declaration.value);
		const shipped = `z-index: ${value}`;
		const scaleToken = scaleVarReferenceToken(value);
		if (scaleToken != null && effectiveCanonicalScaleTokens.has(scaleToken)) {
			continue;
		}
		if (isNonStackingKeyword(value)) {
			continue;
		}
		const selector = normalizeWhitespace(declaration.selector);
		const allowance = allowlisted.find(
			(entry) =>
				entry.declaration === shipped &&
				cssAncestorsEqual(entry.ancestors ?? [], declaration.ancestors) &&
				normalizeWhitespace(entry.selector) === selector,
		);
		if (allowance != null) {
			const key = JSON.stringify([
				allowance.ancestors ?? [],
				allowance.selector,
				allowance.declaration,
			]);
			const count = (allowlistCounts.get(key) ?? 0) + 1;
			allowlistCounts.set(key, count);
			if (count <= allowance.count) {
				continue;
			}
		}
		violations.push({
			ruleId: 'z-index-declaration-not-on-scale',
			message:
				`shipped \`${shipped}\`${selector ? ` in \`${selector}\`` : ''} does not ` +
				'resolve through var(--publy-z-…) — every z-index in the built ' +
				'stylesheet must route through the scale. If a dependency owns ' +
				'this declaration, extend KNOWN_RAW_Z_INDEX_DECLARATIONS in ' +
				'apps/front/scripts/guards/check-zindex-guard.mts only after review.',
			file: sourceName,
			line: declaration.line,
			source: shipped,
		});
	}
	return violations;
};

export const checkAuthoredCssScaleDefinitions = ({
	css,
	relativePath,
	isCanonicalAppCss,
}: {
	css: string;
	relativePath: string;
	isCanonicalAppCss: boolean;
}): ZIndexViolation[] => {
	let root;
	try {
		root = postcss.parse(css, { from: undefined });
	} catch (error) {
		// An authored CSS file the build ships but the guard cannot parse is
		// reported as opaque — never a crash, never a silent pass.
		return [
			{
				ruleId: 'z-index-unparseable-static-css',
				message:
					`authored CSS in ${relativePath} cannot be parsed as CSS ` +
					`(${cssParseFailureReason(error)}) — the guard cannot inspect ` +
					'what ships; fix the payload or import the stylesheet through ' +
					'the build graph.',
				file: relativePath,
				line: 1,
				source: css.slice(0, 120),
			},
		];
	}
	const violations = findReservedScaleTokenRegistrations(root, relativePath);
	const seenCanonicalTokens = new Set();
	root.walkDecls((declaration) => {
		const property = decodeCssIdentifier(declaration.prop);
		if (!property.startsWith('--publy-z-')) {
			return;
		}
		const source = `${property}: ${declaration.value.trim()}`;
		const selector =
			declaration.parent?.type === 'rule'
				? normalizeWhitespace(declaration.parent.selector)
				: '';
		const isCanonicalDefinition =
			isCanonicalAppCss &&
			selector === ':root' &&
			cssAncestorsFor(declaration).length === 0;
		if (!isCanonicalDefinition) {
			violations.push({
				ruleId: 'z-index-scale-token-redefined',
				message:
					`authored \`${source}\` does not originate in a top-level ` +
					'`:root` in src/styles/app.css.',
				file: relativePath,
				line: declaration.source?.start?.line ?? 1,
				source,
			});
			return;
		}
		if (seenCanonicalTokens.has(property)) {
			violations.push({
				ruleId: 'z-index-scale-token-duplicate',
				message:
					`authored duplicate scale tier \`${source}\` — each reserved ` +
					'token must be defined exactly once in src/styles/app.css.',
				file: relativePath,
				line: declaration.source?.start?.line ?? 1,
				source,
			});
			return;
		}
		seenCanonicalTokens.add(property);
	});
	return violations;
};

const findCanonicalScaleTokens = (css: string): Set<string> => {
	const root = postcss.parse(css, { from: undefined });
	const tokens = new Set<string>();
	root.walkDecls((declaration) => {
		const property = decodeCssIdentifier(declaration.prop);
		const selector =
			declaration.parent?.type === 'rule'
				? normalizeWhitespace(declaration.parent.selector)
				: '';
		if (
			property.startsWith('--publy-z-') &&
			selector === ':root' &&
			cssAncestorsFor(declaration).length === 0
		) {
			tokens.add(property);
		}
	});
	return tokens;
};

// Helper-level scans are fail-closed too: when a caller does not provide a
// build-specific set, use the canonical production scale rather than accepting
// every spelling in the reserved namespace. Full guard runs still pass the
// configured app.css set explicitly, which keeps isolated fixture roots exact.
const DEFAULT_CANONICAL_SCALE_TOKENS = findCanonicalScaleTokens(
	readFileSync(appCssPath, 'utf8'),
);

const collectCssPaths = async (
	directory,
	excludedDirectoryNames = new Set(),
) => {
	const cssPaths = [];
	const visit = async (currentDirectory) => {
		const entries = await readdir(currentDirectory, { withFileTypes: true });
		for (const entry of entries) {
			const entryPath = path.join(currentDirectory, entry.name);
			if (entry.isDirectory()) {
				if (excludedDirectoryNames.has(entry.name)) {
					continue;
				}
				await visit(entryPath);
			} else if (
				entry.isFile() &&
				asciiLowerCase(entry.name).endsWith('.css')
			) {
				cssPaths.push(entryPath);
			}
		}
	};
	try {
		await visit(directory);
	} catch (error) {
		if (error?.code === 'ENOENT') {
			return [];
		}
		throw error;
	}
	return cssPaths.sort((left, right) => left.localeCompare(right));
};

// ---------------------------------------------------------------------------
// THE single module classifier. Every "is this module id a raw/inline CSS
// module, and which file is it" answer in the guard is decided here — and
// nowhere else. The guarantee is structural — a second classifier would be a
// second mechanism — but the fixture suite asserts it behaviourally, not by
// scanning this file's source (round-16 B1, round-19 B2): both ID shapes of
// one file (`?raw`, `?url`, `?v=1?raw`, `?v=2?raw`) feed the real
// classification path and classify exactly as Vite observes them, and the
// script pass maps a specifier to its recorded full module ID so a `?url`
// sibling of a `?raw` module is provably a distinct Vite module. A behavioral
// pin is finite: it proves the pinned shapes, never that every imaginable
// second classifier reddens it — a divergence in an unexercised spelling that
// changes a Vite-observable answer must be caught by adding that spelling to
// the fixture suite, not by a source-regex stand-in (round-21 I3).
//
// The classification is not a re-implementation of Vite's raw rule. It reads
// three things the build itself produced:
//   - `code` — the module's transform result. A `?raw` module is rewritten by
//     Vite's own `vite:asset` load hook into the exact raw-export shape
//     `export default "<bytes>"`, and no other loader produces that shape;
//     `?inline`/`?raw` CSS is rewritten into the same shape by vite:css and
//     vite:asset, while plain CSS becomes an empty JS module (the CSS text is
//     the emitted asset). The multi-query spelling `./x.txt?v=1?raw` is raw
//     because Vite says so — the shape is identical to `?raw`, and this
//     function never re-tests the query text to find out.
//   - `meta` — the module info Vite recorded for the id. `?url`/asset modules
//     carry Vite's own `vite:asset` marker and export a URL, never the raw
//     text, so they are never mistaken for raw text modules.
//   - `assetPluginLoad` — the set of ids this guard's post-order `load` hook
//     observed, i.e. exactly the ids `vite:asset`'s load hook did NOT claim.
//     A module `vite:asset` claimed (raw or url) is invisible to post-order
//     load; a module it did not claim (a script whose own source is literally
//     `export default "…"`, a JSON module, CSS, …) is visible. The claim
//     separates the raw-export shape produced by `vite:asset`'s raw load from
//     the same shape produced by an ordinary module.
//
// The file part is extracted with Vite's own `cleanUrl` semantics — strip
// from the first `?` or `#` — because that is exactly the file `vite:asset`
// itself reads for a raw/url module. A legal specifier may contain further
// `?` inside its query (`?v=1?raw`); the strip must not care, and Vite never
// does. `hasQuery` is a side output — whether the id carries a query at all —
// so the script pass can tell a specifier that *might* be queried from one
// that is plainly a bare path, without ever parsing the query itself; the
// raw/inline answer still comes from the build's record alone.
export const classifyModuleKind = (
	id: string,
	{
		code,
		meta,
		assetPluginLoad,
	}: {
		code?: string;
		meta?: Record<string, unknown>;
		assetPluginLoad?: ReadonlySet<string>;
	} = {},
): ModuleClassification => {
	const filePath = id.replace(/[?#].*$/s, '');
	const hasQuery = id.includes('?') || id.includes('#');
	if (!path.isAbsolute(filePath)) {
		return { filePath, hasQuery, kind: 'other' };
	}
	if (isCSSRequest(id)) {
		// CSS-language module: the authored file is always recorded for the
		// scale-integrity gate. Plain CSS ships its text as an emitted asset
		// (its JS module is empty after vite:css), `?url` CSS ships a URL to
		// that asset (Vite's own marker), and `?inline`/`?raw` CSS ships its
		// text as JS — vite:css inlines the former and vite:asset's raw load
		// provides the latter, both as the raw-export shape — so the authored
		// bytes are walked by the inline gate. The two spellings are
		// deliberately one kind: their authored text is walked identically.
		let kind = 'css';
		if (meta?.['vite:asset'] === true) {
			kind = 'css-url';
		} else if (typeof code === 'string' && code.startsWith('export default ')) {
			kind = 'inline-css';
		}
		return { filePath, hasQuery, kind };
	}
	if (meta?.['vite:asset'] === true) {
		return { filePath, hasQuery, kind: 'url-asset' };
	}
	if (
		typeof code === 'string' &&
		code.startsWith('export default ') &&
		assetPluginLoad != null &&
		!assetPluginLoad.has(id)
	) {
		return { filePath, hasQuery, kind: 'raw' };
	}
	if (SCRIPT_EXTENSIONS.has(path.extname(filePath))) {
		return { filePath, hasQuery, kind: 'script' };
	}
	return { filePath, hasQuery, kind: 'other' };
};

// Resolves a raw import specifier's file part (already stripped by the single
// classifier) against the project root: `~/` aliases the `src/` directory,
// Vite root-absolute specifiers (`/src/…`) resolve against the project root
// (not the filesystem root), and everything else resolves relative to the
// importing module.
const resolveRawSpecifierPath = (withoutQuery, importerRelativePath, root) => {
	let rawPath;
	if (withoutQuery.startsWith('~/')) {
		rawPath = path.resolve(root, 'src', withoutQuery.slice(2));
	} else if (withoutQuery.startsWith('/')) {
		rawPath = path.resolve(root, withoutQuery.slice(1));
	} else {
		rawPath = path.resolve(
			root,
			path.dirname(importerRelativePath),
			withoutQuery,
		);
	}
	return path.resolve(rawPath);
};

// Resolves a raw import specifier to its full module ID — the resolved file
// path plus its query string (`./x.txt?v=1?raw` → `/abs/x.txt?v=1?raw`). The
// build records raw provenance per module ID, not per file path (round-19 I1):
// two distinct IDs for the same file (`?raw` and `?url`) are different modules,
// so the script pass must compare the full ID, never the collapsed path — a
// `?url` import of a file that is also `?raw`-imported is provably not raw text
// and stays quiet. The query is the part after the first `?` or `#`, the same
// character the single classifier strips.
const resolveRawSpecifierId = (specifier, importerRelativePath, root) => {
	const classified = classifyModuleKind(specifier, {});
	const resolvedPath = resolveRawSpecifierPath(
		classified.filePath,
		importerRelativePath,
		root,
	);
	const queryIndex = specifier.search(/[?#]/);
	const query = queryIndex === -1 ? '' : specifier.slice(queryIndex);
	return resolvedPath + query;
};

// The recorded raw-binding record of one script file: every binding a static
// import declaration can introduce, for the recorded `?raw` modules — the
// default clause, the namespace clause, named elements (`{ default as x }` is
// the default under another spelling), and mixed spellings
// (`import d, * as ns`) — each clause recorded, never one branch of an
// else-if (round-15 B2). Whether an import IS a raw import is never
// re-derived from the specifier text (round-16 B1): the specifier resolves to
// a file path through the single classifier, and the binding exists only when
// the build's provenance record contains that path — `?v=1?raw` is raw
// because the build transformed it as raw and recorded the file, exactly like
// any other spelling. With per-ID provenance (round-19 I1) the record
// contains the full module ID — path plus query — and the binding exists only
// when that exact ID is recorded, so a `?url` sibling of a `?raw` module for
// the same file is a distinct module and provably not raw text. `kind` tells
// the walk what each binding provably ships:
// the default text, a namespace object readable through `.default`, or — for
// a named element that is not `default` — nothing at all (undefined on a raw
// module, recorded by name so shadowing resolution stays exact, green by name
// rather than by omission). Exported so the fixture suite can assert the
// record itself (round-16 I3 — "recorded by name" must be observable, not
// claimed).
export const collectRawImportBindings = (
	sourceFile,
	{ relativePath, baseDir, rawTextPaths, rawTextIds = null, queriedPaths },
) => {
	const bindings = new Map();
	if (baseDir == null || rawTextPaths == null) {
		return bindings;
	}
	// Per-ID provenance (round-19 I1): the build records full module IDs
	// (path + query), and the script pass compares the specifier's full ID.
	// When the record is present, an ID is raw only if THAT exact ID is
	// recorded — a `?url` sibling of a `?raw` module for the same file is a
	// different module and provably not raw text. Unit fixtures that only
	// carry path provenance fall back to the path, which is the historical
	// collapse those fixtures do not exercise.
	const recordIds = rawTextIds ?? new Set();
	const isRecordedRawBy = (specifier) =>
		rawTextIds == null
			? rawTextPaths.has(
					resolveRawSpecifierPath(
						classifyModuleKind(specifier, {}).filePath,
						relativePath,
						baseDir,
					),
				)
			: recordIds.has(resolveRawSpecifierId(specifier, relativePath, baseDir));
	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement)) {
			continue;
		}
		const specifier = statement.moduleSpecifier?.text ?? '';
		const classified = classifyModuleKind(specifier, {});
		const resolvedPath = resolveRawSpecifierPath(
			classified.filePath,
			relativePath,
			baseDir,
		);
		const isRecordedRaw = isRecordedRawBy(specifier);
		// The record is the source of truth, never the specifier text. When
		// the resolved file is NOT a recorded raw module, a specifier that
		// carries a query whose file appears in NO build record at all is an
		// import the guard cannot map — a spelling the build resolved
		// differently (an alias, a symlink, a normalization difference).
		// Such an import may still be a raw one whose bytes ship unread,
		// exactly the round-15 class that failed loud by name, so it is
		// recorded as an unresolvable-query binding and the sink walk
		// reports it (round-17 hard-rule audit). A queried file the build
		// DID record — under any query — is provably not raw text and stays
		// quiet.
		const isUnresolvableQuery =
			!isRecordedRaw &&
			classified.hasQuery &&
			queriedPaths != null &&
			!queriedPaths.has(resolvedPath);
		if (!isRecordedRaw && !isUnresolvableQuery) {
			continue;
		}
		const recordBinding = (name, kind, declaration) => {
			bindings.set(name, { specifier, declaration, kind });
		};
		const importClause = statement.importClause;
		if (importClause == null) {
			continue;
		}
		if (importClause.name != null && ts.isIdentifier(importClause.name)) {
			// The binding node `nearestBinding` resolves to for a default
			// import is the import clause itself.
			recordBinding(importClause.name.text, 'default', importClause);
		}
		const namedBindings = importClause.namedBindings;
		if (namedBindings != null && ts.isNamespaceImport(namedBindings)) {
			recordBinding(namedBindings.name.text, 'namespace', namedBindings);
		} else if (namedBindings != null && ts.isNamedImports(namedBindings)) {
			for (const element of namedBindings.elements) {
				const importedName =
					element.propertyName == null
						? element.name.text
						: element.propertyName.text;
				recordBinding(
					element.name.text,
					importedName === 'default' ? 'default' : 'named-non-default',
					element,
				);
			}
		}
	}
	return bindings;
};

export const buildProductionApp = async (
	baseDir: string,
): Promise<ProductionBuildResult> => {
	const emittedCssRoot = await mkdtemp(
		path.join(tmpdir(), 'publy-zindex-guard-'),
	);
	activeBuildDirectories.add(emittedCssRoot);
	const authoredCssPaths = new Set();
	const authoredScriptPaths = new Set();
	const inlineCssPaths = new Set();
	const rawTextPaths = new Set();
	// Per-ID raw provenance (round-19 I1): the full module IDs (path + query)
	// the build transformed as raw. Two distinct IDs for the same file (`?raw`
	// and `?url`) are different modules and must not share a raw answer, so
	// the script pass consults this set by full ID rather than the collapsed
	// `rawTextPaths`. `rawTextPaths` is kept for byte reading (the same file
	// bytes are read under any query).
	const rawTextIds = new Set();
	// Every module id the build transformed under a query, keyed by its file
	// part. The script pass consults it to tell a queried specifier the guard
	// cannot map to any record (an alias spelling — loud by name) from a
	// queried module the build did record under a non-raw query (`?url`,
	// `?v=1`, … — provably not raw text, quiet).
	const queriedPaths = new Set();
	// Ids this guard's post-order `load` hook observed: exactly the modules
	// Vite's own `vite:asset` load hook did NOT claim (raw/url/asset modules
	// are invisible to post-order load). The classifier reads this set to tell
	// the raw-export transform shape produced by vite:asset's raw load from
	// the same shape produced by an ordinary module (round-16 B1).
	const assetPluginLoad = new Set();
	const provenancePlugin = {
		name: 'publy-zindex-css-provenance',
		enforce: 'post',
		transform(code, id) {
			// The post-order transform result is Vite's own classification of
			// the module — raw modules arrive as the exact raw-export shape
			// vite:asset's load produced, plain CSS as an empty module,
			// `?inline`/`?raw` CSS as the inlined raw-export shape — so the
			// record is the build's answer, never a re-parse of the id.
			const { filePath, kind, hasQuery } = classifyModuleKind(id, {
				code,
				meta: this.getModuleInfo(id)?.meta,
				assetPluginLoad,
			});
			if (hasQuery) {
				queriedPaths.add(path.resolve(filePath));
			}
			if (kind === 'css' || kind === 'inline-css' || kind === 'css-url') {
				authoredCssPaths.add(path.resolve(filePath));
			}
			if (kind === 'inline-css') {
				// `?inline` / `?raw` on CSS ships the CSS text as JS rather
				// than as an emitted asset, so the emitted gate never sees it.
				// The authored file is walked directly by the inline gate.
				inlineCssPaths.add(path.resolve(filePath));
			}
			if (kind === 'raw') {
				// `?raw` ships the raw text of *any* file as JS, and that text
				// can be CSS even when the extension is not a CSS language
				// (`.txt`?raw is the documented case). Record every raw module
				// the build transforms; the script pass resolves each raw
				// import binding to one of these paths and walks its bytes
				// only when the binding reaches a style-capable sink. The
				// full module ID is recorded separately so a `?url` sibling of
				// the same file is not mistaken for raw text (round-19 I1).
				rawTextPaths.add(path.resolve(filePath));
				rawTextIds.add(id);
			}
			if (kind === 'script') {
				authoredScriptPaths.add(path.resolve(filePath));
			}
			return null;
		},
		load(id) {
			// Fires exactly for the modules vite:asset did not claim. Returns
			// null so the load result is unchanged; the observation is the
			// only purpose.
			assetPluginLoad.add(id);
			return null;
		},
	};
	try {
		// Build every environment exactly as `vite build` does — for the shipped
		// TanStack Start app that is the client bundle *and* the SSR bundle, so
		// SSR-only modules (src/server.ts and friends) are recorded as build
		// provenance and reach the script pass. `createBuilder` is the Vite
		// public (experimental) multi-environment builder API.
		const builder = await createBuilder({
			root: baseDir,
			logLevel: 'silent',
			plugins: [provenancePlugin],
			build: {
				emptyOutDir: true,
				outDir: emittedCssRoot,
			},
		});
		await builder.buildApp();
	} catch (error) {
		await rm(emittedCssRoot, { recursive: true, force: true });
		activeBuildDirectories.delete(emittedCssRoot);
		throw error;
	}
	return {
		emittedCssRoot,
		authoredCssPaths: [...authoredCssPaths],
		authoredScriptPaths: [...authoredScriptPaths],
		inlineCssPaths: [...inlineCssPaths],
		rawTextPaths: [...rawTextPaths],
		rawTextIds: [...rawTextIds],
		queriedPaths: [...queriedPaths],
		cleanup: () => {
			activeBuildDirectories.delete(emittedCssRoot);
			return rm(emittedCssRoot, { recursive: true, force: true });
		},
	};
};

const isPathInside = (directory, filePath) => {
	const relativePath = path.relative(directory, filePath);
	return (
		relativePath !== '' &&
		!relativePath.startsWith(`..${path.sep}`) &&
		!path.isAbsolute(relativePath)
	);
};

const cssImportSpecifier = (params) => {
	const trimmed = params.trim();
	const quoted = trimmed.match(/^(?:"([^"]+)"|'([^']+)')/);
	if (quoted != null) {
		return quoted[1] ?? quoted[2];
	}
	const url = trimmed.match(/^url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/i);
	return url == null ? null : (url[1] ?? url[2] ?? url[3]);
};

const collectReachableAuthoredCssPaths = async (
	baseDir: string,
	entryPaths: ReadonlyArray<string>,
): Promise<string[]> => {
	const queuedPaths: string[] = [];
	const reachablePaths = new Set<string>();
	const addPath = (filePath) => {
		const absolutePath = path.resolve(filePath);
		if (
			reachablePaths.has(absolutePath) ||
			!isPathInside(baseDir, absolutePath) ||
			path
				.relative(baseDir, absolutePath)
				.split(path.sep)
				.includes('node_modules')
		) {
			return;
		}
		reachablePaths.add(absolutePath);
		queuedPaths.push(absolutePath);
	};
	for (const entryPath of entryPaths) {
		addPath(entryPath);
	}
	for (let index = 0; index < queuedPaths.length; index += 1) {
		const cssPath = queuedPaths[index];
		const css = await readFile(cssPath, 'utf8');
		let root;
		try {
			root = postcss.parse(css, { from: undefined });
		} catch {
			// The authored file itself is still checked by
			// `checkAuthoredCssScaleDefinitions`; only its (unreadable) import
			// chain is skipped here.
			continue;
		}
		root.walkAtRules((atRule) => {
			if (canonicaliseCssProperty(atRule.name) !== 'import') {
				return;
			}
			const specifier = cssImportSpecifier(atRule.params);
			if (specifier == null || !specifier.startsWith('.')) {
				return;
			}
			// The file part comes from the single classifier — the same
			// cleanUrl semantics the build uses — so a query on the @import
			// target cannot diverge from the module-id reading.
			const withoutQuery = classifyModuleKind(specifier, {}).filePath;
			if (!isCSSRequest(withoutQuery)) {
				return;
			}
			addPath(path.resolve(path.dirname(cssPath), withoutQuery));
		});
	}
	return [...reachablePaths].sort((left, right) => left.localeCompare(right));
};

const buildAssetDisplayPath = (baseDir, emittedCssRoot, cssPath) => {
	if (isPathInside(baseDir, cssPath)) {
		return path.relative(baseDir, cssPath);
	}
	return path.join('emitted', path.relative(emittedCssRoot, cssPath));
};

// ---------------------------------------------------------------------------
// CLI run — derives the production sources from app.css, scans every file the
// production scanner would scan, then gates on the compiled output.
// ---------------------------------------------------------------------------
export const runZIndexGuard = async ({
	baseDir = rootDir,
	appCssPath: configuredAppCssPath = appCssPath,
	productionBuild = () => buildProductionApp(baseDir),
}: {
	baseDir?: string;
	appCssPath?: string;
	productionBuild?: (baseDir: string) => Promise<ProductionBuildResult>;
} = {}): Promise<ZIndexGuardRunResult> => {
	const css = await readFile(configuredAppCssPath, 'utf8');
	const cssDir = path.dirname(configuredAppCssPath);
	const compiler = await compile(css, { base: cssDir, onDependency: () => {} });
	let sources: Array<{ base: string; pattern: string; negated: boolean }>;
	if (compiler.root === 'none') {
		sources = [];
	} else if (compiler.root === null) {
		sources = [{ base: cssDir, pattern: '**/*', negated: false }];
	} else {
		sources = [{ ...compiler.root, negated: false }];
	}
	sources = sources.concat(compiler.sources);
	const scanner = new Scanner({ sources });
	const allCandidates = scanner.scan();

	if (scanner.files.length === 0) {
		throw new Error(
			'z-index guard scanned 0 files — the Tailwind source globs resolved to ' +
				'nothing, so a pass would be vacuous. Check `source(../)` in app.css.',
		);
	}

	const buildResult = await productionBuild();
	const cleanup = buildResult?.cleanup ?? (async () => {});
	try {
		if (
			buildResult?.emittedCssRoot == null ||
			!Array.isArray(buildResult.authoredCssPaths) ||
			!Array.isArray(buildResult.authoredScriptPaths) ||
			(buildResult.inlineCssPaths != null &&
				!Array.isArray(buildResult.inlineCssPaths)) ||
			(buildResult.rawTextPaths != null &&
				!Array.isArray(buildResult.rawTextPaths)) ||
			(buildResult.rawTextIds != null &&
				!Array.isArray(buildResult.rawTextIds)) ||
			(buildResult.queriedPaths != null &&
				!Array.isArray(buildResult.queriedPaths))
		) {
			throw new Error(
				'z-index guard productionBuild must return the exact emittedCssRoot and ' +
					'authored CSS/script paths from this build invocation.',
			);
		}
		const violations = [];
		const canonicalScaleTokens = findCanonicalScaleTokens(css);
		const productionCandidates = new Set(allCandidates);
		for (const file of scanner.files) {
			const content = await readFile(file, 'utf8');
			const relativePath = path.relative(baseDir, file);
			violations.push(
				...scanZIndexFile({
					scanner,
					relativePath,
					content,
					productionCandidates,
					canonicalScaleTokens,
					checkBuildReachableScript: false,
				}),
			);
		}
		const authoredScriptPaths = buildResult.authoredScriptPaths
			.map((filePath) => path.resolve(filePath))
			.filter(
				(filePath) =>
					isPathInside(baseDir, filePath) &&
					!path
						.relative(baseDir, filePath)
						.split(path.sep)
						.includes('node_modules'),
			)
			.sort((left, right) => left.localeCompare(right));
		const inlineCssPaths = (buildResult.inlineCssPaths ?? [])
			.map((filePath) => path.resolve(filePath))
			.sort((left, right) => left.localeCompare(right));
		const rawTextPaths = (buildResult.rawTextPaths ?? [])
			.map((filePath) => path.resolve(filePath))
			.sort((left, right) => left.localeCompare(right));
		const rawTextIds = (buildResult.rawTextIds ?? [])
			.map((filePath) => filePath)
			.sort((left, right) => left.localeCompare(right));
		const queriedPaths = (buildResult.queriedPaths ?? [])
			.map((filePath) => path.resolve(filePath))
			.sort((left, right) => left.localeCompare(right));
		// The script pass resolves each `?raw` import binding to one of these
		// recorded modules and walks its bytes only at a style-capable sink.
		const rawImportTexts = new Map<string, string>();
		for (const rawPath of rawTextPaths) {
			rawImportTexts.set(rawPath, await readFile(rawPath, 'utf8'));
		}
		for (const scriptPath of authoredScriptPaths) {
			const content = await readFile(scriptPath, 'utf8');
			violations.push(
				...scanZIndexFile({
					scanner,
					relativePath: path.relative(baseDir, scriptPath),
					content,
					productionCandidates,
					canonicalScaleTokens,
					checkBuildReachableScript: true,
					checkClassDelivery: false,
					baseDir,
					rawImportTexts,
					rawTextPaths: new Set(rawTextPaths),
					rawTextIds: new Set(rawTextIds),
					queriedPaths: new Set(queriedPaths),
				}),
			);
		}
		const canonicalAppCssPath = path.resolve(configuredAppCssPath);
		const authoredCssPaths = await collectReachableAuthoredCssPaths(
			baseDir,
			buildResult.authoredCssPaths,
		);
		if (!authoredCssPaths.includes(canonicalAppCssPath)) {
			throw new Error(
				'z-index guard build provenance did not include src/styles/app.css — ' +
					'the canonical scale is not reachable from the production build.',
			);
		}
		for (const cssPath of authoredCssPaths) {
			const content = await readFile(cssPath, 'utf8');
			violations.push(
				...checkAuthoredCssScaleDefinitions({
					css: content,
					relativePath: path.relative(baseDir, cssPath),
					isCanonicalAppCss: cssPath === canonicalAppCssPath,
				}),
			);
		}
		for (const cssPath of inlineCssPaths) {
			const content = await readFile(cssPath, 'utf8');
			const relativePath = path.relative(baseDir, cssPath);
			// `?inline` / `?raw` CSS ships as JS text, invisible to the emitted
			// gate — the declaration gate runs on the authored file itself,
			// including inline imports from outside the project root. CSS text
			// that cannot be parsed is reported, never skipped: it ships and
			// the guard cannot inspect it.
			let inlineViolations;
			try {
				inlineViolations = checkCompiledCssZIndex(
					content,
					KNOWN_RAW_Z_INDEX_DECLARATIONS,
					relativePath,
					{ canonicalScaleTokens },
				);
			} catch (error) {
				inlineViolations = [
					{
						ruleId: 'z-index-unparseable-static-css',
						message:
							`inline-imported CSS in ${relativePath} cannot be parsed as ` +
							`CSS (${cssParseFailureReason(error)}) — the guard cannot ` +
							'inspect what ships as JS; fix the payload or import the ' +
							'stylesheet through the build graph.',
						file: relativePath,
						line: 1,
						source: content.slice(0, 120),
					},
				];
			}
			violations.push(...inlineViolations);
		}
		const emittedCssRoot = path.resolve(buildResult.emittedCssRoot);
		const emittedCssPaths = await collectCssPaths(emittedCssRoot);
		if (emittedCssPaths.length === 0) {
			throw new Error(
				'z-index guard found 0 emitted CSS assets after the production build — ' +
					'a pass would be vacuous. Check the Vite output directory.',
			);
		}
		const emittedCssAssets = [];
		const emittedScaleDefinitionCounts = new Map<string, number>();
		const emittedAllowlistCounts = new Map<string, number>();
		for (const cssPath of emittedCssPaths) {
			const content = await readFile(cssPath, 'utf8');
			const relativePath = buildAssetDisplayPath(
				baseDir,
				emittedCssRoot,
				cssPath,
			);
			emittedCssAssets.push({ path: relativePath, content });
			violations.push(
				...checkCompiledCssZIndex(
					content,
					KNOWN_EMITTED_RAW_Z_INDEX_DECLARATIONS,
					relativePath,
					{
						emitted: true,
						scaleDefinitionCounts: emittedScaleDefinitionCounts,
						canonicalScaleTokens,
						allowlistCounts: emittedAllowlistCounts,
					},
				),
			);
		}

		return {
			violations,
			compiled: emittedCssAssets.map((asset) => asset.content).join('\n'),
			emittedCssAssets,
			candidateCount: allCandidates.length,
			fileCount: scanner.files.length,
		};
	} finally {
		await cleanup();
	}
};

const isCli =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
	const { violations, candidateCount, fileCount } = await runZIndexGuard();
	for (const violation of violations) {
		console.error(
			`${violation.file}:${violation.line}  [${violation.ruleId}]  ${violation.message}`,
		);
	}
	if (violations.length > 0) {
		console.error(
			`\nz-index guard: ${violations.length} violation(s) across ${fileCount} scanned ` +
				`files (${candidateCount} Tailwind candidates).`,
		);
		process.exit(1);
	}
	console.log(
		`z-index guard: OK — ${fileCount} files, ${candidateCount} candidates, ` +
			'every z-index utility routes through the --publy-z-* scale.',
	);
}
