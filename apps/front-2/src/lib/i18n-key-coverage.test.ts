import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
// (r3-shell-F2). It scans for the shapes hardcoded chrome copy actually
// takes: a literal (or a ternary of two literals) passed straight to
// `aria-label`/`placeholder`/`title`, a `label:` object-literal property, and
// a ternary assigned to a variable that's used as one (the `const label =
// cond ? 'A' : 'B'` shape `t()` calls never appear next to).
// Language self-names (LOCALE_LABELS-style 'English'/'Français') are the one
// legitimate never-translated case: a language's own name isn't localized.
const LOCALE_SELF_NAME_ALLOWLIST = new Set(['English', 'Français']);

const JSX_ATTR_EXPRESSION_PATTERN =
	/\b(aria-label|placeholder|title)=\{([^{}]+)\}/g;
// r4-tests-F1: `aria-label="Delete account"` — a plain, unbraced JSX string
// attribute — is a different token shape than `aria-label={...}` above and
// was invisible to it.
const JSX_ATTR_STRING_LITERAL_PATTERN =
	/\b(aria-label|placeholder|title)=(["'])([A-Z][^"']*)\2/g;
const BARE_STRING_LITERAL_PATTERN = /^(['"])([A-Z][^'"]*)\1$/;
const TERNARY_OF_STRING_LITERALS_PATTERN =
	/^[^?]+\?\s*(['"])([A-Z][^'"]*)\1\s*:\s*(['"])([A-Z][^'"]*)\3$/;
const TOP_LEVEL_TERNARY_ASSIGNMENT_PATTERN =
	/\b(?:const|let)\s+\w+\s*(?::[^=\n]+)?=\s*[^;\n?]*\?\s*(['"])([A-Z][^'"]*)\1\s*:\s*(['"])([A-Z][^'"]*)\3/g;
const LABEL_PROPERTY_LITERAL_PATTERN = /\blabel:\s*(['"])([A-Z][^'"]*)\1/g;

// r4-shell-F2: three live shapes the original detector's grammar could not
// see at all — a destructured parameter's default value (`placeholder =
// 'Select…'`), a `??`/`||` fallback feeding a display string (`normalizeString(
// item.name) ?? 'Unnamed profile'`), and plain JSX text that is a tag's
// entire content (`<span>Unnamed profile</span>`) rather than a `{}` braced
// expression. Each requires its own conservative shape to avoid flagging
// ordinary non-copy defaults (`enabled = false`, `variant = 'outline'`) —
// scoped to a capitalized, multi-character quoted literal.
const DEFAULT_PARAM_LITERAL_PATTERN =
	/\b\w+\s*=\s*(['"])([A-Z][^'"]{1,80})\1\s*[,}]/g;
const NULLISH_OR_FALLBACK_LITERAL_PATTERN =
	/(?:\?\?|\|\|)\s*(['"])([A-Z][^'"]{1,80})\1/g;
const JSX_SOLE_TEXT_CONTENT_PATTERN =
	/<(span|p|h[1-6]|button|label|dt|dd|td|th|li)\b[^>]*>([A-Z][^<{}\n]{1,80})<\/\1>/g;

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
	return (
		at !== -1 &&
		previous.slice(at + I18N_GUARD_SUPPRESSION_PREFIX.length).trim().length > 0
	);
};

const findHardcodedUiLiterals = (
	source: string,
	relativePath: string,
): string[] => {
	const findings: string[] = [];
	const lines = source.split('\n');
	const lineNumberAt = (index: number): number =>
		source.slice(0, index).split('\n').length;

	for (const match of source.matchAll(DEFAULT_PARAM_LITERAL_PATTERN)) {
		if (
			!LOCALE_SELF_NAME_ALLOWLIST.has(match[2]) &&
			!isI18nGuardSuppressed(lines, lineNumberAt(match.index))
		) {
			findings.push(`${relativePath}: ${match[0].trim()}`);
		}
	}

	for (const match of source.matchAll(NULLISH_OR_FALLBACK_LITERAL_PATTERN)) {
		if (
			!LOCALE_SELF_NAME_ALLOWLIST.has(match[2]) &&
			!isI18nGuardSuppressed(lines, lineNumberAt(match.index))
		) {
			findings.push(`${relativePath}: ${match[0]}`);
		}
	}

	for (const match of source.matchAll(JSX_SOLE_TEXT_CONTENT_PATTERN)) {
		if (
			!LOCALE_SELF_NAME_ALLOWLIST.has(match[2].trim()) &&
			!isI18nGuardSuppressed(lines, lineNumberAt(match.index))
		) {
			findings.push(`${relativePath}: ${match[0]}`);
		}
	}

	for (const match of source.matchAll(JSX_ATTR_EXPRESSION_PATTERN)) {
		const [, attrName, expression] = match;
		const trimmed = expression.trim();

		const bare = trimmed.match(BARE_STRING_LITERAL_PATTERN);
		if (bare && !LOCALE_SELF_NAME_ALLOWLIST.has(bare[2])) {
			findings.push(`${relativePath}: ${attrName}={${bare[0]}}`);
			continue;
		}

		const ternary = trimmed.match(TERNARY_OF_STRING_LITERALS_PATTERN);
		if (ternary) {
			for (const value of [ternary[2], ternary[4]]) {
				if (!LOCALE_SELF_NAME_ALLOWLIST.has(value)) {
					findings.push(`${relativePath}: ${attrName}={${trimmed}}`);
					break;
				}
			}
		}
	}

	for (const match of source.matchAll(JSX_ATTR_STRING_LITERAL_PATTERN)) {
		const [, attrName, , value] = match;
		if (
			!LOCALE_SELF_NAME_ALLOWLIST.has(value) &&
			!isI18nGuardSuppressed(lines, lineNumberAt(match.index))
		) {
			findings.push(`${relativePath}: ${attrName}="${value}"`);
		}
	}

	for (const match of source.matchAll(TOP_LEVEL_TERNARY_ASSIGNMENT_PATTERN)) {
		for (const value of [match[2], match[4]]) {
			if (!LOCALE_SELF_NAME_ALLOWLIST.has(value)) {
				findings.push(`${relativePath}: ${match[0].trim()}`);
				break;
			}
		}
	}

	for (const match of source.matchAll(LABEL_PROPERTY_LITERAL_PATTERN)) {
		if (!LOCALE_SELF_NAME_ALLOWLIST.has(match[2])) {
			findings.push(`${relativePath}: ${match[0]}`);
		}
	}

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
			expect.stringContaining('<p>Password reset sent</p>'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('aria-label="Delete account"'),
		);
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
