/**
 * Exemption-boundary pin for `publy/prefer-query-display` (#1323).
 *
 * The DataTable exemption is load-bearing: the DataTable screens own their
 * own list-state mechanism, so the rule skips them. Before #1323 nothing
 * pinned WHICH files are skipped, so a config or rule edit could widen the
 * exemption silently (a guard-config loosening reviews may miss, cf. #1247).
 *
 * This suite pins the boundary from three independent angles:
 *
 * 1. Config leg — the REAL root `.oxlintrc.json` configures the rule as
 *    plain `"error"` (an option array would be a hidden exemption carrier),
 *    adds no `overrides` entry re-scoping the rule, and does not
 *    `ignorePatterns` the DataTable screens out of linting entirely.
 * 2. Rule-source leg — the exemption constants exported by the real rule
 *    module equal the expected lists EXACTLY (order included). Adding an
 *    entry, removing one, replacing a file path with a glob, or resurrecting
 *    the retired `components/table/` prefix all fail with a +/− delta in the
 *    assertion message.
 * 3. Behavioral leg — the real rule, driven through RuleTester with an
 *    otherwise-violating ladder snippet, reports NOTHING exactly at the
 *    pinned exempt paths and REPORTS everywhere else, including brand-new
 *    files under `components/table/` (the boundary #1323 tightened from the
 *    old broad directory prefix).
 *
 * Shrinking: when QueryDisplay PR 3 lands (DataTable delegating to
 * `resolveTableBodyState` via the `no-match` slot), the DataTable exemption
 * list must SHRINK and this pin updates in the same PR (#1323).
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import {
	ALLOWLISTED_RELATIVE_PATHS,
	EXCLUDED_DATATABLE_RELATIVE_PATHS,
	EXCLUDED_RELATIVE_PREFIXES,
	preferQueryDisplay,
} from './prefer-query-display.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const WORKSPACE_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const OXLINTRC_PATH = fileURLToPath(
	new URL('../../../../.oxlintrc.json', import.meta.url),
);

interface OxlintRootConfig {
	rules?: Record<string, unknown>;
	overrides?: Array<{ rules?: Record<string, unknown> }>;
	ignorePatterns?: string[];
}

const ROOT_CONFIG = JSON.parse(readFileSync(OXLINTRC_PATH, 'utf8'));

/** The DataTable exemption set this pin defends (#1323). */
const EXPECTED_DATATABLE_EXEMPTIONS: readonly string[] = [
	'components/table/data-table.tsx',
	'components/table/floating-selection-bar.tsx',
	'components/table/row-actions.tsx',
];

/** Prefix exclusions: the rule implementation + query-definition modules. */
const EXPECTED_EXCLUDED_PREFIXES: readonly string[] = [
	'components/query-display',
	'lib/query/',
];

/** Auth/routing state-machine route files, by exact path. */
const EXPECTED_ALLOWLISTED_ROUTES: readonly string[] = [
	'routes/__root.tsx',
	'routes/authed/layout.tsx',
	'routes/accept-invitation.tsx',
];

const listDelta = (
	expected: readonly string[],
	actual: readonly string[],
): string => {
	const added = actual.filter((value) => !expected.includes(value));
	const removed = expected.filter((value) => !actual.includes(value));
	return `+ [${added.join(', ')}] - [${removed.join(', ')}]`;
};

/** Glob → RegExp matcher, biased fail-closed (unknown syntax = match). */
const globMatches = (pattern: string, target: string): boolean => {
	const source = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replaceAll('**', '\u0000')
		.replaceAll('*', '[^/]*')
		.replaceAll('\u0000', '.*');
	try {
		return new RegExp(`^${source}$`).test(target);
	} catch {
		return true;
	}
};

describe('publy/prefer-query-display exemption boundary (#1323)', () => {
	it('configures the rule as plain "error" in the real root config', () => {
		const rules = ROOT_CONFIG.rules ?? {};
		assert.strictEqual(
			rules['publy/prefer-query-display'],
			'error',
			'.oxlintrc.json must configure publy/prefer-query-display as bare "error" — an option array or a level change moves the exemption boundary',
		);
	});

	it('has no overrides entry re-scoping the rule', () => {
		const overrides = ROOT_CONFIG.overrides ?? [];
		for (const [index, override] of overrides.entries()) {
			assert.strictEqual(
				override.rules?.['publy/prefer-query-display'],
				undefined,
				`.oxlintrc.json overrides[${index}] re-scopes publy/prefer-query-display — the exemption boundary moved out of the pinned rule source`,
			);
		}
	});

	it('does not ignorePatterns the DataTable screens out of linting', () => {
		const patterns = ROOT_CONFIG.ignorePatterns ?? [];
		for (const pattern of patterns) {
			for (const screen of EXPECTED_DATATABLE_EXEMPTIONS) {
				const workspaceRelative = `apps/front/src/${screen}`;
				const matched =
					globMatches(pattern, screen) ||
					globMatches(pattern, workspaceRelative);
				assert.strictEqual(
					matched,
					false,
					`ignorePatterns entry "${pattern}" exempts ${screen} from linting entirely — the effective exemption widened silently`,
				);
			}
		}
	});

	it('pins the DataTable exemption list to exactly the three screens', () => {
		assert.deepStrictEqual(
			[...EXCLUDED_DATATABLE_RELATIVE_PATHS],
			[...EXPECTED_DATATABLE_EXEMPTIONS],
			`the DataTable exemption list changed: ${listDelta(
				EXPECTED_DATATABLE_EXEMPTIONS,
				[...EXCLUDED_DATATABLE_RELATIVE_PATHS],
			)} — never widen; shrink only with QueryDisplay PR 3 and update this pin in the same PR (#1323)`,
		);
	});

	it('pins the exclusion prefixes exactly (defense-in-depth list)', () => {
		assert.deepStrictEqual(
			[...EXCLUDED_RELATIVE_PREFIXES],
			[...EXPECTED_EXCLUDED_PREFIXES],
			`the exclusion prefix list changed: ${listDelta(
				EXPECTED_EXCLUDED_PREFIXES,
				[...EXCLUDED_RELATIVE_PREFIXES],
			)} — a new or widened prefix (e.g. resurrecting "components/table/") widens the exemption`,
		);
	});

	it('pins the allow-listed route files exactly', () => {
		assert.deepStrictEqual(
			[...ALLOWLISTED_RELATIVE_PATHS],
			[...EXPECTED_ALLOWLISTED_ROUTES],
			`the allow-listed route files changed: ${listDelta(
				EXPECTED_ALLOWLISTED_ROUTES,
				[...ALLOWLISTED_RELATIVE_PATHS],
			)} — exempting another route file is a deliberate, reviewed change`,
		);
	});

	it('names only files that exist on disk (no ghost exemptions)', () => {
		for (const screen of EXPECTED_DATATABLE_EXEMPTIONS) {
			assert.ok(
				existsSync(join(WORKSPACE_ROOT, 'apps/front/src', screen)),
				`exempt screen ${screen} no longer exists — shrink the pin instead of exempting a ghost`,
			);
		}
	});
});

// -- Behavioral leg ------------------------------------------------------------
// The SAME ladder snippet is a violation at every ordinary component path
// (the control case proves it), so silence at an exempt path is meaningful.

const LADDER_SNIPPET = [
	'const Foo = () => {',
	'  const q = useThingQuery();',
	'  return q.isError ? <Error /> : <div>{q.data}</div>;',
	'};',
].join('\n');

const EXEMPT_PATHS: readonly string[] = [
	'apps/front/src/components/query-display.tsx',
	...EXPECTED_DATATABLE_EXEMPTIONS.map((screen) => `apps/front/src/${screen}`),
	...EXPECTED_ALLOWLISTED_ROUTES.map((route) => `apps/front/src/${route}`),
	// Query-definition modules stay out of scope via the component gate.
	'apps/front/src/lib/query/hooks.tsx',
];

const ENFORCED_PATHS: readonly string[] = [
	// Control: an ordinary component must keep reporting the snippet.
	'apps/front/src/components/foo.tsx',
	// The tightened boundary: NEW files under components/table/ are NOT exempt.
	'apps/front/src/components/table/new-screen.tsx',
	'apps/front/src/components/table/nested/screen.tsx',
	// Ordinary route files report too.
	'apps/front/src/routes/authed/tenant/settings/general.tsx',
];

describe('publy/prefer-query-display effective exemption boundary', () => {
	const ruleTester = new RuleTester();

	ruleTester.run('prefer-query-display-boundary', preferQueryDisplay, {
		valid: EXEMPT_PATHS.map((filename) => ({
			code: LADDER_SNIPPET,
			filename,
		})),
		invalid: ENFORCED_PATHS.map((filename) => ({
			code: LADDER_SNIPPET,
			filename,
			errors: [{ messageId: 'preferQueryDisplay' }],
		})),
	});
});
