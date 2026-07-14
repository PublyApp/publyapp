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
	}

	return usagesByKey;
};

// i18next resolves a plural key (`t('assigned-count', { count })`) against
// `<key>_one` / `<key>_other` in the bundle, not the bare key — a literal
// lookup would false-positive on every plural key in the codebase.
const resolvesInBundle = (key: string, bundle: Record<string, unknown>) =>
	key in bundle || `${key}_one` in bundle || `${key}_other` in bundle;

describe('i18n key coverage', () => {
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
});
