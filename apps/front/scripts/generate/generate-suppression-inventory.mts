#!/usr/bin/env node
// Regenerates apps/front/src/lib/suppression-inventory.json — the
// committed list of every `data-honesty-ignore`/`i18n-guard-ignore`/
// `design-system-ignore` suppression site in the repo (file + convention +
// reason, no line numbers). Run this whenever you add, remove, or reword a
// suppression comment:
//
//   node apps/front/scripts/generate/generate-suppression-inventory.mts
//
// The three guards (no-fabricated-placeholder.test.ts,
// i18n-key-coverage.test.ts, check-design-system.mts) all fail if reality
// and this file disagree — a suppression that isn't in the inventory, or an
// inventory entry no longer found in code, both fail the build. This is
// deliberate: a suppression must show up in a diff, with its reason, for a
// reviewer to see — see suppression-reason.ts for why a reason-quality
// heuristic alone can't guarantee that.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	findSuppressionSitesInSource,
	type SuppressionSite,
} from '../../src/lib/suppression-reason.ts';

const rootDir = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const scanDirs = ['src', 'e2e'];
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.mjs']);
const inventoryPath = path.join(
	rootDir,
	'src',
	'lib',
	'suppression-inventory.json',
);

const collectFiles = async (dir: string): Promise<string[]> => {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(fullPath)));
			continue;
		}
		if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
			files.push(fullPath);
		}
	}

	return files;
};

const sites: SuppressionSite[] = [];

for (const scanDir of scanDirs) {
	const absoluteDir = path.join(rootDir, scanDir);
	let files;
	try {
		files = await collectFiles(absoluteDir);
	} catch {
		continue;
	}

	for (const absolutePath of files) {
		const relativePath = path
			.relative(rootDir, absolutePath)
			.split(path.sep)
			.join('/');
		const source = await readFile(absolutePath, 'utf8');
		sites.push(...findSuppressionSitesInSource(source, relativePath));
	}
}

sites.sort(
	(a, b) =>
		a.convention.localeCompare(b.convention) ||
		a.file.localeCompare(b.file) ||
		a.reason.localeCompare(b.reason),
);

await writeFile(inventoryPath, `${JSON.stringify(sites, null, '\t')}\n`);

console.error(
	`Wrote ${sites.length} suppression site(s) to ${path.relative(rootDir, inventoryPath)}`,
);
