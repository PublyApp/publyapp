import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import postcss from 'postcss';
import { ts } from 'ts-morph';
import { build as viteBuild } from 'vite';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const appCssPath = path.join(rootDir, 'src/styles/app.css');

const SCRIPT_EXTENSIONS = new Set([
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
]);

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
		relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
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
	checkOpaqueStylesheetLinks = true,
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
	for (const { candidate, position } of withPositions) {
		if (classifyZUtility(candidate) !== 'raw') {
			continue;
		}
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

	if (extension === '.css') {
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
			relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
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
		visitTemplates(sourceFile);

		const literalText = (node) => {
			if (node == null) {
				return null;
			}
			if (
				ts.isStringLiteral(node) ||
				ts.isNoSubstitutionTemplateLiteral(node)
			) {
				return node.text;
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
					moduleConstStrings.set(declaration.name.text, value);
				}
			}
		}
		const staticString = (node) => {
			const direct = literalText(node);
			if (direct != null) {
				return direct;
			}
			if (node != null && ts.isIdentifier(node)) {
				return moduleConstStrings.get(node.text) ?? null;
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
		const staticObjectProperty = (object, name) => {
			const property = object.properties.find(
				(candidate) =>
					ts.isPropertyAssignment(candidate) &&
					propertyName(candidate.name) === name,
			);
			return property != null && ts.isPropertyAssignment(property)
				? staticString(property.initializer)
				: null;
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
		const visitStaticStyleEscapes = (node) => {
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
			if (
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression) &&
				ts.isIdentifier(node.expression.expression) &&
				node.expression.expression.text === 'CSS' &&
				node.expression.name.text === 'registerProperty' &&
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
		if (checkOpaqueStylesheetLinks) {
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
		visitScaleTokenDefinitions(sourceFile);
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
	{ emitted = false, scaleDefinitionCounts = new Map() } = {},
) => {
	const root = postcss.parse(compiledCss, { from: undefined });
	const violations = findReservedScaleTokenRegistrations(root, sourceName);
	const seenCounts = new Map();
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
			const count = (seenCounts.get(key) ?? 0) + 1;
			seenCounts.set(key, count);
			if (count <= allowance.count) {
				continue;
			}
		}
		violations.push({
			ruleId: 'z-index-declaration-not-on-scale',
			message:
				`shipped \`${shipped}\`${selector ? ` in \`${selector}\`` : ''} does not ` +
				'resolve through var(--publy-z-…) — every z-index in the built ' +
				'stylesheet must route through the scale.',
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
	const root = postcss.parse(css, { from: undefined });
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
			} else if (entry.isFile() && entry.name.endsWith('.css')) {
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

const buildProductionApp = async (baseDir) => {
	const emittedCssRoot = await mkdtemp(
		path.join(tmpdir(), 'publy-zindex-guard-'),
	);
	const authoredCssPaths = new Set();
	const authoredScriptPaths = new Set();
	const provenancePlugin = {
		name: 'publy-zindex-css-provenance',
		enforce: 'pre',
		transform(_code, id) {
			const [filePath] = id.split('?');
			if (filePath.endsWith('.css')) {
				authoredCssPaths.add(path.resolve(filePath));
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
		await viteBuild({
			root: baseDir,
			logLevel: 'silent',
			plugins: [provenancePlugin],
			build: {
				emptyOutDir: true,
				outDir: emittedCssRoot,
			},
		});
	} catch (error) {
		await rm(emittedCssRoot, { recursive: true, force: true });
		throw error;
	}
	return {
		emittedCssRoot,
		authoredCssPaths: [...authoredCssPaths],
		authoredScriptPaths: [...authoredScriptPaths],
		cleanup: () => rm(emittedCssRoot, { recursive: true, force: true }),
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
		const root = postcss.parse(css, { from: undefined });
		root.walkAtRules((atRule) => {
			if (canonicaliseCssProperty(atRule.name) !== 'import') {
				return;
			}
			const specifier = cssImportSpecifier(atRule.params);
			if (specifier == null || !specifier.startsWith('.')) {
				return;
			}
			const [withoutQuery] = specifier.split(/[?#]/);
			if (!withoutQuery.endsWith('.css')) {
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
	if (
		buildResult?.emittedCssRoot == null ||
		!Array.isArray(buildResult.authoredCssPaths) ||
		!Array.isArray(buildResult.authoredScriptPaths)
	) {
		throw new Error(
			'z-index guard productionBuild must return the exact emittedCssRoot and ' +
				'authored CSS/script paths from this build invocation.',
		);
	}
	const cleanup = buildResult.cleanup ?? (async () => {});
	try {
		const violations = [];
		const productionCandidates = new Set(allCandidates);
		const authoredScriptPaths = new Set(
			buildResult.authoredScriptPaths.map((filePath) => path.resolve(filePath)),
		);
		for (const file of scanner.files) {
			const content = await readFile(file, 'utf8');
			const relativePath = path.relative(baseDir, file);
			violations.push(
				...scanZIndexFile({
					scanner,
					relativePath,
					content,
					productionCandidates,
					checkOpaqueStylesheetLinks: authoredScriptPaths.has(
						path.resolve(file),
					),
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
