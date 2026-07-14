import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import suppressionInventory from '~/lib/suppression-inventory.json';
import {
	diffSuppressionInventory,
	findSuppressionSitesInSource,
	isSubstantiveSuppressionReason,
	type SuppressionSite,
} from '~/lib/suppression-reason';

import enResource from '@org/shared-ts/lib/i18n/locales/en';
import frResource from '@org/shared-ts/lib/i18n/locales/fr';

// Extracts every string-literal translation-function call and JSX i18n-key
// attribute under apps/front-2/src and asserts it resolves in both locale
// bundles — a missing key silently renders the raw key string as UI text
// (i18next's default missing-key behaviour), and no other check catches that.
const srcDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const TEXT_EXTENSIONS = new Set(['.ts', '.tsx']);

const KEY_PATTERNS = [
	/\bt\(\s*(['"])([a-zA-Z0-9_.-]+)\1/g,
	/\bi18nKey=(['"])([a-zA-Z0-9_.-]+)\1/g,
];

// Some modules resolve a translation key indirectly through a lookup object
// (e.g. `getInvitationStatusLabelKey` in list-helpers.ts) instead of passing
// a literal to `t()`. The patterns above can't see those — the literal never
// appears next to `t(`. This regex finds `*_KEY`/`*_KEYS` object-literal
// declarations and the block below extracts their string values as
// candidate keys, so a lookup table pointing at a bundle-less key still
// fails the coverage check. Limits: it only catches object-literal lookup
// tables (not e.g. arrays, switch statements, or ternaries) named with a
// `_KEY`/`_KEYS` suffix, and it only trusts values that look like multi-segment
// kebab-case i18n keys (3+ dash-separated segments) to avoid false-positiving
// on unrelated short kebab strings (e.g. React `key="sk-1"` list keys).
const KEY_MAP_DECLARATION_PATTERN =
	/\b[A-Z][A-Z0-9_]*_KEYS?\s*(?::[^={]+)?=\s*\{/g;
const KEBAB_I18N_KEY_CANDIDATE = /^[a-z][a-z0-9]*(-[a-z0-9]+){2,}$/;
const STRING_LITERAL_PATTERN = /(['"])([a-zA-Z0-9_.-]+)\1/g;

// r3-tests-F6: a scalar `*_KEY`/`*_KEYS` const (not an object-literal lookup
// map) is invisible to KEY_MAP_DECLARATION_PATTERN, since that pattern only
// matches a declaration ending in `= {`. This is the shape
// `export const SELECTION_LOCKED_TITLE_KEY = 'selection-locked-while-selecting';`
// takes — `t(SELECTION_LOCKED_TITLE_KEY)` call sites never put the literal
// next to `t(`, so KEY_PATTERNS misses it too. Requires the declaration
// itself starts with `const` (so a re-export or a mid-object property named
// similarly isn't misread as a fresh declaration). A `_KEY`-suffixed name
// isn't always an i18n key though (e.g. `$invitationId.tsx`'s
// `NOT_FOUND_TRANSLATION_KEY = 'malformed-id'` is a problem-status
// discriminant, never passed to `t()`) — reuses the same
// KEBAB_I18N_KEY_CANDIDATE multi-segment heuristic as the object-literal
// extractor above to keep short, ambiguous values like that out.
const SCALAR_KEY_DECLARATION_PATTERN =
	/\bconst\s+[A-Z][A-Z0-9_]*_KEYS?\s*(?::[^=\n]+)?=\s*(['"])([a-z][a-z0-9-]*)\1/g;

const extractKeyMapLiteralUsages = (
	source: string,
	relativePath: string,
	usagesByKey: Map<string, string[]>,
): void => {
	for (const declMatch of source.matchAll(KEY_MAP_DECLARATION_PATTERN)) {
		const braceStart = declMatch.index + declMatch[0].length - 1;
		let depth = 0;
		let braceEnd = -1;

		for (let i = braceStart; i < source.length; i += 1) {
			if (source[i] === '{') {
				depth += 1;
			} else if (source[i] === '}') {
				depth -= 1;
				if (depth === 0) {
					braceEnd = i;
					break;
				}
			}
		}

		if (braceEnd === -1) {
			continue;
		}

		const block = source.slice(braceStart, braceEnd);
		for (const literalMatch of block.matchAll(STRING_LITERAL_PATTERN)) {
			const candidate = literalMatch[2];
			if (!KEBAB_I18N_KEY_CANDIDATE.test(candidate)) {
				continue;
			}

			const usages = usagesByKey.get(candidate) ?? [];
			usages.push(relativePath);
			usagesByKey.set(candidate, usages);
		}
	}
};

const extractScalarKeyDeclarations = (
	source: string,
	relativePath: string,
	usagesByKey: Map<string, string[]>,
): void => {
	for (const match of source.matchAll(SCALAR_KEY_DECLARATION_PATTERN)) {
		const candidate = match[2];
		if (!KEBAB_I18N_KEY_CANDIDATE.test(candidate)) {
			continue;
		}

		const usages = usagesByKey.get(candidate) ?? [];
		usages.push(relativePath);
		usagesByKey.set(candidate, usages);
	}
};

const collectFiles = async (dir: string): Promise<string[]> => {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const absolutePath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(absolutePath)));
			continue;
		}

		if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
			files.push(absolutePath);
		}
	}

	return files;
};

export const extractI18nKeyUsages = async (
	dir: string,
): Promise<Map<string, string[]>> => {
	const files = await collectFiles(dir);
	const usagesByKey = new Map<string, string[]>();

	for (const absolutePath of files) {
		const source = await readFile(absolutePath, 'utf8');
		const relativePath = path.relative(dir, absolutePath);

		for (const pattern of KEY_PATTERNS) {
			for (const match of source.matchAll(pattern)) {
				const rawKey = match[2];
				const key = rawKey.startsWith('common:')
					? rawKey.slice('common:'.length)
					: rawKey;
				const usages = usagesByKey.get(key) ?? [];
				usages.push(relativePath);
				usagesByKey.set(key, usages);
			}
		}

		extractKeyMapLiteralUsages(source, relativePath, usagesByKey);
		extractScalarKeyDeclarations(source, relativePath, usagesByKey);
	}

	return usagesByKey;
};

// i18next resolves a plural key (`t('assigned-count', { count })`) against
// `<key>_one` / `<key>_other` in the bundle, not the bare key — a literal
// lookup would false-positive on every plural key in the codebase.
const resolvesInBundle = (key: string, bundle: Record<string, unknown>) =>
	key in bundle || `${key}_one` in bundle || `${key}_other` in bundle;

// A bare string literal never touches `t()`, so the coverage test above is
// structurally blind to it — this catches the class of defect that let it
// (r3-shell-F2). Language self-names (LOCALE_LABELS-style
// 'English'/'Français') are the one legitimate never-translated case: a
// language's own name isn't localized.
const LOCALE_SELF_NAME_ALLOWLIST = new Set(['English', 'Français']);

// W5-PROOF: the brand wordmark is never localized (same convention as
// `<Image>`'s brand-wordmark exception in the content-imagery rule) and, once
// isCopyLikeLiteral below drops the internal-whitespace requirement, a bare
// "PublyApp" in JSX text/alt would otherwise read as an untranslated string.
const NEVER_TRANSLATED_LITERAL_ALLOWLIST = new Set(['PublyApp']);

// W5-PROOF: URL/email/bare-domain example values are common, legitimate
// `placeholder`/`alt` content (`placeholder="user@example.com"`,
// `placeholder="https://example.com"`, a `publyapp.com/<slug>` preview
// fragment) — none of them are copy needing translation, but they are
// exactly the single-word-with-a-dot shape isCopyLikeLiteral's relaxed,
// no-whitespace check would otherwise catch now that testId-style
// exemption no longer comes for free from the whitespace requirement.
//
// W5-HARDEN (W5-VERIFY2): the previous pattern only anchored the START of
// the string (`^https?:\/\/`), so a trailing prefix match exempted the
// WHOLE literal — `aria-label="https://example.com Delete account"` rode
// behind the URL and vanished. Every alternative is now anchored at BOTH
// ends (`^...$`, and `\S+`/`\S*` instead of an open-ended tail) so the
// exemption only applies when the entire trimmed value IS a URL/email/
// domain-path and nothing else — real copy can never hide behind it again.
const URL_EMAIL_OR_DOMAIN_PATTERN =
	/^(?:https?:\/\/\S+|[\w.-]+@[\w.-]+\.\w+|[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*)$/i;

// r5-tests-F2: the round-4/round-3 detector was a closed regex grammar — a
// fixed native-tag allowlist for JSX text (`span|p|h1-6|button|label|dt|dd|
// td|th|li`, one line only) and a fixed attribute-name allowlist
// (`aria-label|placeholder|title`). `<Button>Delete account</Button>` (a
// custom component, not in the tag list), `<p>\nDelete account\n</p>`
// (multiline text, excluded by the `[^<{}\n]` character class),
// `description="Delete account"` (an attribute name outside the fixed
// three), and `{'Delete account'}` (a bare JSX expression child, no
// attribute at all) all produced zero findings under the old grammar. This
// rewrite walks the real TypeScript/JSX AST instead of re-deriving one shape
// at a time from regex: every `JsxText` child of every element (native or
// custom, any tag, any line count) and every JSX attribute's string/ternary
// value are visited structurally, so no tag name or attribute name needs to
// be enumerated up front. `t(...)`-wrapped or already-computed values (an
// identifier, a call expression, a template literal with interpolation)
// never match — only a literal or a two-literal ternary sitting directly in
// copy position does.
const isProseLikeLiteral = (value: string): boolean => {
	const trimmed = value.trim();
	if (trimmed.length < 2 || LOCALE_SELF_NAME_ALLOWLIST.has(trimmed)) {
		return false;
	}
	if (!/[a-z]/.test(trimmed)) {
		// Requires at least one LOWERCASE letter, so all-caps technical
		// constants/enum values (`'POST'`, `'UTC'`, `'ACTIVE'`) and
		// symbol/digit-only strings don't false-positive — real UI copy is
		// never all-caps in this codebase's i18n bundles. r5-shell-F2: this
		// deliberately does NOT also require an initial capital letter — the
		// round-5 finding's exact evasion, `code="500 — Server Error"`, starts
		// with a digit, and a leading-capital requirement made it invisible.
		return false;
	}
	// Requires internal whitespace — a real sentence/phrase reads as multiple
	// words. This is deliberately NOT "long enough" as a fallback: kebab-case
	// identifiers, slugs, and URLs (`staff-tenant-user-details-empty`,
	// `https://example.com`) are frequently long, lowercase, and
	// letter-only, and a length-only fallback flagged all of them. Requiring
	// a space excludes every one of those (no CSS-identifier/URL/email
	// spelling in this codebase contains a literal space) while still
	// catching any multi-word phrase, however it's capitalized.
	return /\s/.test(trimmed);
};

// W5-PROOF: the internal-whitespace requirement above exists to keep
// kebab-case testIds and URL/email placeholders out of the ambiguous
// positions (bare string literals, `??`/`||` fallbacks, parameter defaults),
// but it made single-word real copy ("Delete", "Save", "Suspendre")
// completely invisible everywhere it appears — including positions that are
// BY DEFINITION user-visible copy, not ambiguous at all. For those positions
// (JSX text content, and the ALWAYS_COPY_ATTRIBUTE_NAMES attributes/props
// below) any non-empty, letter-containing, non-all-caps literal is a
// finding — no word-count requirement — since there is no wiring/testId use
// case competing for those positions the way there is for a bare literal or
// a `??` fallback.
const isCopyLikeLiteral = (value: string): boolean => {
	const trimmed = value.trim();
	if (
		trimmed.length < 2 ||
		LOCALE_SELF_NAME_ALLOWLIST.has(trimmed) ||
		NEVER_TRANSLATED_LITERAL_ALLOWLIST.has(trimmed) ||
		URL_EMAIL_OR_DOMAIN_PATTERN.test(trimmed) ||
		// W5-HARDEN: widening ALWAYS_COPY-style detection to a `subtitle:`
		// object property (see COPY_LIKE_ATTRIBUTE_NAME_PATTERN) surfaced a real
		// false positive — a `Record<Branch, { headline; subtitle }>` lookup
		// table whose values are i18n KEYS
		// (`accept-invitation-brand-subtitle-new-user`), passed to `t()`
		// elsewhere, exactly like KEY_MAP_DECLARATION_PATTERN's extraction above
		// already treats multi-segment kebab-case values as candidate keys, not
		// copy. Real UI copy in this codebase is never all-lowercase-and-hyphens
		// with 3+ segments, so this is a safe, general exemption, not a
		// per-file patch.
		KEBAB_I18N_KEY_CANDIDATE.test(trimmed)
	) {
		return false;
	}
	// Same all-caps technical-constant exemption as isProseLikeLiteral
	// ('POST', 'UTC', 'ACTIVE') — deliberately no whitespace requirement.
	return /[a-z]/.test(trimmed);
};

// r5-tests-F2: attribute names that are structurally never user-visible copy
// (styling/wiring/enum-valued props) are exempted regardless of how
// prose-like their string value looks, so `variant="Outline"`-shaped typos
// in enum props don't become permanent false positives the suite has to
// suppress one-by-one. Everything else — including component-specific copy
// props this list has never heard of (`description`, `helperText`,
// `emptyText`, ...) — is evaluated as a copy candidate.
const NEVER_COPY_ATTRIBUTE_NAMES = new Set([
	'className',
	'id',
	'key',
	'ref',
	'name',
	'type',
	'role',
	'variant',
	'size',
	'as',
	'to',
	'href',
	'path',
	'icon',
	'color',
	'align',
	'side',
	'sideOffset',
	'direction',
	'orientation',
	'value',
	'defaultValue',
	'min',
	'max',
	'step',
	'pattern',
	'autoComplete',
	'rel',
	'target',
	'method',
	'htmlFor',
	'style',
	'src',
	'srcSet',
	'sizes',
	'width',
	'height',
	'viewBox',
	'fill',
	'stroke',
	'xmlns',
	'data-testid',
	'data-rail-item',
	'data-slot',
]);

// W5-PROOF: attribute/prop names that are BY DEFINITION user-visible copy
// wherever they appear — a single word here ("Delete", "Cancel") is exactly
// as much a fabricated-English-copy problem as a full sentence, so these are
// checked with isCopyLikeLiteral (no internal-whitespace requirement)
// instead of the conservative isProseLikeLiteral used for ambiguous
// positions.
const ALWAYS_COPY_ATTRIBUTE_NAMES = new Set([
	'aria-label',
	'aria-description',
	'placeholder',
	'title',
	'label',
	'description',
	'alt',
]);

// W5-HARDEN (W5-VERIFY2): `<Widget emptyText="Empty" tooltip="Delete" />`
// sailed through — `emptyText`/`tooltip` aren't in ALWAYS_COPY_ATTRIBUTE_NAMES,
// so they fell back to isProseLikeLiteral's internal-whitespace requirement
// and single-word copy in those props was invisible. A hand-typed name list
// can never keep up with every copy-bearing prop this codebase's components
// will ever invent, so this is a naming-convention pattern instead: any
// attribute/prop name ending in one of these copy-suggesting suffixes is
// treated as a definite-copy position (isCopyLikeLiteral, no whitespace
// requirement), the same way ALWAYS_COPY_ATTRIBUTE_NAMES already is. Names in
// NEVER_COPY_ATTRIBUTE_NAMES are still checked first and win regardless
// (e.g. a hypothetical `errorColor` prop would match `color`'s exemption
// before it reached this pattern — NEVER_COPY_ATTRIBUTE_NAMES is an exact-name
// set, not suffix-based, so that particular clash doesn't arise today).
const COPY_LIKE_ATTRIBUTE_NAME_PATTERN =
	/(?:text|label|title|description|message|tooltip|caption|heading|subtitle|hint|placeholder|prompt|summary|content|copy|error|warning|empty)$/i;

const isDefiniteCopyPositionName = (name: string): boolean =>
	ALWAYS_COPY_ATTRIBUTE_NAMES.has(name) ||
	COPY_LIKE_ATTRIBUTE_NAME_PATTERN.test(name);

// W5-HARDEN: widening the object-literal-property check surfaced real false
// positives — `title`/`content`/`description` are also the field names of
// two unrelated, genuinely non-copy shapes that already exist throughout
// this codebase: an RFC 7807-style problem-details object (`{ status,
// responseStatusCode, title: 'Unauthorized', detail }`, per
// docs/guides/architecture-details.md's error-response convention — the
// actual user-facing text is produced by `t()` keyed off `.translationKey`
// elsewhere, same rationale as this file's `i18n-guard-ignore` convention),
// and a `<meta>`/SEO descriptor (`{ name: 'viewport', content: '...' }`,
// `{ property: 'og:title', content: title }`, a TanStack Router `head()`
// result with `title`/`meta`/`links` siblings). Both are recognizable
// structurally by a sibling key that never appears on a real UI-copy object:
// flag `title`/`content`/`description`/`subtitle` only when the enclosing
// object literal has NONE of these siblings.
const META_OR_PROBLEM_DETAILS_SIBLING_KEYS = new Set([
	'name',
	'property',
	'charSet',
	'meta',
	'links',
	'canonical',
	'sitemap',
	'robots',
	'status',
	'responseStatusCode',
	'httpStatus',
	'translationKey',
	'detail',
]);

const isMetaOrProblemDetailsDescriptor = (node: ts.Node): boolean =>
	ts.isObjectLiteralExpression(node) &&
	node.properties.some(
		(property) =>
			property.name &&
			(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
			META_OR_PROBLEM_DETAILS_SIBLING_KEYS.has(property.name.text),
	);

// W5-HARDEN: imperative DOM property writes that land copy on-screen exactly
// like the JSX attributes above do, just through a different API
// (`element.title = 'Delete'` instead of `<span title="Delete" />`).
const COPY_LIKE_DOM_PROPERTY_NAMES = new Set([
	'title',
	'textContent',
	'innerText',
]);

// An opt-out comment on the line directly above the offending line, mirroring
// check-design-system.mjs's `design-system-ignore` convention — requires a
// reason so the suppression has to be argued, not just added. Reserved for
// genuine non-presentation strings (e.g. an internal Error payload field
// that is never rendered raw — the actual user-facing copy is produced by
// `t()` keyed off `.status`/`.translationKey` elsewhere).
const I18N_GUARD_SUPPRESSION_PREFIX = 'i18n-guard-ignore:';

const isI18nGuardSuppressed = (
	lines: string[],
	lineNumber: number,
): boolean => {
	const previous = lines[lineNumber - 2] ?? '';
	const at = previous.indexOf(I18N_GUARD_SUPPRESSION_PREFIX);
	if (at === -1) {
		return false;
	}
	return isSubstantiveSuppressionReason(
		previous.slice(at + I18N_GUARD_SUPPRESSION_PREFIX.length),
	);
};

// Two prose-literal string values are eligible findings: a bare string
// literal, or a ternary whose both branches are string literals (the
// `cond ? 'A' : 'B'` shape `t()` calls never sit next to). Anything else —
// an identifier, a `t(...)` call, a template literal with interpolation, a
// ternary with a non-literal branch — is presumed already i18n-aware or
// non-copy, and is left alone.
const collectProseLiteralValues = (
	expression: ts.Expression,
	isCopy: (value: string) => boolean = isProseLikeLiteral,
): string[] => {
	if (ts.isStringLiteralLike(expression)) {
		return isCopy(expression.text) ? [expression.text] : [];
	}

	if (ts.isConditionalExpression(expression)) {
		const whenTrue = collectProseLiteralValues(expression.whenTrue, isCopy);
		const whenFalse = collectProseLiteralValues(expression.whenFalse, isCopy);
		if (
			ts.isStringLiteralLike(expression.whenTrue) &&
			ts.isStringLiteralLike(expression.whenFalse) &&
			(whenTrue.length > 0 || whenFalse.length > 0)
		) {
			return [...whenTrue, ...whenFalse];
		}
	}

	return [];
};

const findHardcodedUiLiterals = (
	source: string,
	relativePath: string,
): string[] => {
	const findings: string[] = [];
	const lines = source.split('\n');

	const sourceFile = ts.createSourceFile(
		relativePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		relativePath.endsWith('.tsx') || !relativePath.endsWith('.ts')
			? ts.ScriptKind.TSX
			: ts.ScriptKind.TS,
	);

	const lineOf = (pos: number): number =>
		sourceFile.getLineAndCharacterOfPosition(pos).line + 1;

	const report = (node: ts.Node, text: string): void => {
		const lineNumber = lineOf(node.getStart(sourceFile));
		if (isI18nGuardSuppressed(lines, lineNumber)) {
			return;
		}
		findings.push(`${relativePath}:${lineNumber}: ${text}`);
	};

	const visit = (node: ts.Node): void => {
		if (ts.isJsxText(node)) {
			const text = node.text.replace(/\s+/g, ' ').trim();
			if (text.length > 0 && /[a-zA-Z]/.test(text) && isCopyLikeLiteral(text)) {
				report(node, `JSX text "${text}"`);
			}
		} else if (
			ts.isJsxExpression(node) &&
			node.expression &&
			!ts.isJsxAttribute(node.parent)
		) {
			// A JSX attribute's `={...}` value is handled below via
			// JsxAttribute so it can see the attribute name; this branch only
			// fires for a bare expression sitting directly in element/fragment
			// content (`{'Delete account'}`).
			for (const value of collectProseLiteralValues(node.expression)) {
				report(node, `JSX expression child {${JSON.stringify(value)}}`);
			}
		} else if (ts.isJsxAttribute(node)) {
			const attrName = node.name.getText(sourceFile);
			if (!NEVER_COPY_ATTRIBUTE_NAMES.has(attrName)) {
				const isCopy = isDefiniteCopyPositionName(attrName)
					? isCopyLikeLiteral
					: isProseLikeLiteral;
				const initializer = node.initializer;
				if (initializer && ts.isStringLiteral(initializer)) {
					if (isCopy(initializer.text)) {
						report(node, `${attrName}="${initializer.text}"`);
					}
				} else if (
					initializer &&
					ts.isJsxExpression(initializer) &&
					initializer.expression
				) {
					for (const value of collectProseLiteralValues(
						initializer.expression,
						isCopy,
					)) {
						report(node, `${attrName}={"${value}"}`);
					}
				}
			}
		} else if (
			ts.isPropertyAssignment(node) &&
			(ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
			// W5-HARDEN (W5-VERIFY2): `{ title: 'Delete' }` sailed through — only
			// an object-literal property literally named `label` was checked.
			// Widened to the same definite-copy name set JSX attributes use
			// (`title`, `description`, `tooltip`, `emptyText`, ...), so a plain
			// object-literal toast/column/option config is covered the same way
			// a component prop is, not just the one hand-picked key.
			isDefiniteCopyPositionName(node.name.text) &&
			!isMetaOrProblemDetailsDescriptor(node.parent)
		) {
			for (const value of collectProseLiteralValues(
				node.initializer,
				isCopyLikeLiteral,
			)) {
				report(node, `${node.name.text}: "${value}"`);
			}
		} else if (
			// W5-HARDEN (W5-VERIFY2): `element.title = 'Delete'` and
			// `element.setAttribute('aria-label', 'Cancel')` are imperative DOM
			// writes — entirely outside the JSX-attribute/object-literal shapes
			// above. `element.title =`/`.textContent =`/`.innerText =` assigns a
			// copy-bearing DOM property directly; `setAttribute` with a
			// definite-copy attribute name (`aria-label`, `title`, ...) does the
			// same through a different API. Both are covered here instead of
			// only the declarative shapes.
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			ts.isPropertyAccessExpression(node.left) &&
			COPY_LIKE_DOM_PROPERTY_NAMES.has(node.left.name.text)
		) {
			for (const value of collectProseLiteralValues(
				node.right,
				isCopyLikeLiteral,
			)) {
				report(node, `${node.left.name.text} = "${value}"`);
			}
		} else if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.name.text === 'setAttribute' &&
			node.arguments.length >= 2 &&
			ts.isStringLiteralLike(node.arguments[0]) &&
			isDefiniteCopyPositionName(node.arguments[0].text)
		) {
			const attrName = node.arguments[0].text;
			for (const value of collectProseLiteralValues(
				node.arguments[1],
				isCopyLikeLiteral,
			)) {
				report(node, `setAttribute("${attrName}", "${value}")`);
			}
		} else if (
			(ts.isBinaryExpression(node) &&
				(node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
					node.operatorToken.kind === ts.SyntaxKind.BarBarToken)) ||
			ts.isParameter(node)
		) {
			// `??`/`||` fallback feeding a display string, and a destructured
			// parameter's default value (`placeholder = 'Select…'`) — both
			// r4-shell-F2 shapes, now handled by the same literal/ternary
			// collector instead of their own bespoke regex.
			let candidate: ts.Expression | undefined;
			if (ts.isParameter(node)) {
				candidate = node.initializer;
			} else if (ts.isBinaryExpression(node)) {
				candidate = node.right;
			}
			if (candidate) {
				for (const value of collectProseLiteralValues(candidate)) {
					report(node, `"${value}"`);
				}
			}
		} else if (
			ts.isVariableDeclaration(node) &&
			node.initializer &&
			ts.isConditionalExpression(node.initializer)
		) {
			// `const label = cond ? 'A' : 'B'` — a ternary assigned straight
			// to a variable, never passed to `t()` at the assignment site.
			for (const value of collectProseLiteralValues(node.initializer)) {
				report(node, `"${value}"`);
			}
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);

	return findings;
};

describe('i18n key coverage', () => {
	// r4-tests-F1: the review's exact planted example against the pre-fix
	// detector reported "planted hardcoded UI matches: 0" — a plain JSX text
	// node and an unbraced string attribute were both invisible. This canary
	// fails if that class of blindness ever regresses.
	test('findHardcodedUiLiterals catches plain JSX text and an unbraced string attribute (r4-tests-F1 canary)', () => {
		const findings = findHardcodedUiLiterals(
			'<p>Password reset sent</p><button aria-label="Delete account">Delete account</button>',
			'canary.tsx',
		);

		expect(findings).toContainEqual(
			expect.stringContaining('Password reset sent'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('aria-label="Delete account"'),
		);
	});

	// r5-tests-F2: four evasions different in shape from the round-4 canary
	// above — a custom (non-native) component tag, JSX text wrapped across
	// multiple lines, a copy-bearing attribute name outside the old
	// aria-label/placeholder/title allowlist, and a bare string literal sitting
	// directly as a JSX expression child with no attribute at all. The old
	// regex grammar found none of these; each is planted here, proven caught,
	// and this canary now guards the class instead of the one cited example.
	test('findHardcodedUiLiterals catches a custom component tag, multiline JSX text, an arbitrary copy prop, and a bare expression child (r5-tests-F2 canary)', () => {
		const findings = findHardcodedUiLiterals(
			[
				'<Button>Delete account</Button>',
				'<p>\n\tPassword reset sent\n</p>',
				'<Empty description="No invitations yet" />',
				"<span>{'Delete account'}</span>",
			].join('\n'),
			'canary.tsx',
		);

		expect(findings).toContainEqual(expect.stringContaining('Delete account'));
		expect(findings).toContainEqual(
			expect.stringContaining('Password reset sent'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('description="No invitations yet"'),
		);
		expect(
			findings.some((finding) => finding.includes('JSX expression child')),
		).toBe(true);
	});

	// r5-shell-F2: the exact live regression this canary must never miss again
	// — a numeric-leading `code="500 — Server Error"` prop was invisible to
	// the round-4 detector's "must start with an uppercase letter" heuristic.
	test('findHardcodedUiLiterals catches a numeric-leading component prop (r5-shell-F2 canary)', () => {
		const findings = findHardcodedUiLiterals(
			'<AppErrorView code="500 — Server Error" />',
			'canary.tsx',
		);

		expect(findings).toContainEqual(
			expect.stringContaining('code="500 — Server Error"'),
		);
	});

	// W5-PROOF: isProseLikeLiteral's internal-whitespace requirement made any
	// single-word piece of real UI copy invisible everywhere — a large share
	// of real button/aria copy. Each of these single-word shapes must now be
	// caught in the definite-copy positions (JSX text, aria-label, title,
	// placeholder).
	test('findHardcodedUiLiterals catches single-word copy in aria-label, title, JSX text, and placeholder (W5-PROOF canary)', () => {
		const findings = findHardcodedUiLiterals(
			[
				'<button aria-label="Delete">X</button>',
				'<span title="Cancel">X</span>',
				'<Button>Delete</Button>',
				'<input placeholder="Save" />',
			].join('\n'),
			'canary.tsx',
		);

		expect(findings).toContainEqual(
			expect.stringContaining('aria-label="Delete"'),
		);
		expect(findings).toContainEqual(expect.stringContaining('title="Cancel"'));
		expect(findings).toContainEqual(
			expect.stringContaining('JSX text "Delete"'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('placeholder="Save"'),
		);
	});

	// W5-PROOF: the relaxed no-whitespace-required check for definite-copy
	// positions must not turn real, legitimate single-word technical values in
	// those SAME positions into false positives — a testId-shaped value, a
	// URL/email placeholder example, and the brand wordmark.
	test('findHardcodedUiLiterals does not flag testIds, URL/email placeholder examples, or the brand wordmark (W5-PROOF canary)', () => {
		const findings = findHardcodedUiLiterals(
			[
				'<button data-testid="delete-account-button">{t(\'delete\')}</button>',
				'<input placeholder="user@example.com" />',
				'<input placeholder="https://example.com" />',
				'<img alt="PublyApp" />',
				'<span>PublyApp</span>',
			].join('\n'),
			'canary.tsx',
		);

		expect(findings).toEqual([]);
	});

	test('findHardcodedUiLiterals does not flag structural/enum props, t() calls, or the locale self-name allowlist', () => {
		const findings = findHardcodedUiLiterals(
			[
				'<Button variant="Outline" type="Submit" className="MyClass">{t(\'submit\')}</Button>',
				"<span aria-label={t('submit')}>{t('submit')}</span>",
				"const label = locale === 'fr' ? 'Français' : 'English';",
			].join('\n'),
			'canary.tsx',
		);

		expect(findings).toEqual([]);
	});

	// W5-VERIFY2: all four of these evaded the pre-hardening detector — the
	// URL exemption was prefix-only, `emptyText`/`tooltip` weren't on the
	// hand-typed always-copy list, imperative DOM writes were outside the
	// AST visitor entirely, and only a `label:` object property was checked.
	test('findHardcodedUiLiterals catches copy trailing a URL, an arbitrary copy prop, imperative DOM writes, and a non-label object property (W5-VERIFY2 canary)', () => {
		const findings = findHardcodedUiLiterals(
			[
				'<button aria-label="https://example.com Delete account" />',
				'<Widget emptyText="Empty" tooltip="Delete" />',
				"element.title = 'Delete';",
				"element.setAttribute('aria-label', 'Cancel');",
				"export const verifyToastCopy = { title: 'Delete' };",
			].join('\n'),
			'canary.tsx',
		);

		expect(findings).toContainEqual(
			expect.stringContaining('https://example.com Delete account'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('emptyText="Empty"'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('tooltip="Delete"'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('title = "Delete"'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('setAttribute("aria-label", "Cancel")'),
		);
		expect(findings).toContainEqual(expect.stringContaining('title: "Delete"'));
	});

	// The URL/email exemption must still hold when the value IS purely a
	// URL/email/domain-path and nothing trails it — the anchoring fix must
	// not turn every legitimate placeholder into a false positive.
	test('findHardcodedUiLiterals still exempts a bare URL/email placeholder after the anchoring fix', () => {
		const findings = findHardcodedUiLiterals(
			[
				'<input placeholder="https://example.com" />',
				'<input placeholder="user@example.com" />',
				'<input placeholder="publyapp.com/free-trial" />',
			].join('\n'),
			'canary.tsx',
		);

		expect(findings).toEqual([]);
	});

	test('every t()/i18nKey literal under src resolves in both common bundles', async () => {
		const usagesByKey = await extractI18nKeyUsages(srcDir);
		expect(usagesByKey.size).toBeGreaterThan(0);

		const missingEn: string[] = [];
		const missingFr: string[] = [];

		for (const [key, usages] of usagesByKey) {
			if (!resolvesInBundle(key, enResource.common)) {
				missingEn.push(`${key} (${usages.join(', ')})`);
			}
			if (!resolvesInBundle(key, frResource.common)) {
				missingFr.push(`${key} (${usages.join(', ')})`);
			}
		}

		expect(missingEn, 'keys missing from common.en.json').toEqual([]);
		expect(missingFr, 'keys missing from common.fr.json').toEqual([]);
	});

	// r3-tests-F6: a canary for the scalar-`*_KEY` extractor itself going
	// blind (e.g. a future refactor of SCALAR_KEY_DECLARATION_PATTERN that
	// stops matching real declarations) — without this, the extractor could
	// silently stop seeing data-table.tsx's `SELECTION_LOCKED_TITLE_KEY` and
	// the coverage test above would pass for the wrong reason (0 usages
	// found, not 0 missing keys).
	test('the scalar-*_KEY extractor still sees the r3-tests-F6 canary key', async () => {
		const usagesByKey = await extractI18nKeyUsages(srcDir);

		expect(usagesByKey.has('selection-locked-while-selecting')).toBe(true);
	});

	test('no hardcoded English UI literal escapes t() (r3-shell-F2)', async () => {
		const files = await collectFiles(srcDir);
		const findings: string[] = [];

		for (const absolutePath of files) {
			if (
				absolutePath.endsWith('.test.ts') ||
				absolutePath.endsWith('.test.tsx')
			) {
				continue;
			}

			const relativePath = path.relative(srcDir, absolutePath);
			const source = await readFile(absolutePath, 'utf8');
			findings.push(...findHardcodedUiLiterals(source, relativePath));
		}

		expect(findings, 'hardcoded English literals bypassing t()').toEqual([]);
	});
});

describe('i18n-guard-ignore suppression requires a substantive reason', () => {
	// `isI18nGuardSuppressed` only inspects the line directly above the
	// offending line, so each fixture below is a two-line `lines` array.
	const notSuppressed = (previousLine: string) =>
		expect(isI18nGuardSuppressed([previousLine, "'Delete'"], 2)).toBe(false);

	test('rejects an empty JSX comment marker (`*/}` is not a reason)', () => {
		notSuppressed('{/* i18n-guard-ignore: */}');
	});

	test('rejects an empty line-comment marker', () => {
		notSuppressed('// i18n-guard-ignore:');
	});

	test('rejects an empty block-comment marker with trailing whitespace', () => {
		notSuppressed('/* i18n-guard-ignore:   */');
	});

	test('rejects a single-character non-reason', () => {
		notSuppressed('{/* i18n-guard-ignore: . */}');
	});

	test('rejects an empty JSX comment marker with trailing spaces', () => {
		notSuppressed('{/* i18n-guard-ignore: */}   ');
	});

	test('accepts a genuine reasoned suppression', () => {
		expect(
			isI18nGuardSuppressed(
				[
					'{/* i18n-guard-ignore: internal error payload field, never rendered raw */}',
					"'Delete'",
				],
				2,
			),
		).toBe(true);
	});

	// W5-VERIFY2 planted `{/* i18n-guard-ignore: 123 */}` and it suppressed the
	// violation. Same shared bar as data-honesty-ignore — see
	// suppression-reason.ts.
	test('rejects a digit-only noise reason', () => {
		notSuppressed('{/* i18n-guard-ignore: 123 456 789 */}');
	});

	test('rejects a repeated-character noise word', () => {
		notSuppressed('{/* i18n-guard-ignore: xxx */}');
	});

	test('rejects a punctuation-only noise reason', () => {
		notSuppressed('{/* i18n-guard-ignore: !!! --- ??? */}');
	});
});

describe('i18n-guard-ignore suppression sites match the committed inventory', () => {
	// W5-HARDEN: same structural backstop as the data-honesty-ignore
	// inventory check — every real suppression site under src/ must be
	// checked into suppression-inventory.json.
	test('every i18n-guard-ignore site under src is documented, and no inventory entry is stale', async () => {
		const files = await collectFiles(srcDir);
		const found: SuppressionSite[] = [];

		for (const absolutePath of files) {
			const relativePath = `src/${path.relative(srcDir, absolutePath).split(path.sep).join('/')}`;
			const source = await readFile(absolutePath, 'utf8');
			found.push(
				...findSuppressionSitesInSource(source, relativePath).filter(
					(site) => site.convention === 'i18n-guard-ignore',
				),
			);
		}

		const relevantInventory = (
			suppressionInventory as SuppressionSite[]
		).filter((site) => site.convention === 'i18n-guard-ignore');

		const { undocumented, stale } = diffSuppressionInventory(
			found,
			relevantInventory,
		);

		expect(undocumented, 'undocumented suppression sites').toEqual([]);
		expect(stale, 'stale inventory entries').toEqual([]);
	});
});
