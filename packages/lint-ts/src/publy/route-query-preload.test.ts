/**
 * Harness test for `publy/route-query-preload` (cheap first gate for #487,
 * follow-up #1589).
 *
 * Uses Oxlint's own `RuleTester` (from `oxlint/plugins-dev`) bridged into
 * Vitest — same approach as the other publy/* tests.
 *
 * What this proves:
 * - Plugin wiring: `index.ts` exposes `rules['route-query-preload']` pointing
 *   at the same rule object exported from the rule module.
 * - `valid`: a route that declares `staticData.preload`, a route with no
 *   query hooks, query-definition modules outside `routes/`, route test
 *   files (excluded), the three allow-listed auth/routing surfaces
 *   (`routes/__root.tsx`, `routes/authed/layout.tsx`,
 *   `routes/accept-invitation.tsx` — where the preload hook mounts in the
 *   app shell instead, mirroring `prefer-query-display`), and route
 *   identifiers that do not match the hook-name contract
 *   (`useQueryClient`, `usePreloadQueries`).
 * - `invalid`: a route file that mounts `useQuery` / a shared-factory hook /
 *   `useSuspenseQuery` / `useInfiniteQuery` without declaring
 *   `staticData.preload` — one diagnostic per file, named.
 * - Escape comments: proven at the real-CLI level (see the `node:test` block
 *   below), because the RuleTester runs the rule object directly and does not
 *   process oxlint's disable directives — the escape path is an oxlint runner
 *   feature, and the repo's `check-oxlint-disables.ts` guard additionally
 *   requires the directive to name the rule and carry a reason.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import plugin from '../index.ts';
import { routeQueryPreload } from './route-query-preload.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'route-query-preload';
const ROUTE_FILE = 'apps/front/src/routes/authed/staff/tenants.tsx';
const ROUTE_LOCAL_FILE =
	'apps/front/src/routes/authed/staff/tenants/$tenantId/_users-table.tsx';

// -- Plugin entrypoint wiring assertion ---------------------------------------
describe('plugin entrypoint wiring (@org/lint-ts)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		assert.strictEqual(plugin.rules[RULE_NAME], routeQueryPreload);
	});
});

// -- RuleTester cases ---------------------------------------------------------
const ruleTester = new RuleTester();

const runCases = (rule, label) => {
	describe(`publy/${RULE_NAME} (${label})`, () => {
		ruleTester.run(RULE_NAME, rule, {
			valid: [
				// Route file with a query hook AND staticData.preload declared —
				// the sanctioned shape (plan §1).
				{
					code: [
						"import { createFileRoute } from '@tanstack/react-router';",
						"import { useStaffTenantDetailsQuery } from '~/lib/query/staff-tenants';",
						'export const Route = createFileRoute("/staff/tenants/$tenantId")({',
						'  staticData: {',
						'    preload: ({ params }) => [',
						'      { options: staffTenantDetailsQueryOptions, variables: { tenantId: params.tenantId } },',
						'    ],',
						'  },',
						'});',
						'const Page = () => {',
						'  const tenant = useStaffTenantDetailsQuery({ tenantId });',
						'  return <div>{tenant.data?.name}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
				},
				// Route file with NO query hook — no preload required.
				{
					code: [
						"import { createFileRoute } from '@tanstack/react-router';",
						'export const Route = createFileRoute("/about")({',
						'  component: AboutPage,',
						'});',
						'const AboutPage = () => <div>about</div>;',
					].join('\n'),
					filename: 'apps/front/src/routes/about.tsx',
				},
				// Query-definition module outside routes/ — out of scope.
				{
					code: [
						'export const useStaffTenantDetailsQuery = (vars) =>',
						'  useQuery({ queryKey: ["tenant", vars.tenantId] });',
					].join('\n'),
					filename: 'apps/front/src/lib/query/staff-tenants.ts',
				},
				// Route-local part under routes/ CAN be flagged, but it must
				// declare preload when it mounts queries — here it does.
				{
					code: [
						'export const Route = createFileRoute("/staff/tenants/$tenantId")({',
						'  staticData: { preload: () => [] },',
						'});',
						'export const UsersTable = () => {',
						'  const users = useStaffTenantUsersQuery();',
						'  return <div>{users.data?.length}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_LOCAL_FILE,
				},
				// Route TEST file mounts queries intentionally — excluded.
				{
					code: [
						'const q = useStaffTenantDetailsQuery();',
						'export const x = q.data;',
					].join('\n'),
					filename: 'apps/front/src/routes/authed/staff/tenants.test.tsx',
				},
				// useQueryClient is not a data-query hook — never flagged.
				{
					code: [
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const qc = useQueryClient();',
						'  return <div>{String(qc.getQueryState(["x"]))}</div>;',
						'};',
					].join('\n'),
					filename: 'apps/front/src/routes/x.tsx',
				},
				// The allow-listed auth/routing surfaces: preload is not the
				// mechanism there even though they mount queries.
				{
					code: [
						'const s = useQuery<string | null>({ queryKey: ["session"] });',
						'export const x = s;',
					].join('\n'),
					filename: 'apps/front/src/routes/__root.tsx',
				},
				{
					code: [
						'const u = useCurrentUserQuery();',
						'export const x = u;',
					].join('\n'),
					filename: 'apps/front/src/routes/accept-invitation.tsx',
				},
				{
					code: [
						'const u = useCurrentUserQuery();',
						'export const x = u;',
					].join('\n'),
					filename: 'apps/front/src/routes/authed/layout.tsx',
				},
				// usePreloadQueries (plural) is the future intent hook, not a
				// data query — not flagged by the *Query$ contract.
				{
					code: [
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  usePreloadQueries();',
						'  return <div />;',
						'};',
					].join('\n'),
					filename: 'apps/front/src/routes/x.tsx',
				},
				// Aliased import WITH staticData.preload declared — must stay
				// silent (the alias was the only thing different from the
				// pre-existing valid case above). Pins the GREEN half: the
				// alias-tracking pass does not create false positives when
				// preload is present.
				{
					code: [
						'import { useStaffTenantDetailsQuery as fetchTenant } from "~/lib/query/staff-tenants";',
						'export const Route = createFileRoute("/staff/tenants/$tenantId")({',
						'  staticData: {',
						'    preload: ({ params }) => [',
						'      { options: staffTenantDetailsQueryOptions, variables: { tenantId: params.tenantId } },',
						'    ],',
						'  },',
						'});',
						'const Page = () => {',
						'  const tenant = fetchTenant({ tenantId });',
						'  return <div>{tenant.data?.name}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
				},
			],
			invalid: [
				// The core defect: route mounts a query hook, no preload.
				{
					code: [
						"import { useStaffTenantDetailsQuery } from '~/lib/query/staff-tenants';",
						'export const Route = createFileRoute("/staff/tenants/$tenantId")({',
						'  component: Page,',
						'});',
						'const Page = () => {',
						'  const tenant = useStaffTenantDetailsQuery({ tenantId });',
						'  return <div>{tenant.data?.name}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [{ messageId: 'missingPreload' }],
				},
				// Bare useQuery.
				{
					code: [
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = useQuery({ queryKey: ["x"] });',
						'  return <div>{q.data}</div>;',
						'};',
					].join('\n'),
					filename: 'apps/front/src/routes/x.tsx',
					errors: [{ messageId: 'missingPreload' }],
				},
				// useSuspenseQuery / useInfiniteQuery are route query hooks.
				{
					code: [
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = useSuspenseQuery({ queryKey: ["x"] });',
						'  return <div>{q.data}</div>;',
						'};',
					].join('\n'),
					filename: 'apps/front/src/routes/x.tsx',
					errors: [{ messageId: 'missingPreload' }],
				},
				{
					code: [
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = useInfiniteQuery({ queryKey: ["x"] });',
						'  return <div>{q.data}</div>;',
						'};',
					].join('\n'),
					filename: 'apps/front/src/routes/x.tsx',
					errors: [{ messageId: 'missingPreload' }],
				},
				// A preload key under something other than staticData does NOT
				// count (guards the exact sanctioned declaration surface).
				{
					code: [
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  useStaffTenantDetailsQuery({ tenantId });',
						'  const preload = () => [];',
						'  return <div />;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [{ messageId: 'missingPreload' }],
				},
				// One diagnostic per file even with several hooks.
				{
					code: [
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const a = useStaffTenantDetailsQuery({ tenantId });',
						'  const b = useStaffTenantUsersQuery({ tenantId });',
						'  return <div>{a.data?.name}{b.data?.length}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [{ messageId: 'missingPreload' }],
				},
				// Aliased import is still a query hook (r3 false-negative fix:
				// `import { useQuery as uq }` + `uq({...})` must be reported,
				// naming the alias actually seen in the source and the canonical
				// hook name the rule matched). Without the alias-tracking pass
				// this case was a silent false negative — the rule saw an
				// unknown identifier and defaulted to silence.
				{
					code: [
						'import { useQuery as uq } from "@tanstack/react-query";',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = uq({ queryKey: ["x"] });',
						'  return <div>{q.data}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'missingPreload',
							data: { alias: 'uq', origin: 'useQuery' },
						},
					],
				},
				// Aliased shared-factory hook — same coverage for the regex arm.
				{
					code: [
						"import { useStaffTenantDetailsQuery as fetchTenant } from '~/lib/query/staff-tenants';",
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const tenant = fetchTenant({ tenantId });',
						'  return <div>{tenant.data?.name}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'missingPreload',
							data: {
								alias: 'fetchTenant',
								origin: 'useStaffTenantDetailsQuery',
							},
						},
					],
				},
			],
		});
	});
};

runCases(routeQueryPreload, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');

// ---------------------------------------------------------------------------
// Escape comments — real-CLI level (oxlint disable directives are a runner
// feature; the RuleTester executes the rule object only).
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const OXLINT_BIN = join(WORKSPACE_ROOT, 'node_modules/.bin/oxlint');
const OXLINTRC = join(WORKSPACE_ROOT, '.oxlintrc.json');

const tmpFixtures: string[] = [];

after(() => {
	for (const dir of tmpFixtures) {
		rmSync(dir, { recursive: true, force: true });
	}
});

/**
 * Runs the real oxlint CLI over a fixture file with `--deny-warnings` and
 * returns stdout. The JSON report (diagnostics) lands on stdout; exit is
 * non-zero when a denied warning fires. `--deny-warnings` is the only way to
 * observe a `warn` rule through the real runner (the repo's `pnpm lint` uses
 * `--quiet`, which suppresses warnings entirely).
 */
const runCliWithDeniedWarnings = (source: string): string => {
	const dir = mkdtempSync(join(tmpdir(), 'route-query-preload-'));
	tmpFixtures.push(dir);
	// The rule scopes itself to `apps/front/src/routes/` (same prefix
	// resolution as the other publy rules), so the fixture must sit under
	// that relative path for the real CLI to flag it.
	const file = join(dir, 'apps/front/src/routes/probe.tsx');
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, source);

	try {
		return execFileSync(
			OXLINT_BIN,
			['--config', OXLINTRC, '--deny-warnings', '--format', 'json', file],
			{
				encoding: 'utf8',
				cwd: WORKSPACE_ROOT,
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);
	} catch (error) {
		if (typeof error === 'object' && error !== null && 'stdout' in error) {
			return String((error as { stdout?: string | Buffer }).stdout ?? '');
		}
		throw error;
	}
};

void test('CLI RED: route file with a query hook and no preload reports publy/route-query-preload', () => {
	const source = [
		"import { useStaffTenantDetailsQuery } from '~/lib/query/staff-tenants';",
		'export const Route = createFileRoute("/staff/tenants/$tenantId")({',
		'  component: Page,',
		'});',
		'const Page = () => {',
		'  const tenant = useStaffTenantDetailsQuery({ tenantId });',
		'  return <div>{tenant.data?.name}</div>;',
		'};',
	].join('\n');

	const stdout = runCliWithDeniedWarnings(source);
	assert.match(
		stdout,
		/publy\(route-query-preload\)/,
		`expected the CLI to report publy/route-query-preload, got stdout: ${stdout}`,
	);
});

void test('CLI GREEN: the same file with an oxlint-disable escape comment for the rule reports nothing', () => {
	const source = [
		"import { useStaffTenantDetailsQuery } from '~/lib/query/staff-tenants';",
		'export const Route = createFileRoute("/staff/tenants/$tenantId")({',
		'  component: Page,',
		'});',
		'const Page = () => {',
		'  // oxlint-disable-next-line publy/route-query-preload -- secondary data consumed by a drawer, never route-preloaded (classification policy, issue #487).',
		'  const tenant = useStaffTenantDetailsQuery({ tenantId });',
		'  return <div>{tenant.data?.name}</div>;',
		'};',
	].join('\n');

	const stdout = runCliWithDeniedWarnings(source);
	assert.doesNotMatch(
		stdout,
		/publy\(route-query-preload\)/,
		`expected zero diagnostics with the escape comment, got stdout: ${stdout}`,
	);
});

void test('CLI RED: aliased import `useQuery as uq` + `uq({...})` reports the diagnostic (r3 false-negative fix)', () => {
	const source = [
		'import { useQuery as uq } from "@tanstack/react-query";',
		'export const Route = createFileRoute("/probe")({ component: Page });',
		'const Page = () => {',
		'  const q = uq({ queryKey: ["x"] });',
		'  return <div>{String(q.data)}</div>;',
		'};',
	].join('\n');

	const stdout = runCliWithDeniedWarnings(source);
	assert.match(
		stdout,
		/publy\(route-query-preload\)/,
		`expected the CLI to report publy/route-query-preload for an aliased import, got stdout: ${stdout}`,
	);
	assert.match(
		stdout,
		/`uq` \(imported as `useQuery`\)/,
		`expected the diagnostic to name the alias and the origin, got stdout: ${stdout}`,
	);
});
