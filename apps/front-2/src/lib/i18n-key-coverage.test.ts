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
