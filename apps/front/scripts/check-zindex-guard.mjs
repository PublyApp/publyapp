import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import postcss from 'postcss';
import { ts } from 'ts-morph';

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
// Four components, in order of increasing distance from the source:
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
//   4. Compiled-CSS gate — the production-equivalent build output is scanned
//      for `z-index:` declarations that do not resolve through
//      `var(--publy-z-…)`. This proves what actually ships, which is the
//      exact failure that killed the previous attempt (its own fixture
//      literals reached the shipped stylesheet).
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

const NON_STACKING_KEYWORD_ARBITRARY_PATTERN = new RegExp(
	`^z-\\[(${[...NON_STACKING_KEYWORDS].join('|')})\\]$`,
);

// ---------------------------------------------------------------------------
// CSS identifier canonicalisation. CSS property names are ASCII-case-
// insensitive and may carry escapes (`z-\69ndex` is `z-index`), so property
// comparisons canonicalise instead of matching literal text.
// ---------------------------------------------------------------------------
const CSS_WHITESPACE = /[\t\n\f\r ]/;
const HEX_ESCAPE = /[0-9a-fA-F]/;

const canonicaliseCssProperty = (raw) => {
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
	return out.toLowerCase();
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
		return (
			NON_STACKING_KEYWORDS.has(value) ||
			/^var\(--publy-z-[\w-]+\)$/.test(value)
		);
	}
	if (
		utility === 'z-auto' ||
		NON_STACKING_KEYWORD_ARBITRARY_PATTERN.test(utility)
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
	if (/^z-\[var\(--publy-z-[\w-]+\)\]$/.test(utility)) {
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

const normalizeWhitespace = (text) => text.replace(/[\t\n\f\r ]+/g, ' ').trim();

const stripImportant = (value) =>
	value.replace(/\s*!\s*important\s*$/i, '').trim();

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
const scanCssDeclarations = (css) => {
	const declarations = [];
	const root = postcss.parse(css, { from: undefined });
	root.walkDecls((declaration) => {
		const rule = declaration.parent;
		declarations.push({
			ancestors: cssAncestorsFor(declaration),
			selector: rule?.type === 'rule' ? normalizeWhitespace(rule.selector) : '',
			property: canonicaliseCssProperty(declaration.prop),
			value: declaration.value.trim(),
			line: declaration.source?.start?.line ?? 1,
		});
	});
	return declarations;
};

export const checkCompiledCssZIndex = (
	compiledCss,
	allowlisted = KNOWN_RAW_Z_INDEX_DECLARATIONS,
) => {
	const violations = [];
	const seenCounts = new Map();
	for (const declaration of scanCssDeclarations(compiledCss)) {
		if (declaration.property !== 'z-index') {
			continue;
		}
		const value = stripImportant(declaration.value);
		const shipped = `z-index: ${value}`;
		if (/^var\(--publy-z-[\w-]+\)$/.test(value)) {
			continue;
		}
		if (NON_STACKING_KEYWORDS.has(value)) {
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
			file: 'compiled stylesheet',
			line: declaration.line,
			source: shipped,
		});
	}
	return violations;
};

// ---------------------------------------------------------------------------
// CLI run — derives the production sources from app.css, scans every file the
// production scanner would scan, then gates on the compiled output.
// ---------------------------------------------------------------------------
export const runZIndexGuard = async ({
	baseDir = rootDir,
	appCssPath: configuredAppCssPath = appCssPath,
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
			}),
		);
	}

	const compiled = compiler.build(allCandidates);
	violations.push(...checkCompiledCssZIndex(compiled));

	return {
		violations,
		compiled,
		candidateCount: allCandidates.length,
		fileCount: scanner.files.length,
	};
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
