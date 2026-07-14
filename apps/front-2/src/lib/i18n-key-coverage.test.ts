import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, test } from 'vitest';

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

// An opt-out comment on the line directly above the offending line, mirroring
// check-design-system.mjs's `design-system-ignore` convention — requires a
// reason so the suppression has to be argued, not just added. Reserved for
// genuine non-presentation strings (e.g. an internal Error payload field
// that is never rendered raw — the actual user-facing copy is produced by
// `t()` keyed off `.status`/`.translationKey` elsewhere).
const I18N_GUARD_SUPPRESSION_PREFIX = 'i18n-guard-ignore:';

// Strips whatever comment syntax the file allows (`//`, `/* */`, `{/* */}`)
// off the tail of the reason before testing it for substance, so a bare
// `{/* i18n-guard-ignore: */}` — whose only "reason" text is the comment's
// own closing delimiters — cannot pass as a reasoned suppression.
const extractSuppressionReason = (rawReason: string): string =>
	rawReason.replace(/(\*\/\}|\*\/|\}|-->)\s*$/, '').trim();

const isI18nGuardSuppressed = (
	lines: string[],
	lineNumber: number,
): boolean => {
	const previous = lines[lineNumber - 2] ?? '';
	const at = previous.indexOf(I18N_GUARD_SUPPRESSION_PREFIX);
	if (at === -1) {
		return false;
	}
	const reason = extractSuppressionReason(
		previous.slice(at + I18N_GUARD_SUPPRESSION_PREFIX.length),
	);
	return (reason.match(/\w/g)?.length ?? 0) >= 3;
};

// Two prose-literal string values are eligible findings: a bare string
// literal, or a ternary whose both branches are string literals (the
// `cond ? 'A' : 'B'` shape `t()` calls never sit next to). Anything else —
// an identifier, a `t(...)` call, a template literal with interpolation, a
// ternary with a non-literal branch — is presumed already i18n-aware or
// non-copy, and is left alone.
const collectProseLiteralValues = (expression: ts.Expression): string[] => {
	if (ts.isStringLiteralLike(expression)) {
		return isProseLikeLiteral(expression.text) ? [expression.text] : [];
	}

	if (ts.isConditionalExpression(expression)) {
		const whenTrue = collectProseLiteralValues(expression.whenTrue);
		const whenFalse = collectProseLiteralValues(expression.whenFalse);
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
			if (
				text.length > 0 &&
				/[a-zA-Z]/.test(text) &&
				isProseLikeLiteral(text)
			) {
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
				const initializer = node.initializer;
				if (initializer && ts.isStringLiteral(initializer)) {
					if (isProseLikeLiteral(initializer.text)) {
						report(node, `${attrName}="${initializer.text}"`);
					}
				} else if (
					initializer &&
					ts.isJsxExpression(initializer) &&
					initializer.expression
				) {
					for (const value of collectProseLiteralValues(
						initializer.expression,
					)) {
						report(node, `${attrName}={"${value}"}`);
					}
				}
			}
		} else if (
			ts.isPropertyAssignment(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === 'label'
		) {
			for (const value of collectProseLiteralValues(node.initializer)) {
				report(node, `label: "${value}"`);
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
});
