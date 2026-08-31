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
				// Assignment alias WITH staticData.preload declared — same
				// green half for the VariableDeclarator alias pass (r5).
				{
					code: [
						'import { useQuery } from "@tanstack/react-query";',
						'const uq = useQuery;',
						'export const Route = createFileRoute("/x")({',
						'  staticData: { preload: () => [] },',
						'});',
						'const X = () => {',
						'  const q = uq({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
				},
				// Destructuring alias WITH preload (r5).
				{
					code: [
						'import * as ReactQuery from "@tanstack/react-query";',
						'const { useQuery: uq } = ReactQuery;',
						'export const Route = createFileRoute("/x")({',
						'  staticData: { preload: () => [] },',
						'});',
						'const X = () => {',
						'  const q = uq({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
				},
				// Require chain alias WITH preload (r5).
				{
					code: [
						'const uq = require("@tanstack/react-query").useQuery;',
						'export const Route = createFileRoute("/x")({',
						'  staticData: { preload: () => [] },',
						'});',
						'const X = () => {',
						'  const q = uq({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
				},
				// Namespace member call WITH preload (r5) — the truthful
				// member-alias branch must not fire when preload is declared.
				{
					code: [
						'import * as RQ from "@tanstack/react-query";',
						'export const Route = createFileRoute("/x")({',
						'  staticData: { preload: () => [] },',
						'});',
						'const X = () => {',
						'  const q = RQ.useQuery({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
				},
				// Default import from a query module WITH preload — the
				// undecidable family must also stay silent when the route
				// declares preload (r5).
				{
					code: [
						'import uq from "@tanstack/react-query";',
						'export const Route = createFileRoute("/x")({',
						'  staticData: { preload: () => [] },',
						'});',
						'const X = () => {',
						'  const q = uq({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
				},
				// Whole-module require WITH preload — same as a default
				// import, silent when preload is declared (r5).
				{
					code: [
						'const RQ = require("@tanstack/react-query");',
						'import { createFileRoute } from "@tanstack/react-router";',
						'export const Route = createFileRoute("/x")({',
						'  staticData: { preload: () => [] },',
						'});',
						'const X = () => {',
						'  const q = RQ.useQuery({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
				},
				// Destructuring a NON-hook name (`useQueryClient`) must not
				// create an alias entry that later flags innocent calls (r5).
				{
					code: [
						'import * as ReactQuery from "@tanstack/react-query";',
						'const { useQueryClient: qc } = ReactQuery;',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const client = qc();',
						'  return <div>{String(client.getQueryState(["x"]))}</div>;',
						'};',
					].join('\n'),
					filename: 'apps/front/src/routes/x.tsx',
				},
				// r6: `.call/apply/bind` reflection WITH preload — the
				// reflective trio must stay silent when preload is
				// declared (same GREEN half as the named-import branch).
				{
					code: [
						'import { useQuery } from "@tanstack/react-query";',
						'export const Route = createFileRoute("/x")({',
						'  staticData: { preload: () => [] },',
						'});',
						'const X = () => {',
						'  const q = useQuery.call(null, { queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
				},
				// r6: object-literal property alias WITH preload — the
				// `obj.fn({...})` branch must stay silent when preload is
				// declared.
				{
					code: [
						'import { useQuery } from "@tanstack/react-query";',
						'const obj = { fn: useQuery };',
						'export const Route = createFileRoute("/x")({',
						'  staticData: { preload: () => [] },',
						'});',
						'const X = () => {',
						'  const q = obj.fn({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
				},
				// r6: object-literal with a NON-hook property pointing at
				// a default-import — preload declared, the undecidable
				// member call stays silent.
				{
					code: [
						'import dq from "@tanstack/react-query";',
						'const obj = { fn: dq };',
						'export const Route = createFileRoute("/x")({',
						'  staticData: { preload: () => [] },',
						'});',
						'const X = () => {',
						'  const q = obj.fn({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
				},
				// r6: `createFileRoute("/x")({...})` outer call is a
				// call-of-call, where the inner call is already visited
				// recursively. The outer wrapper must NOT fire
				// `unresolvableCallee` (a literal copy of the canonical
				// TanStack Router invocation pattern — every route file
				// in the repo uses it).
				{
					code: [
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => <div />;',
					].join('\n'),
					filename: 'apps/front/src/routes/x.tsx',
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
				// r5: assignment alias — `const uq = useQuery` then `uq({...})`
				// was the silent false negative the r4 reviewer ran against the
				// real CLI (zero diagnostics). The VariableDeclarator pass must
				// resolve it like a named-import alias.
				{
					code: [
						'import { useQuery } from "@tanstack/react-query";',
						'const uq = useQuery;',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = uq({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
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
				// r5: destructuring alias — `const { useQuery: uq } = ...`.
				{
					code: [
						'import * as ReactQuery from "@tanstack/react-query";',
						'const { useQuery: uq } = ReactQuery;',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = uq({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
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
				// r5: require chain alias — `const uq = require('...').useQuery`.
				{
					code: [
						'const uq = require("@tanstack/react-query").useQuery;',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = uq({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
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
				// r5: alias chain — `const a = useQuery; const b = a; b({...})`
				// resolves in one hop (the assignment-alias pass only creates
				// aliases from canonical names, so no chain fixpoint exists).
				{
					code: [
						'import { useQuery } from "@tanstack/react-query";',
						'const a = useQuery;',
						'const b = a;',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = b({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'missingPreload',
							data: { alias: 'b', origin: 'useQuery' },
						},
					],
				},
				// r5: `let` assignment alias — the declaration keyword must not
				// change the resolution (a const-only tracking mutation would
				// restore the silent false negative for `let uq = useQuery`).
				{
					code: [
						'import { useQuery } from "@tanstack/react-query";',
						'let uq = useQuery;',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = uq({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
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
				// r5: unresolved binding propagated through an assignment —
				// `const uq = dq` must inherit the default-import status, so a
				// mutation dropping the propagation leaves an undecidable call
				// silent on the final name.
				{
					code: [
						'import dq from "@tanstack/react-query";',
						'const uq = dq;',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = uq({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'unresolvedHookCall',
							data: {
								callName: 'uq',
								importName: 'dq',
								module: '@tanstack/react-query',
							},
						},
					],
				},
				// r5: namespace member call — the diagnostic must name the
				// FULL member text written in the source (`RQ.useQuery`), not
				// just the property; the earlier half-catch said "imported as
				// `useQuery`" for a call that never imported that name.
				{
					code: [
						'import * as RQ from "@tanstack/react-query";',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = RQ.useQuery({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'missingPreload',
							data: { alias: 'RQ.useQuery', origin: 'useQuery' },
						},
					],
				},
				// r5: whole-module require member call — `const RQ =
				// require('...'); RQ.useQuery(...)` must name the member text
				// like a namespace import (pins the require → query-module
				// binding registration; dropping it only degrades the message).
				{
					code: [
						'const RQ = require("@tanstack/react-query");',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = RQ.useQuery({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'missingPreload',
							data: { alias: 'RQ.useQuery', origin: 'useQuery' },
						},
					],
				},
				// r5: default import from a query module called directly is an
				// undecidable entry — the rule cannot tell whether `uq` is a
				// hook, so it must fail loudly with `unresolvedHookCall`.
				{
					code: [
						'import uq from "@tanstack/react-query";',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = uq({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'unresolvedHookCall',
							data: {
								callName: 'uq',
								importName: 'uq',
								module: '@tanstack/react-query',
							},
						},
					],
				},
				// r5: default import from a shared-factory module — the query
				// module classification must cover `~/lib/query/**` sources,
				// not just @tanstack/react-query (the mutation candidate a
				// narrow source matcher would escape through).
				{
					code: [
						'import dq from "~/lib/query/staff-tenants";',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = dq(null);',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'unresolvedHookCall',
							data: {
								callName: 'dq',
								importName: 'dq',
								module: '~/lib/query/staff-tenants',
							},
						},
					],
				},
				// r5: whole-module require called directly — same undecidable
				// family as a default import.
				{
					code: [
						'const uq = require("@tanstack/react-query");',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = uq({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'unresolvedHookCall',
							data: {
								callName: 'uq',
								importName: 'uq',
								module: '@tanstack/react-query',
							},
						},
					],
				},
				// r5: a file can carry BOTH families — a resolved hook call AND
				// an undecidable default-import call. Both must be reported;
				// an escape comment on one line does not silence the other.
				{
					code: [
						'import { useQuery } from "@tanstack/react-query";',
						'import dq from "@tanstack/react-query";',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const a = useQuery({ queryKey: ["a"] });',
						'  const b = dq({ queryKey: ["b"] });',
						'  return <div>{String(a.data)}{String(b.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'missingPreload',
							data: { alias: 'useQuery', origin: 'useQuery' },
						},
						{
							messageId: 'unresolvedHookCall',
							data: {
								callName: 'dq',
								importName: 'dq',
								module: '@tanstack/react-query',
							},
						},
					],
				},
				// r6: `.call(null, {...})` reflection — the callee is a
				// MemberExpression whose property is `call`; the r5 rule
				// silently dropped it (getCalleeInfo returned null on a
				// CallExpression callee — the `if (info === null) return;`
				// bailed without inspecting the call). r6 unwraps the
				// reflective trio (.call/.apply/.bind) and treats the
				// receiver as the callee.
				{
					code: [
						'import { useQuery } from "@tanstack/react-query";',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = useQuery.call(null, { queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'missingPreload',
							data: { alias: 'useQuery', origin: 'useQuery' },
						},
					],
				},
				// r6: `.apply(null, [args])` reflection — same coverage for
				// the .apply branch of the reflective trio.
				{
					code: [
						'import { useQuery } from "@tanstack/react-query";',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = useQuery.apply(null, [{ queryKey: ["x"] }]);',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'missingPreload',
							data: { alias: 'useQuery', origin: 'useQuery' },
						},
					],
				},
				// r6: `.bind(null, args)` reflection — same for .bind. The
				// bound function is still a hook call site, even though no
				// execution happens inline (we don't model `.bind`'s
				// returned function; the call site itself is what we
				// track, same way the original rule treats the
				// `createFileRoute(...)` wrapper call).
				{
					code: [
						'import { useQuery } from "@tanstack/react-query";',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = useQuery.bind(null, { queryKey: ["x"] });',
						'  return <div>{String(typeof q)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'missingPreload',
							data: { alias: 'useQuery', origin: 'useQuery' },
						},
					],
				},
				// r6: reflective call on a namespace member
				// (`RQ.useQuery.call(null, ...)`) — intentionally NOT
				// supported. The callee is a MemberExpression whose object
				// is itself a MemberExpression, which `getCalleeInfo` does
				// not unwrap; the call lands in `unresolvableCallees` and
				// is reported as `unresolvableCallee`. The maintainer can
				// add a call-shape branch if/when this appears in real
				// code, but the simple `.call` on a directly-bound name
				// (`useQuery.call`) and on a local alias (`uq.call`) is
				// covered above.
				{
					code: [
						'import * as RQ from "@tanstack/react-query";',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = RQ.useQuery.call(null, { queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'unresolvableCallee',
							data: {
								sourceText: 'RQ.useQuery.call',
								rootBinding: 'RQ',
								module: '@tanstack/react-query',
							},
						},
					],
				},
				// r6: object-literal property alias — `const obj = { fn:
				// useQuery }; obj.fn({...})` was a silent false negative
				// in r5 (the member branch's `isRouteQueryHookName(origin)`
				// rejected `fn` and the visitor bailed). r6 follows the
				// assignment into the literal and resolves the member
				// call to `useQuery`.
				{
					code: [
						'import { useQuery } from "@tanstack/react-query";',
						'const obj = { fn: useQuery };',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = obj.fn({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'missingPreload',
							data: { alias: 'obj.fn', origin: 'useQuery' },
						},
					],
				},
				// r6: shorthand object-literal property — `const obj = {
				// useQuery }; obj.useQuery({...})` resolves through the
				// alias map (the shorthand's value is the local name
				// itself).
				{
					code: [
						'import { useQuery } from "@tanstack/react-query";',
						'const obj = { useQuery };',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = obj.useQuery({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'missingPreload',
							data: { alias: 'obj.useQuery', origin: 'useQuery' },
						},
					],
				},
				// r6: object-literal with a NON-hook property pointing at
				// a default-import — the member call is undecidable
				// (loud), not silent. The earlier r5 state passed it
				// silently; r6 reports it with a name + module.
				{
					code: [
						'import dq from "@tanstack/react-query";',
						'const obj = { fn: dq };',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = obj.fn({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'unresolvedHookCall',
							data: {
								callName: 'obj.fn',
								importName: 'dq',
								module: '@tanstack/react-query',
							},
						},
					],
				},
				// r6: object-literal with an opaque (non-name) value — a
				// function expression, a call result, anything that
				// isn't a name the rule can resolve. The member call is
				// loud, naming the property alias.
				{
					code: [
						'import { useQuery } from "@tanstack/react-query";',
						'const makeHook = () => useQuery;',
						'const obj = { fn: makeHook() };',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = obj.fn({ queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'unresolvedHookCall',
							data: {
								callName: 'obj.fn',
								importName: 'obj',
								module: '<opaque expression>',
							},
						},
					],
				},
				// r6: a callee the rule cannot analyse at all — `obj["fn"]`
				// computed member. The r5 `getCalleeInfo` returned null
				// for computed members and bailed silently; r6 surfaces
				// the unrecognised shape as `unresolvableCallee`.
				{
					code: [
						'import { useQuery } from "@tanstack/react-query";',
						'export const Route = createFileRoute("/x")({ component: X });',
						'const X = () => {',
						'  const q = useQuery["call"](null, { queryKey: ["x"] });',
						'  return <div>{String(q.data)}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{
							messageId: 'unresolvableCallee',
							data: {
								sourceText: 'useQuery["call"]',
								rootBinding: 'useQuery',
								module: '@tanstack/react-query',
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

void test('CLI RED: assignment alias `const uq = useQuery` + `uq({...})` reports the diagnostic (r5)', () => {
	const source = [
		'import { useQuery } from "@tanstack/react-query";',
		'const uq = useQuery;',
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
		`expected the CLI to report publy/route-query-preload for an assignment alias, got stdout: ${stdout}`,
	);
	assert.match(
		stdout,
		/`uq` \(imported as `useQuery`\)/,
		`expected the diagnostic to name the assignment alias and the origin, got stdout: ${stdout}`,
	);
});

void test('CLI RED: destructuring `const { useQuery: uq } = ...` + `uq({...})` reports the diagnostic (r5)', () => {
	const source = [
		'import * as ReactQuery from "@tanstack/react-query";',
		'const { useQuery: uq } = ReactQuery;',
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
		`expected the CLI to report publy/route-query-preload for a destructuring alias, got stdout: ${stdout}`,
	);
	assert.match(
		stdout,
		/`uq` \(imported as `useQuery`\)/,
		`expected the diagnostic to name the destructuring alias and the origin, got stdout: ${stdout}`,
	);
});

void test('CLI RED: default import `import uq from "@tanstack/react-query"` + `uq({...})` reports the undecidable diagnostic (r5)', () => {
	const source = [
		'import uq from "@tanstack/react-query";',
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
		`expected the CLI to report publy/route-query-preload for a default import, got stdout: ${stdout}`,
	);
	assert.match(
		stdout,
		/imports from query module `@tanstack\/react-query` as `uq` and calls `uq`, which this rule cannot resolve/,
		`expected the undecidable diagnostic to name the module, the binding and the call, got stdout: ${stdout}`,
	);
});

void test('CLI RED: require chain `const uq = require(...).useQuery` + `uq({...})` reports the diagnostic (r5)', () => {
	const source = [
		'const uq = require("@tanstack/react-query").useQuery;',
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
		`expected the CLI to report publy/route-query-preload for a require-chain alias, got stdout: ${stdout}`,
	);
	assert.match(
		stdout,
		/`uq` \(imported as `useQuery`\)/,
		`expected the diagnostic to name the require-chain alias and the origin, got stdout: ${stdout}`,
	);
});

void test('CLI RED: namespace `RQ.useQuery({...})` reports the diagnostic naming the truthful member text (r5)', () => {
	const source = [
		'import * as RQ from "@tanstack/react-query";',
		'export const Route = createFileRoute("/probe")({ component: Page });',
		'const Page = () => {',
		'  const q = RQ.useQuery({ queryKey: ["x"] });',
		'  return <div>{String(q.data)}</div>;',
		'};',
	].join('\n');

	const stdout = runCliWithDeniedWarnings(source);
	assert.match(
		stdout,
		/publy\(route-query-preload\)/,
		`expected the CLI to report publy/route-query-preload for a namespace member call, got stdout: ${stdout}`,
	);
	assert.match(
		stdout,
		/`RQ\.useQuery` \(imported as `useQuery`\)/,
		`expected the diagnostic to name the full member text written in the source, got stdout: ${stdout}`,
	);
});

void test('CLI GREEN: an escape comment silences the undecidable default-import diagnostic (r5)', () => {
	const source = [
		'import uq from "@tanstack/react-query";',
		'export const Route = createFileRoute("/probe")({ component: Page });',
		'const Page = () => {',
		'  // oxlint-disable-next-line publy/route-query-preload -- default-imported query shape, never route-preloaded (secondary data, issue #487).',
		'  const q = uq({ queryKey: ["x"] });',
		'  return <div>{String(q.data)}</div>;',
		'};',
	].join('\n');

	const stdout = runCliWithDeniedWarnings(source);
	assert.doesNotMatch(
		stdout,
		/publy\(route-query-preload\)/,
		`expected zero diagnostics with the escape comment on the undecidable call, got stdout: ${stdout}`,
	);
});

void test('CLI RED: `useQuery.call(null, {...})` reports the diagnostic (r6 reflective trio)', () => {
	const source = [
		'import { useQuery } from "@tanstack/react-query";',
		'export const Route = createFileRoute("/probe")({ component: Page });',
		'const Page = () => {',
		'  const q = useQuery.call(null, { queryKey: ["x"] });',
		'  return <div>{String(q.data)}</div>;',
		'};',
	].join('\n');

	const stdout = runCliWithDeniedWarnings(source);
	assert.match(
		stdout,
		/publy\(route-query-preload\)/,
		`expected the CLI to report publy/route-query-preload for .call reflection, got stdout: ${stdout}`,
	);
	assert.match(
		stdout,
		/`useQuery` \(imported as `useQuery`\)/,
		`expected the diagnostic to name the unwrapped receiver, got stdout: ${stdout}`,
	);
});

void test('CLI RED: `useQuery.apply(null, [{...}])` reports the diagnostic (r6 reflective trio)', () => {
	const source = [
		'import { useQuery } from "@tanstack/react-query";',
		'export const Route = createFileRoute("/probe")({ component: Page });',
		'const Page = () => {',
		'  const q = useQuery.apply(null, [{ queryKey: ["x"] }]);',
		'  return <div>{String(q.data)}</div>;',
		'};',
	].join('\n');

	const stdout = runCliWithDeniedWarnings(source);
	assert.match(
		stdout,
		/publy\(route-query-preload\)/,
		`expected the CLI to report publy/route-query-preload for .apply reflection, got stdout: ${stdout}`,
	);
});

void test('CLI RED: `const obj = { fn: useQuery }; obj.fn({...})` reports the diagnostic (r6 object wrapping)', () => {
	const source = [
		'import { useQuery } from "@tanstack/react-query";',
		'const obj = { fn: useQuery };',
		'export const Route = createFileRoute("/probe")({ component: Page });',
		'const Page = () => {',
		'  const q = obj.fn({ queryKey: ["x"] });',
		'  return <div>{String(q.data)}</div>;',
		'};',
	].join('\n');

	const stdout = runCliWithDeniedWarnings(source);
	assert.match(
		stdout,
		/publy\(route-query-preload\)/,
		`expected the CLI to report publy/route-query-preload for object-wrapped hook call, got stdout: ${stdout}`,
	);
	assert.match(
		stdout,
		/`obj\.fn` \(imported as `useQuery`\)/,
		`expected the diagnostic to name the property alias and the origin, got stdout: ${stdout}`,
	);
});

void test('CLI RED: `useQuery["call"](null, {...})` (computed member) reports the unresolvableCallee diagnostic (r6)', () => {
	const source = [
		'import { useQuery } from "@tanstack/react-query";',
		'export const Route = createFileRoute("/probe")({ component: Page });',
		'const Page = () => {',
		'  const q = useQuery["call"](null, { queryKey: ["x"] });',
		'  return <div>{String(q.data)}</div>;',
		'};',
	].join('\n');

	const stdout = runCliWithDeniedWarnings(source);
	assert.match(
		stdout,
		/publy\(route-query-preload\)/,
		`expected the CLI to report publy/route-query-preload for a computed-member call, got stdout: ${stdout}`,
	);
	assert.match(
		stdout,
		/cannot analyse/,
		`expected the unresolvableCallee diagnostic to fire on a computed member, got stdout: ${stdout}`,
	);
});

void test('CLI GREEN: a vanilla `createFileRoute("/x")({...})` route reports nothing about the outer wrapper (r6 call-of-call bail)', () => {
	// The canonical TanStack Router invocation pattern. The OUTER call
	// (`({...})` applied to the result of `createFileRoute("/x")`) must NOT
	// surface `unresolvableCallee` — the inner call is already visited
	// recursively, and `createFileRoute` is not a query hook.
	const source = [
		'export const Route = createFileRoute("/probe")({ component: Page });',
		'const Page = () => <div />;',
	].join('\n');

	const stdout = runCliWithDeniedWarnings(source);
	assert.doesNotMatch(
		stdout,
		/publy\(route-query-preload\)/,
		`expected zero diagnostics on a vanilla route definition, got stdout: ${stdout}`,
	);
});

void test('CLI GREEN: createFileRoute with an actual query hook does not produce a spurious outer-wrapper diagnostic (r8 regression guard)', () => {
	// A route that calls a real query hook (e.g. useQuery inside a
	// component) should report missingPreload for the hook call, NOT
	// for the createFileRoute wrapper. The r8 narrowing of the
	// call-of-call bail (from blanket-bail to createFileRoute-only)
	// must not re-introduce a false positive on the wrapper.
	const source = [
		'import { useStaffTenantDetailsQuery } from "~/lib/query/staff-tenants";',
		'export const Route = createFileRoute("/staff/tenants/$tenantId")({',
		'  component: Page,',
		'});',
		'const Page = () => {',
		'  const tenant = useStaffTenantDetailsQuery({ tenantId });',
		'  return <div>{tenant.data?.name}</div>;',
		'};',
	].join('\n');

	const stdout = runCliWithDeniedWarnings(source);
	// Should report exactly ONE diagnostic: missingPreload for the hook call.
	// Must NOT report two (one for the hook, one spurious for the wrapper).
	const matches = [...stdout.matchAll(/publy\(route-query-preload\)/g)];
	assert.strictEqual(
		matches.length,
		1,
		`expected exactly 1 diagnostic (the hook call), got ${matches.length}. stdout: ${stdout}`,
	);
	assert.match(
		stdout,
		/useStaffTenantDetailsQuery.*without declaring/,
		`expected missingPreload for the hook call, got stdout: ${stdout}`,
	);
});

void test('CLI RED: `const getHook = () => useQuery; getHook()({...})` reports the unresolvableCallee diagnostic (r8 function-return indirection)', () => {
	// r8 fix: the blanket call-of-call bail (line 584 in r6) was narrowed to
	// only `createFileRoute`. Other curried calls — `getHook()({...})` where
	// `const getHook = () => useQuery` — must reach `calleeTracesToQueryModule`.
	// The function-binding map IS populated by the VariableDeclarator pass; it
	// was only consulted in `calleeTracesToQueryModule` (the unresolvableCallee
	// path), which the blanket bail prevented from ever being reached.
	const source = [
		'import { useQuery } from "@tanstack/react-query";',
		'const getHook = () => useQuery;',
		'export const Route = createFileRoute("/probe")({ component: Page });',
		'const Page = () => {',
		'  const q = getHook()({ queryKey: ["x"] });',
		'  return <div>{String(q.data)}</div>;',
		'};',
	].join('\n');

	const stdout = runCliWithDeniedWarnings(source);
	assert.match(
		stdout,
		/publy\(route-query-preload\)/,
		`expected the CLI to report publy/route-query-preload for function-return indirection, got stdout: ${stdout}`,
	);
	assert.match(
		stdout,
		/cannot analyse/,
		`expected unresolvableCallee (not missingPreload), got stdout: ${stdout}`,
	);
	assert.match(
		stdout,
		/`getHook`/,
		`expected the diagnostic to name the function binding, got stdout: ${stdout}`,
	);
	assert.match(
		stdout,
		/<function returning useQuery>/,
		`expected the diagnostic to show the function-return origin, got stdout: ${stdout}`,
	);
});
