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

// r5-guards: `tenants/**` was temporarily exempted from the raw-dash-fallback
// check because it was mid-edit by a concurrent packet and several files
// there carried the same `|| '—'` shape for REQUIRED identity fields
// (`tenants/$tenantId/users.tsx`, `tenants/$tenantId.tsx`,
// `tenants/$tenantId/invitations.tsx`, `tenants/$tenantId/profiles.tsx`,
// `tenants/$tenantId/users/$userId.tsx`). Those have all been swept — the
// mappers now guarantee non-null email/name, so the rendering-boundary
// fallback was dead defensive code and has been removed — so the exemption
// is gone and this check now runs repeat-wide, same as the other two.
// `tenants/**`'s remaining `'—'`/`??` fallbacks are for genuinely OPTIONAL
// fields (tenant code/legalName/avatarUrl, an enum `level`, and date
// formatters' "no value" case) and are not this rule's target.
type PlaceholderCheck = {
	name: string;
	description: string;
	pattern: RegExp;
};

const CHECKS: PlaceholderCheck[] = [
	{
		name: 'todo-contract-dash-adjacency',
		description:
			'a `TODO(contract)` comment immediately followed by a bare dash rendered as the only content',
		// Accepts both the em-dash and a plain hyphen after the comment — the
		// original pattern only matched the em-dash.
		pattern: /\{\/\*\s*TODO\(contract\)[\s\S]*?\*\/\}\s*[—-]/,
	},
	{
		name: 'raw-dash-fallback',
		description:
			"a raw '-'/'—' literal used as a JSX fallback for otherwise-real data (`value || '-'`, `cond ? '—' : value`), which reads as real data to an administrator",
		pattern:
			/(\|\|\s*['"][-—]['"])|(\?\s*['"][-—]['"]\s*:)|(:\s*['"][-—]['"](?!\s*[a-zA-Z]))/,
	},
	{
		name: 'not-available-key-as-content',
		description:
			'a translation key ending in `-not-available` rendered directly as page content (internal roadmap/API-absence prose standing in for a real feature)',
		pattern: /\bt\(\s*['"][\w-]+-not-available['"]/,
	},
];

// An opt-out comment on the line directly above the offending line, mirroring
// check-design-system.mjs's `design-system-ignore` convention and
// i18n-key-coverage.test.ts's `i18n-guard-ignore` — requires a reason so the
// suppression has to be argued, not just added. Reserved for genuinely
// defensible dash fallbacks that are NOT identity fabrication — e.g. a
// relative-time/date formatter's "no value" case (`formatRelativeTime`-style
// `condition ? t(key) : '—'`), which every reviewer in this remediation chain
// (r5-shell, W5-UA, W5-TEN) independently classified as a distinct, accepted
// UX convention rather than a fabricated identity.
const DATA_HONESTY_SUPPRESSION_PREFIX = 'data-honesty-ignore:';

const isDataHonestySuppressed = (
	lines: string[],
	lineNumber: number,
): boolean => {
	const previous = lines[lineNumber - 2] ?? '';
	const at = previous.indexOf(DATA_HONESTY_SUPPRESSION_PREFIX);
	return (
		at !== -1 &&
		previous.slice(at + DATA_HONESTY_SUPPRESSION_PREFIX.length).trim().length >
			0
	);
};

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
				const source = await readFile(file, 'utf8');
				const lines = source.split('\n');
				const relativePath = path.relative(staffDir, file);
				// `matchAll` (not a single `.test()`) so a multi-line match — the
				// todo-contract-dash-adjacency pattern spans a comment line and the
				// dash on the next line — still reports the DASH's line number, not
				// just whether the file matched anywhere at all.
				const globalPattern = new RegExp(
					check.pattern.source,
					check.pattern.flags.includes('g')
						? check.pattern.flags
						: `${check.pattern.flags}g`,
				);

				for (const match of source.matchAll(globalPattern)) {
					const lineNumber = source
						.slice(0, match.index + match[0].length)
						.split('\n').length;
					if (!isDataHonestySuppressed(lines, lineNumber)) {
						offenders.push(`${relativePath}:${lineNumber}`);
					}
				}
			}

			expect(offenders).toEqual([]);
		});
	}
});
