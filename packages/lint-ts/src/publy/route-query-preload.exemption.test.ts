/**
 * Exemption-boundary pin for `publy/route-query-preload` (#1589).
 *
 * The allow-list is load-bearing: the three auth/routing state-machine
 * surfaces mount their query hooks in the app shell / server loaders, so
 * `staticData.preload` is NOT their mechanism (plan §0,
 * `docs/records/2026-08-26-plan-preload-routes.md`). Before this pin nothing
 * proved WHICH files the rule skips, so a config or rule edit could widen the
 * exemption silently (the #1247 failure mode this suite guards against).
 *
 * This suite pins the boundary from three independent angles:
 *
 * 1. Config leg — the REAL root `.oxlintrc.json` configures the rule as
 *    plain `"warn"` (an option array would be a hidden exemption carrier)
 *    and adds no `overrides` entry re-scoping the rule.
 * 2. Rule-source leg — `ALLOWLISTED_ROUTE_PATHS` (the constant exported by
 *    the real rule module) equals the expected list EXACTLY (order
 *    included). Adding a path, removing one, or replacing a file path with
 *    a glob all fail with a +/- delta in the assertion message.
 * 3. Behavioral leg — the real rule, driven through RuleTester with an
 *    otherwise-violating snippet (a query hook with no
 *    `staticData.preload`), reports NOTHING exactly at the pinned exempt
 *    paths and REPORTS at any un-listed route path, including paths
 *    adjacent to the allow-list.
 *
 * The two directions matter: a list tested only in the "exempt" direction
 * lets a list that exempts everything pass. The ENFORCED cases below run
 * the SAME snippet at un-listed paths and must keep reporting.
 *
 * The export is also what makes the constant used: knip reports an export
 * imported only from tests as used (same pattern as
 * `prefer-query-display.exemption.test.ts` importing
 * `EXCLUDED_RELATIVE_PREFIXES`), so this pin doubles as the reason the
 * constant stays exported rather than module-private.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import {
	ALLOWLISTED_ROUTE_PATHS,
	routeQueryPreload,
} from './route-query-preload.ts';

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

const ROOT_CONFIG = JSON.parse(
	readFileSync(OXLINTRC_PATH, 'utf8'),
) as OxlintRootConfig;

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

describe('publy/route-query-preload exemption boundary (#1589)', () => {
	it('configures the rule as plain "warn" in the real root config', () => {
		const rules = ROOT_CONFIG.rules ?? {};
		assert.strictEqual(
			rules['publy/route-query-preload'],
			'warn',
			`.oxlintrc.json must configure publy/route-query-preload as bare "warn" — an option array moves the exemption boundary; a flip-to-error PR updates this pin with a measured offender count (see the rule header)`,
		);
	});

	it('has no overrides entry re-scoping the rule', () => {
		const overrides = ROOT_CONFIG.overrides ?? [];
		for (const [index, override] of overrides.entries()) {
			assert.strictEqual(
				override.rules?.['publy/route-query-preload'],
				undefined,
				`.oxlintrc.json overrides[${index}] re-scopes publy/route-query-preload — the exemption boundary moved out of the pinned rule source`,
			);
		}
	});

	it('does not ignorePatterns the allow-listed routes out of linting', () => {
		const patterns = ROOT_CONFIG.ignorePatterns ?? [];
		for (const pattern of patterns) {
			for (const route of EXPECTED_ALLOWLISTED_ROUTES) {
				const workspaceRelative = `apps/front/src/${route}`;
				const matched =
					globMatches(pattern, route) ||
					globMatches(pattern, workspaceRelative);
				assert.strictEqual(
					matched,
					false,
					`ignorePatterns entry "${pattern}" exempts ${route} from linting entirely — the effective exemption widened silently`,
				);
			}
		}
	});

	it('pins the allow-listed route files exactly', () => {
		assert.deepStrictEqual(
			[...ALLOWLISTED_ROUTE_PATHS],
			[...EXPECTED_ALLOWLISTED_ROUTES],
			`the allow-list changed: ${listDelta(EXPECTED_ALLOWLISTED_ROUTES, [
				...ALLOWLISTED_ROUTE_PATHS,
			])} — exempting another route file is a deliberate, reviewed change (#1589)`,
		);
	});

	it('names only files that exist on disk (no ghost exemptions)', () => {
		for (const route of EXPECTED_ALLOWLISTED_ROUTES) {
			assert.ok(
				existsSync(join(WORKSPACE_ROOT, 'apps/front/src', route)),
				`exempt route ${route} no longer exists — shrink the pin instead of exempting a ghost`,
			);
		}
	});

	// Liveness pin (r4 follow-up): a route stays on the allow-list only as
	// long as it lacks `staticData.preload`. If one of the three entries
	// later adopts preload, the exemption becomes unnecessary — without this
	// pin nothing would tell the maintainer, and the list would only grow.
	// The pin reads the file source through a deliberately narrow regex
	// (`staticData` followed by an object literal that contains `preload`)
	// so a comment mentioning the words does NOT count. Adding
	// `staticData: { preload: () => [] }` to one exempt route makes this
	// test red with a message naming that file.
	const livenessRegex = /staticData\s*:\s*\{[\s\S]*?\bpreload\s*:/;
	it('liveness regex matches a real staticData.preload declaration (catches a weakened regex)', () => {
		const fixture = [
			'export const Route = createFileRoute("/probe")({',
			'  staticData: {',
			'    preload: () => [],',
			'  },',
			'});',
		].join('\n');
		assert.strictEqual(
			livenessRegex.test(fixture),
			true,
			'the liveness regex no longer recognises a staticData.preload declaration — a weakened regex slipped past the liveness pin',
		);
	});
	it('only allows routes that still lack staticData.preload (shrink when they adopt it)', () => {
		for (const route of EXPECTED_ALLOWLISTED_ROUTES) {
			const source = readFileSync(
				join(WORKSPACE_ROOT, 'apps/front/src', route),
				'utf8',
			);
			assert.strictEqual(
				livenessRegex.test(source),
				false,
				`exempt route ${route} declares staticData.preload — the exemption became unnecessary; shrink the allow-list (#1589)`,
			);
		}
	});
});

// -- Behavioral leg ------------------------------------------------------------
// The SAME snippet is a violation at every ordinary route path (the control
// case proves it), so silence at an exempt path is meaningful and a finding
// at an un-listed path pins the second direction.

const VIOLATING_SNIPPET = [
	'const q = useQuery({ queryKey: ["session"] });',
	'export const x = q.data;',
].join('\n');

const EXEMPT_PATHS: readonly string[] = EXPECTED_ALLOWLISTED_ROUTES.map(
	(route) => `apps/front/src/${route}`,
);

const ENFORCED_PATHS: readonly string[] = [
	// Control: an ordinary route file must keep reporting the snippet.
	'apps/front/src/routes/about.tsx',
	// A route adjacent to an allow-listed surface is NOT exempt.
	'apps/front/src/routes/authed/tenant/settings/general.tsx',
];

describe('publy/route-query-preload effective exemption boundary', () => {
	const ruleTester = new RuleTester();

	ruleTester.run('route-query-preload-boundary', routeQueryPreload, {
		valid: EXEMPT_PATHS.map((filename) => ({
			code: VIOLATING_SNIPPET,
			filename,
		})),
		invalid: ENFORCED_PATHS.map((filename) => ({
			code: VIOLATING_SNIPPET,
			filename,
			errors: [{ messageId: 'missingPreload' }],
		})),
	});
});
