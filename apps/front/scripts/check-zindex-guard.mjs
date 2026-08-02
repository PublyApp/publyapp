import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import postcss from 'postcss';
import { ts } from 'ts-morph';
import { createBuilder, isCSSRequest } from 'vite';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
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

const scriptKindForPath = (filePath) => {
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
const activeBuildDirectories = new Set();
const sweepBuildDirectories = (directories) => {
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
//   - reserved-token writes mediated by helper parameters, or object spreads
//     whose token-bearing source is produced by a helper/import rather than a
//     literal in the scanned module.
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
export const stripComments = (source) => {
	const chars = source.split('');
	const n = chars.length;

	const blank = (from, to) => {
		for (let k = from; k < to; k += 1) {
			if (chars[k] !== '\n') {
				chars[k] = ' ';
			}
		}
	};

	const scanTemplate = (openIndex) => {
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

	const scanCode = (start, terminator) => {
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
const splitUtilityPart = (candidate) => {
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

const isZIndexUtility = (utility) =>
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

const asciiLowerCase = (text) =>
	text.replace(/[A-Z]/g, (character) =>
		String.fromCharCode(character.charCodeAt(0) + 32),
	);

// PostCSS failures on arbitrary static payloads carry a terse `reason`; the
// diagnostics name it so a developer can find the offending syntax without a
// stack trace into PostCSS internals.
const cssParseFailureReason = (error) =>
	error?.reason ?? error?.message ?? String(error);

// ---------------------------------------------------------------------------
// CSS identifier canonicalisation. CSS property names are ASCII-case-
// insensitive and may carry escapes (`z-\69ndex` is `z-index`), so property
// comparisons canonicalise instead of matching literal text.
// ---------------------------------------------------------------------------
const CSS_WHITESPACE = /[\t\n\f\r ]/;
const HEX_ESCAPE = /[0-9a-fA-F]/;

const decodeCssIdentifier = (raw) => {
	let out = '';
	for (let i = 0; i < raw.length; ) {
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

const canonicaliseCssProperty = (raw) =>
	asciiLowerCase(decodeCssIdentifier(raw));

const isNonStackingKeyword = (value) =>
	NON_STACKING_KEYWORDS.has(canonicaliseCssProperty(value.trim()));

const isScaleVarReference = (value) => {
	const trimmed = value.trim();
	const openParen = trimmed.indexOf('(');
	if (openParen <= 0 || !trimmed.endsWith(')')) {
		return false;
	}
	const propertyName = decodeCssIdentifier(
		trimmed.slice(openParen + 1, -1).trim(),
	);
	return (
		canonicaliseCssProperty(trimmed.slice(0, openParen)) === 'var' &&
		/^--publy-z-[\w-]+$/.test(propertyName)
	);
};

// First top-level `:` — the property/value separator. `:` inside parentheses,
// brackets, strings, or escapes never counts, so `url(http://…)` and
// attribute-selector values are not split by accident.
const findTopLevelColon = (text) => {
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
const isZIndexArbitraryProperty = (utility) => {
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

const arbitraryPropertyValue = (utility) => {
	const inner = utility.slice(1, -1);
	const colon = findTopLevelColon(inner);
	return inner.slice(colon + 1).trim();
};

const isAllowedZIndexUtility = (utility) => {
	if (isZIndexArbitraryProperty(utility)) {
		// Only a pure scale reference (`var(--publy-z-…)`) or a non-stacking
		// keyword may ship through an arbitrary-property shim. A bare custom
		// property (`[z-index:--publy-z-menu]`) emits invalid CSS and stays raw.
		const value = arbitraryPropertyValue(utility);
		return isNonStackingKeyword(value) || isScaleVarReference(value);
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
		return true;
	}
	// Arbitrary values are only permitted when they are a pure scale reference
	// (`z-[var(--publy-z-menu)]`, `z-[--publy-z-menu]`). Anything else —
	// including a scale reference carrying a raw fallback such as
	// `z-[var(--publy-z-menu,50)]` — stays raw and is reported.
	if (/^z-\[--publy-z-[\w-]+\]$/.test(utility)) {
		return true;
	}
	if (
		utility.startsWith('z-[') &&
		utility.endsWith(']') &&
		isScaleVarReference(utility.slice(3, -1))
	) {
		return true;
	}
	return false;
};

// Returns 'allowed' | 'raw' | null (null = not a z-index candidate).
export const classifyZUtility = (candidate) => {
	const utility = splitUtilityPart(candidate);
	if (!isZIndexUtility(utility)) {
		return null;
	}
	return isAllowedZIndexUtility(utility) ? 'allowed' : 'raw';
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

const collectScriptSuppressionRanges = (relativePath, source) => {
	const ranges = [];
	const sourceFile = ts.createSourceFile(
		relativePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKindForPath(relativePath),
	);

	const addLiteralRange = (node) => {
		if (
			node != null &&
			(ts.isStringLiteral(node) ||
				ts.isNoSubstitutionTemplateLiteral(node) ||
				ts.isTemplateExpression(node))
		) {
			ranges.push([node.getStart(sourceFile), node.getEnd()]);
		}
	};

	const visit = (node) => {
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
const collectCssSuppressionRanges = (source) => {
	const ranges = [];
	let match;
	while ((match = CSS_STRING_PATTERN.exec(source))) {
		ranges.push([match.index, match.index + match[0].length]);
	}
	return ranges;
};

const isInsideAnyRange = (position, ranges) => {
	for (const [start, end] of ranges) {
		if (position >= start && position < end) {
			return true;
		}
	}
	return false;
};

const lineForOffset = (source, offset) =>
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
	checkBuildReachableScript = true,
	checkClassDelivery = true,
	// Raw-sink provenance: `baseDir` roots specifier resolution and
	// `rawImportTexts` maps each recorded `?raw` module's absolute path to its
	// bytes. With both present, a `?raw` import binding consumed by a
	// style-capable sink (a `<style>` element or a dangerouslySetInnerHTML
	// payload) is walked as shipped CSS/HTML; without them the walk is
	// skipped, which keeps unit fixtures free of raw-file scaffolding.
	baseDir = null,
	rawImportTexts = null,
}) => {
	const violations = [];
	const extension = path.extname(relativePath);
	const deCommented = stripComments(content);
	let suppressionRanges = [];
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
		if (classifyZUtility(candidate) !== 'raw') {
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
				if (classifyZUtility(token) !== 'raw') {
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
		const visitTemplates = (node) => {
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

		const unwrapTransparentExpression = (node) => {
			let expression = node;
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
			return expression;
		};
		const literalText = (node) => {
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
		const moduleConstStrings = new Map();
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
				const value = literalText(declaration.initializer);
				if (value != null) {
					moduleConstStrings.set(declaration.name.text, {
						declaration,
						value,
					});
				}
			}
		}
		const bindingNameIncludes = (bindingName, name) => {
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
		const variableBindingIn = (declarationList, name) =>
			declarationList.declarations.find((declaration) =>
				bindingNameIncludes(declaration.name, name),
			) ?? null;
		const statementBinding = (statement, name) => {
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
		const hoistedVarBinding = (scope, name) => {
			let binding = null;
			const visit = (node) => {
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
		const bindingInScope = (scope, name) => {
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
			if (ts.isFunctionLike(scope)) {
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
		const nearestBinding = (node, name) => {
			let scope = node.parent;
			while (scope != null) {
				const binding = bindingInScope(scope, name);
				if (binding != null) {
					return binding;
				}
				scope = scope.parent;
			}
			return null;
		};
		const staticString = (node) => {
			const expression = unwrapTransparentExpression(node);
			const direct = literalText(expression);
			if (direct != null) {
				return direct;
			}
			if (expression != null && ts.isIdentifier(expression)) {
				const moduleConstant = moduleConstStrings.get(expression.text);
				if (
					moduleConstant != null &&
					nearestBinding(expression, expression.text) ===
						moduleConstant.declaration
				) {
					return moduleConstant.value;
				}
			}
			return null;
		};
		const propertyName = (name) => {
			if (ts.isComputedPropertyName(name)) {
				return staticString(name.expression);
			}
			if (ts.isIdentifier(name)) {
				return name.text;
			}
			return literalText(name);
		};
		const staticObjectMemberNode = (object, name) => {
			// Order-aware member resolution mirroring real object semantics:
			// the last member with the name wins, and a static object-literal
			// spread is transparent (its member is hoisted in place). A
			// non-literal spread (`{...props}`) is the declared data-flow
			// boundary and obeys source-order last-write-wins: it may carry
			// the name, so it invalidates any fact established before it, and
			// a later explicit member (or static spread carrying the member)
			// may establish the value again.
			let foundNode = null;
			for (const candidate of object.properties) {
				let valueNode = null;
				if (ts.isPropertyAssignment(candidate)) {
					if (propertyName(candidate.name) === name) {
						valueNode = candidate.initializer;
					}
				} else if (ts.isShorthandPropertyAssignment(candidate)) {
					if (candidate.name.text === name) {
						valueNode = candidate.name;
					}
				} else if (ts.isSpreadAssignment(candidate)) {
					const spreadObject = unwrapTransparentExpression(
						candidate.expression,
					);
					if (
						spreadObject != null &&
						ts.isObjectLiteralExpression(spreadObject)
					) {
						const nested = staticObjectMemberNode(spreadObject, name);
						if (nested != null) {
							valueNode = nested;
						}
					} else {
						foundNode = null;
					}
				}
				if (valueNode != null) {
					foundNode = valueNode;
				}
			}
			return foundNode;
		};
		const staticObjectProperty = (object, name) => {
			const member = staticObjectMemberNode(object, name);
			return member == null ? null : staticString(member);
		};
		const staticJsxAttribute = (attributes, attributeName) => {
			const attribute = attributes.properties.find(
				(property) =>
					ts.isJsxAttribute(property) &&
					property.name.kind === ts.SyntaxKind.Identifier &&
					property.name.text === attributeName,
			);
			if (attribute == null || !ts.isJsxAttribute(attribute)) {
				return null;
			}
			if (ts.isStringLiteral(attribute.initializer)) {
				return attribute.initializer.text;
			}
			if (ts.isJsxExpression(attribute.initializer)) {
				return staticString(attribute.initializer.expression);
			}
			return null;
		};
		const dangerousHtmlPayloadObject = (attributes) => {
			// Resolves the `dangerouslySetInnerHTML={{ __html: … }}` payload
			// object of a JSX attributes list with real JSX semantics: the
			// last occurrence wins, whether it is an explicit attribute or a
			// static object-literal spread (`{...{dangerouslySetInnerHTML: …}}`
			// is the same static payload). A non-literal spread may carry the
			// attribute, so it shadows earlier static occurrences exactly as a
			// later attribute override would — source-order last-write-wins —
			// and a later explicit occurrence establishes the payload again.
			// Transparent parentheses/assertions around the payload object or
			// around a spread's member are equivalent spellings.
			let found = false;
			let payloadObject = null;
			for (const property of attributes.properties) {
				if (ts.isJsxAttribute(property)) {
					if (
						property.name.kind !== ts.SyntaxKind.Identifier ||
						property.name.text !== 'dangerouslySetInnerHTML'
					) {
						continue;
					}
					found = true;
					payloadObject = null;
					if (ts.isJsxExpression(property.initializer)) {
						const object = unwrapTransparentExpression(
							property.initializer.expression,
						);
						if (object != null && ts.isObjectLiteralExpression(object)) {
							payloadObject = object;
						}
					}
				} else if (ts.isJsxSpreadAttribute(property)) {
					const spreadObject = unwrapTransparentExpression(property.expression);
					if (
						spreadObject == null ||
						!ts.isObjectLiteralExpression(spreadObject)
					) {
						found = false;
						payloadObject = null;
						continue;
					}
					const member = staticObjectMemberNode(
						spreadObject,
						'dangerouslySetInnerHTML',
					);
					if (member != null) {
						found = true;
						payloadObject = null;
						const memberObject = unwrapTransparentExpression(member);
						if (
							memberObject != null &&
							ts.isObjectLiteralExpression(memberObject)
						) {
							payloadObject = memberObject;
						}
					}
				}
			}
			return found ? payloadObject : null;
		};
		const staticDangerousHtmlPayload = (attributes) => {
			const payloadObject = dangerousHtmlPayloadObject(attributes);
			return payloadObject == null
				? null
				: staticObjectProperty(payloadObject, '__html');
		};
		const staticMember = (expression) => {
			const member = unwrapTransparentExpression(expression);
			if (member != null && ts.isPropertyAccessExpression(member)) {
				return { owner: member.expression, name: member.name.text };
			}
			if (member != null && ts.isElementAccessExpression(member)) {
				return {
					owner: member.expression,
					name: staticString(member.argumentExpression),
				};
			}
			return null;
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
			// `attributes` shape on each.
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
			// A `dangerouslySetInnerHTML` payload on a `<style>` element is the
			// same static CSS text, just spelled through the attribute. When
			// the attribute is present but not static, the element's shipped
			// CSS is the declared runtime bucket (React ignores children in
			// that case, so there is nothing static to inspect).
			const dangerousHtml = staticDangerousHtmlPayload(attributes);
			if (dangerousHtml != null) {
				return dangerousHtml;
			}
			if (selfClosing) {
				return null;
			}
			const parts = [];
			for (const child of node.children) {
				if (ts.isJsxText(child)) {
					parts.push(child.text);
				} else if (ts.isJsxExpression(child)) {
					const text = staticString(child.expression);
					if (text == null) {
						return null;
					}
					parts.push(text);
				} else {
					return null;
				}
			}
			return parts.join('');
		};
		const tagNameText = (node) => {
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
		const scanHtmlStyleEscapes = (html) => {
			// Static-HTML payloads can embed a `<style>` element (declaration
			// walk over its text) or a `<link rel="stylesheet">` (opaque, same
			// as the JSX link rule). Only literal attribute values are read, so
			// runtime-assembled HTML stays in the declared runtime bucket. A
			// payload the declaration walk cannot parse is reported as opaque —
			// never a crash, never a silent pass.
			const escapes = [];
			const stylePattern = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
			let match;
			while ((match = stylePattern.exec(html))) {
				const css = match[1];
				let escape;
				try {
					if (checkCompiledCssZIndex(css).length === 0) {
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
		const rawImportBindings = new Map();
		for (const statement of sourceFile.statements) {
			if (!ts.isImportDeclaration(statement)) {
				continue;
			}
			const specifier = statement.moduleSpecifier?.text ?? '';
			if (!specifier.includes('?raw')) {
				continue;
			}
			const importClause = statement.importClause;
			if (importClause?.name != null && ts.isIdentifier(importClause.name)) {
				rawImportBindings.set(importClause.name.text, {
					specifier,
					// The binding node `nearestBinding` resolves to for a
					// default import is the import clause itself.
					declaration: importClause,
					namespace: false,
				});
			} else if (
				importClause?.namedBindings != null &&
				ts.isNamespaceImport(importClause.namedBindings)
			) {
				rawImportBindings.set(importClause.namedBindings.name.text, {
					specifier,
					declaration: importClause.namedBindings,
					namespace: true,
				});
			}
		}
		const rawBindingForExpression = (node) => {
			// Resolves an expression to a `?raw` import specifier when the
			// binding reaches it unshadowed — the default import directly or
			// the namespace form through `.default`. Only the declaration the
			// binding actually resolves to counts, so a shadowed identifier is
			// never mistaken for the raw import.
			const expression = unwrapTransparentExpression(node);
			if (expression == null) {
				return null;
			}
			if (ts.isIdentifier(expression)) {
				const entry = rawImportBindings.get(expression.text);
				if (
					entry != null &&
					!entry.namespace &&
					nearestBinding(expression, expression.text) === entry.declaration
				) {
					return entry.specifier;
				}
				return null;
			}
			if (
				ts.isPropertyAccessExpression(expression) &&
				expression.name.text === 'default'
			) {
				const owner = unwrapTransparentExpression(expression.expression);
				if (owner != null && ts.isIdentifier(owner)) {
					const entry = rawImportBindings.get(owner.text);
					if (
						entry?.namespace &&
						nearestBinding(owner, owner.text) === entry.declaration
					) {
						return entry.specifier;
					}
				}
			}
			return null;
		};
		const reportRawImportSink = (specifier, kind, sinkNode) => {
			// A `?raw` import whose binding reaches a style-capable sink is
			// shipped text the emitted gate can never see — the same class as
			// `?inline`/`?raw` CSS. The raw bytes are walked only when the
			// import binding is consumed by such a sink: text displayed in
			// `<pre>`/`<p>` is displayed text, not a stylesheet. A style-sink
			// payload the declaration walk cannot parse is a named diagnostic,
			// never a crash and never a silent pass.
			if (baseDir == null || rawImportTexts == null) {
				return;
			}
			const withoutQuery = specifier.split(/[?#]/)[0];
			const relativeRawPath = withoutQuery.startsWith('~/')
				? path.resolve(baseDir, 'src', withoutQuery.slice(2))
				: path.resolve(baseDir, path.dirname(relativePath), withoutQuery);
			const rawPath = path.isAbsolute(withoutQuery)
				? withoutQuery
				: relativeRawPath;
			const text = rawImportTexts.get(path.resolve(rawPath));
			if (text == null) {
				// The production build validated every import (an unresolvable
				// specifier fails the build), so a miss here only means the raw
				// module never entered this build's transform graph — nothing
				// ships.
				return;
			}
			const base = {
				file: path.relative(baseDir, rawPath),
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
		const visitStaticStyleEscapes = (node) => {
			const styleCss = staticStyleElementCss(node);
			if (styleCss != null) {
				const base = {
					file: relativePath,
					line: lineForOffset(content, node.getStart(sourceFile)),
					source: node.getText(sourceFile),
				};
				let cssViolations;
				try {
					cssViolations = checkCompiledCssZIndex(styleCss).map((violation) => ({
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
			}
			const isStyleElement = tagNameText(node) === 'style';
			if (isStyleElement && styleCss == null && ts.isJsxElement(node)) {
				// A `<style>` element whose children include a `?raw` import
				// binding ships that file's bytes as CSS — the binding is the
				// provenance, so text displayed elsewhere (a `<pre>`) is not
				// walked. The raw walk reports unparseable bytes by name.
				for (const child of node.children) {
					if (ts.isJsxExpression(child) && child.expression != null) {
						const specifier = rawBindingForExpression(child.expression);
						if (specifier != null) {
							reportRawImportSink(specifier, 'style', child);
						}
					}
				}
			}
			const payloadObject =
				ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)
					? dangerousHtmlPayloadObject(
							ts.isJsxElement(node)
								? node.openingElement.attributes
								: node.attributes,
						)
					: null;
			const dangerousHtml =
				payloadObject == null
					? null
					: staticObjectProperty(payloadObject, '__html');
			if (dangerousHtml != null) {
				const htmlEscapes = scanHtmlStyleEscapes(dangerousHtml);
				for (const escape of htmlEscapes) {
					violations.push({
						...escape,
						file: relativePath,
						line: lineForOffset(content, node.getStart(sourceFile)),
					});
				}
			} else if (payloadObject != null) {
				// The payload is not a static string — when `__html` is a
				// `?raw` import binding it still ships the file's bytes, as
				// CSS on a `<style>` host or as HTML elsewhere.
				const memberNode = staticObjectMemberNode(payloadObject, '__html');
				const specifier =
					memberNode == null ? null : rawBindingForExpression(memberNode);
				if (specifier != null) {
					reportRawImportSink(
						specifier,
						isStyleElement ? 'style' : 'html',
						node,
					);
				}
			}
			let rel = null;
			let href = null;
			if (
				(ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
				ts.isIdentifier(node.tagName) &&
				node.tagName.text === 'link'
			) {
				rel = staticJsxAttribute(node.attributes, 'rel');
				href = staticJsxAttribute(node.attributes, 'href');
			} else if (ts.isObjectLiteralExpression(node)) {
				rel = staticObjectProperty(node, 'rel');
				href = staticObjectProperty(node, 'href');
			}
			const relTokens =
				rel == null
					? []
					: rel
							.split(/[\t\n\f\r ]+/)
							.filter(Boolean)
							.map(asciiLowerCase);
			if (href != null && relTokens.includes('stylesheet')) {
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
			if (
				ts.isCallExpression(node) &&
				registrationMember?.name === 'registerProperty' &&
				isDirectGlobalCss(registrationMember.owner) &&
				ts.isObjectLiteralExpression(node.arguments[0])
			) {
				const property = staticObjectProperty(node.arguments[0], 'name');
				if (property?.startsWith('--publy-z-')) {
					violations.push({
						ruleId: 'z-index-scale-token-registered',
						message:
							`script registration of reserved scale token \`${property}\` can ` +
							'replace its inherited tier value — the --publy-z-* namespace ' +
							'must not be registered with CSS.registerProperty().',
						file: relativePath,
						line: lineForOffset(content, node.getStart(sourceFile)),
						source: `CSS.registerProperty(${property})`,
					});
				}
			}
			node.forEachChild(visitStaticStyleEscapes);
		};
		if (checkBuildReachableScript) {
			visitStaticStyleEscapes(sourceFile);
		}
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
		const visitScaleTokenDefinitions = (node) => {
			if (ts.isPropertyAssignment(node)) {
				recordScaleTokenDefinition(propertyName(node.name), node);
			} else if (
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression) &&
				node.expression.name.text === 'setProperty'
			) {
				recordScaleTokenDefinition(staticString(node.arguments[0]), node);
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
export const KNOWN_RAW_Z_INDEX_DECLARATIONS = [
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

const KNOWN_EMITTED_RAW_Z_INDEX_DECLARATIONS = [
	{
		...KNOWN_RAW_Z_INDEX_DECLARATIONS[0],
		selector:
			'.publy-data-table thead [data-slot=table-column],' +
			'.publy-data-table thead [data-slot=table-sortable-column-header],' +
			'.publy-data-table thead [data-slot=table-selection-cell]',
	},
];

const normalizeWhitespace = (text) => text.replace(/[\t\n\f\r ]+/g, ' ').trim();

const stripImportant = (value) => {
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

const describeCssContainer = (node) => {
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

const cssAncestorsFor = (declaration) => {
	const ancestors = [];
	let node =
		declaration.parent?.type === 'rule'
			? declaration.parent.parent
			: declaration.parent;
	while (node != null && node.type !== 'root') {
		ancestors.unshift(describeCssContainer(node));
		node = node.parent;
	}
	return ancestors;
};

const cssAncestorsEqual = (left, right) =>
	JSON.stringify(left) === JSON.stringify(right);

// Parse the compiled stylesheet with a CSS grammar and return each real
// declaration. PostCSS keeps comment syntax, nested rules, at-rules, and
// component-value braces distinct, so declaration ownership comes from the
// AST instead of delimiter counting.
const scanCssDeclarations = (root) => {
	const declarations = [];
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

const isGlobalScaleDefinition = (declaration, emitted) => {
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

const findReservedScaleTokenRegistrations = (root, sourceName) => {
	const violations = [];
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
	compiledCss,
	allowlisted = KNOWN_RAW_Z_INDEX_DECLARATIONS,
	sourceName = 'compiled stylesheet',
	{
		emitted = false,
		scaleDefinitionCounts = new Map(),
		canonicalScaleTokens = null,
		allowlistCounts = new Map(),
	} = {},
) => {
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
			if (
				canonicalScaleTokens != null &&
				!canonicalScaleTokens.has(declaration.decodedProperty)
			) {
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
		if (isScaleVarReference(value)) {
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
				'apps/front/scripts/check-zindex-guard.mjs only after review.',
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
}) => {
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

const findCanonicalScaleTokens = (css) => {
	const root = postcss.parse(css, { from: undefined });
	const tokens = new Set();
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

export const buildProductionApp = async (baseDir) => {
	const emittedCssRoot = await mkdtemp(
		path.join(tmpdir(), 'publy-zindex-guard-'),
	);
	activeBuildDirectories.add(emittedCssRoot);
	const authoredCssPaths = new Set();
	const authoredScriptPaths = new Set();
	const inlineCssPaths = new Set();
	const rawTextPaths = new Set();
	const provenancePlugin = {
		name: 'publy-zindex-css-provenance',
		enforce: 'pre',
		transform(_code, id) {
			const [filePath, query] = id.split('?');
			const queryTokens = query == null ? [] : query.split('&');
			if (isCSSRequest(id)) {
				// Vite's own CSS-language set (`.css`, `.pcss`, `.postcss`,
				// `.sss`, the preprocessor languages, …) so the guard cannot
				// drift when Vite adds a language.
				authoredCssPaths.add(path.resolve(filePath));
				// `?inline` / `?raw` imports ship the CSS text as JS rather than
				// as an emitted asset, so the emitted gate never sees it. The
				// authored file is walked directly by the declaration gate.
				if (queryTokens.includes('inline') || queryTokens.includes('raw')) {
					inlineCssPaths.add(path.resolve(filePath));
				}
			} else if (queryTokens.includes('raw') && path.isAbsolute(filePath)) {
				// `?raw` ships the raw text of *any* file as JS, and that text
				// can be CSS even when the extension is not a CSS language
				// (`.txt`?raw is the documented case). Record every raw module
				// the build transforms; the script pass resolves each raw
				// import binding to one of these paths and walks its bytes
				// only when the binding reaches a style-capable sink.
				rawTextPaths.add(path.resolve(filePath));
			} else if (
				path.isAbsolute(filePath) &&
				SCRIPT_EXTENSIONS.has(path.extname(filePath))
			) {
				authoredScriptPaths.add(path.resolve(filePath));
			}
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

const collectReachableAuthoredCssPaths = async (baseDir, entryPaths) => {
	const queuedPaths = [];
	const reachablePaths = new Set();
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
			const [withoutQuery] = specifier.split(/[?#]/);
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
} = {}) => {
	const css = await readFile(configuredAppCssPath, 'utf8');
	const cssDir = path.dirname(configuredAppCssPath);
	const compiler = await compile(css, { base: cssDir, onDependency: () => {} });
	let sources;
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
				!Array.isArray(buildResult.rawTextPaths))
		) {
			throw new Error(
				'z-index guard productionBuild must return the exact emittedCssRoot and ' +
					'authored CSS/script paths from this build invocation.',
			);
		}
		const violations = [];
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
			.filter((filePath) => !inlineCssPaths.includes(filePath))
			.sort((left, right) => left.localeCompare(right));
		// The script pass resolves each `?raw` import binding to one of these
		// recorded modules and walks its bytes only at a style-capable sink.
		const rawImportTexts = new Map();
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
					checkBuildReachableScript: true,
					checkClassDelivery: false,
					baseDir,
					rawImportTexts,
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
		const emittedScaleDefinitionCounts = new Map();
		const emittedAllowlistCounts = new Map();
		const canonicalScaleTokens = findCanonicalScaleTokens(css);
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
