import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

// Guards docs/guides/front-2/conventions.md's §Content & data honesty rule:
// "never render fabricated or placeholder admin data".
//
// r5-F5 found the original guard (a single TODO(contract)-then-em-dash
// adjacency check) missed every other shape the same violation actually
// takes in this codebase: a whole Security card rendering a contract-absence
// message as if it were product content, and raw `|| '-'`/`|| '—'` fallbacks
// silently standing in for required identity data in table cells. None of
// those needed a `TODO(contract)` comment nearby to read as fabricated data
// to an administrator — the comment was never the signal, the rendered
// placeholder-as-data was. This file now checks for each shape independently
// so a future regression fails on substance, not on this one adjacency.
const staffDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)));

// `tenants/**` is owned by a different remediation lane with its own
// findings queue and is mid-edit by a concurrent packet — several files
// there already carry the same `|| '—'` shape this guard would otherwise
// catch (e.g. `tenants/$tenantId/users.tsx`, `tenants/$tenantId.tsx`). This
// guard intentionally scopes the *new* checks to the paths this fix actually
// covered so it doesn't fail the build for out-of-scope code; the same class
// still needs sweeping there (see W5-UA's report "Handoffs").
const RAW_FALLBACK_EXCLUDED_SEGMENT = `${path.sep}tenants${path.sep}`;

type PlaceholderCheck = {
	name: string;
	description: string;
	pattern: RegExp;
	/** When false, applies repo-wide under `staffDir`; when true, skips the
	 * `tenants/**` subtree (see comment above). */
	scopedToFixedPaths: boolean;
};

const CHECKS: PlaceholderCheck[] = [
	{
		name: 'todo-contract-dash-adjacency',
		description:
			'a `TODO(contract)` comment immediately followed by a bare dash rendered as the only content',
		// Accepts both the em-dash and a plain hyphen after the comment — the
		// original pattern only matched the em-dash.
		pattern: /\{\/\*\s*TODO\(contract\)[\s\S]*?\*\/\}\s*[—-]/,
		scopedToFixedPaths: false,
	},
	{
		name: 'raw-dash-fallback',
		description:
			"a raw '-'/'—' literal used as a JSX fallback for otherwise-real data (`value || '-'`, `cond ? '—' : value`), which reads as real data to an administrator",
		pattern:
			/(\|\|\s*['"][-—]['"])|(\?\s*['"][-—]['"]\s*:)|(:\s*['"][-—]['"](?!\s*[a-zA-Z]))/,
		scopedToFixedPaths: true,
	},
	{
		name: 'not-available-key-as-content',
		description:
			'a translation key ending in `-not-available` rendered directly as page content (internal roadmap/API-absence prose standing in for a real feature)',
		pattern: /\bt\(\s*['"][\w-]+-not-available['"]/,
		scopedToFixedPaths: false,
	},
];

const collectSourceFiles = async (dir: string): Promise<string[]> => {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectSourceFiles(fullPath)));
			continue;
		}
		if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
			files.push(fullPath);
		}
	}

	return files;
};

describe('staff surface data-honesty guard', () => {
	for (const check of CHECKS) {
		test(`never renders ${check.description}`, async () => {
			const files = await collectSourceFiles(staffDir);
			const offenders: string[] = [];

			for (const file of files) {
				if (
					check.scopedToFixedPaths &&
					file.includes(RAW_FALLBACK_EXCLUDED_SEGMENT)
				) {
					continue;
				}

				const source = await readFile(file, 'utf8');
				if (check.pattern.test(source)) {
					offenders.push(path.relative(staffDir, file));
				}
			}

			expect(offenders).toEqual([]);
		});
	}
});
