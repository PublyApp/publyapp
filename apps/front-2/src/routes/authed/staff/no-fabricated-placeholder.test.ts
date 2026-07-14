import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

// Guards docs/guides/front-2/conventions.md's §Content & data honesty rule:
// "never render fabricated or placeholder admin data". `0bb834f7` restored a
// column whose cell was a `TODO(contract)` comment immediately followed by a
// bare em-dash rendered as the only content — the mechanically-detectable
// shape this test blocks. A real `TODO(contract)` note explaining why a field
// is read-only (not standing in for missing data) is fine; only the
// comment-then-em-dash placeholder pattern fails.
const staffDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)));

const FABRICATED_PLACEHOLDER_PATTERN =
	/\{\/\*\s*TODO\(contract\)[\s\S]*?\*\/\}\s*—/;

const collectSourceFiles = async (dir: string): Promise<string[]> => {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectSourceFiles(fullPath)));
			continue;
		}
		if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.tsx')) {
			files.push(fullPath);
		}
	}

	return files;
};

describe('staff surface data-honesty guard', () => {
	test('never renders a TODO(contract)-commented em-dash as fabricated column data', async () => {
		const files = await collectSourceFiles(staffDir);
		const offenders: string[] = [];

		for (const file of files) {
			const source = await readFile(file, 'utf8');
			if (FABRICATED_PLACEHOLDER_PATTERN.test(source)) {
				offenders.push(path.relative(staffDir, file));
			}
		}

		expect(offenders).toEqual([]);
	});
});
