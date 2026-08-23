/**
 * Harness test for `publy/prefer-query-display` (dormant detector).
 *
 * Uses Oxlint's own `RuleTester` (from `oxlint/plugins-dev`) bridged into
 * Node's built-in `node:test` runner — same approach as other publy/* tests.
 *
 * What this proves:
 * - Plugin wiring: `index.js` exposes `rules['prefer-query-display']`
 *   pointing at the same rule object exported from the rule module.
 * - `valid`: QueryDisplay usage, mutations, query-definition modules, the
 *   allow-listed route/auth files, pure helper reads, and bindings that are
 *   never rendered conditionally.
 * - `invalid`: a component that binds a `use*Query` result and renders JSX
 *   conditionally on `isPending` / `isLoading` / `isError` / `isSuccess` /
 *   `status` / `error` — via ternary, `&&`, early return, `if`, and both
 *   whole-binding (`q.isError`) and destructured (`{ isError }`) reads.
 *   `useMutation` results are never flagged.
 */
import assert from 'node:assert/strict';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import plugin from '../index.ts';
import { preferQueryDisplay } from './prefer-query-display.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'prefer-query-display';
const COMPONENT_FILE = 'apps/front/src/components/foo.tsx';
const ROUTE_FILE = 'apps/front/src/routes/authed/tenant/settings/general.tsx';

// -- Plugin entrypoint wiring assertion ---------------------------------------
describe('plugin entrypoint wiring (@org/lint-ts)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		assert.strictEqual(plugin.rules[RULE_NAME], preferQueryDisplay);
	});
});

// -- RuleTester cases ---------------------------------------------------------
const ruleTester = new RuleTester();

const runCases = (rule, label) => {
	describe(`publy/${RULE_NAME} (${label})`, () => {
		ruleTester.run(RULE_NAME, rule, {
			valid: [
				// QueryDisplay usage — the canonical mandated form, not flagged.
				{
					code: [
						"import QueryDisplay from '~/components/query-display';",
						'const Foo = ({ query }) => (',
						'  <QueryDisplay query={query}>{({ data }) => <div>{data}</div>}</QueryDisplay>',
						');',
					].join('\n'),
					filename: COMPONENT_FILE,
				},
				// useQuery but the result is never rendered conditionally.
				{
					code: [
						'const Foo = () => {',
						'  const query = useFindThings();',
						'  return <div>{query.data?.id}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
				},
				// useMutation reads isPending — out of scope, never flagged.
				{
					code: [
						'const Foo = () => {',
						'  const { isPending } = useUpdateThing();',
						'  return isPending ? <Spinner /> : <div />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
				},
				// Binding a whole query result and reading a flag OUTSIDE any
				// conditional (e.g. passing to a component) — not a hand-rolled ladder.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  return <QueryDisplay query={q} />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
				},
				// The allow-listed auth/routing state-machine route file.
				{
					code: [
						'const Foo = () => {',
						'  const q = useQuery();',
						'  if (q.isError) return <div>err</div>;',
						'  return <div />;',
						'};',
					].join('\n'),
					filename: 'apps/front/src/routes/__root.tsx',
				},
				// Another allow-listed route file.
				{
					code: [
						'const Foo = () => {',
						'  const q = useQuery();',
						'  return q.isPending ? <div /> : <div>x</div>;',
						'};',
					].join('\n'),
					filename: 'apps/front/src/routes/authed/layout.tsx',
				},
				// DataTable screens own their list-state mechanism.
				{
					code: [
						'const Foo = () => {',
						'  const q = useQuery();',
						'  return q.isError ? <Error /> : <div />;',
						'};',
					].join('\n'),
					filename: 'apps/front/src/components/table/data-table.tsx',
				},
				// The implementation itself must never flag itself.
				{
					code: [
						'const QueryDisplay = () => {',
						'  const q = useQuery();',
						'  if (q.isError) return <div />;',
						'  return <div />;',
						'};',
					].join('\n'),
					filename: 'apps/front/src/components/query-display.tsx',
				},
				// Query-definition modules merely call the hooks.
				{
					code: [
						'export const useThingQuery = (id) => {',
						'  return useQuery({ queryKey: ["thing", id] });',
						'};',
					].join('\n'),
					filename: 'apps/front/src/lib/query/things.ts',
				},
				// A non-component file (no JSX return) is out of scope.
				{
					code: [
						'export const useThingQuery = (id) => {',
						'  const q = useQuery({ queryKey: ["thing", id] });',
						'  if (q.isError) return null;',
						'  return q;',
						'};',
					].join('\n'),
					filename: 'apps/front/src/lib/query/things.ts',
				},
				// A flag read inside a useEffect callback is not render context.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  useEffect(() => { if (q.isError) { report(); } }, [q.isError]);',
						'  return <div>{q.data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
				},
				// A flag read inside an event handler is not render context.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  const onClick = () => { if (q.isError) { retry(); } };',
						'  return <button onClick={onClick}>{q.data}</button>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
				},
				// Not a query hook — a plain useWidget returning a value.
				{
					code: [
						'const Foo = () => {',
						'  const { isError } = useWidget();',
						'  return isError ? <div /> : <div>x</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
				},
				// Non-front file — rule does not apply.
				{
					code: [
						'const Foo = () => {',
						'  const q = useQuery();',
						'  return q.isError ? <div /> : <div>x</div>;',
						'};',
					].join('\n'),
					filename: 'packages/shared-ts/src/lib/query/foo.tsx',
				},
			],
			invalid: [
				// Whole-binding ternaries on each flagged field.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  return q.isPending ? <Skeleton /> : <div>{q.data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  return q.isLoading ? <Spinner /> : <div>{q.data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  return q.isError ? <Error /> : <div>{q.data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  return q.isSuccess ? <div>{q.data}</div> : <Skeleton />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  return q.status === "error" ? <Error /> : <div>{q.data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  return q.error ? <Error /> : <div>{q.data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Logical `&&`.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  return q.isError && <Error />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Early return on the flag.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  if (q.isError) return <Error />;',
						'  return <div>{q.data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// `if` with alternate branch using the flag.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  if (q.isPending) { return <Skeleton />; }',
						'  return <div>{q.data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Destructured binding read in a ternary.
				{
					code: [
						'const Foo = () => {',
						'  const { isError, isPending, data } = useThingQuery();',
						'  if (isError) return <Error />;',
						'  if (isPending) return <Skeleton />;',
						'  return <div>{data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [
						{ messageId: 'preferQueryDisplay' },
						{ messageId: 'preferQueryDisplay' },
					],
				},
				// Destructured single flag in logical expression.
				{
					code: [
						'const Foo = () => {',
						'  const { isPending } = useThingQuery();',
						'  return isPending && <Skeleton />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// useSuspenseQuery is a query hook.
				{
					code: [
						'const Foo = () => {',
						'  const q = useSuspenseThingQuery();',
						'  return q.isError ? <Error /> : <div>{q.data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// useInfiniteQuery is a query hook.
				{
					code: [
						'const Foo = () => {',
						'  const q = useInfiniteThingQuery();',
						'  return q.isLoading ? <Spinner /> : <div>{q.data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Custom `use*Query` shaped hook.
				{
					code: [
						'const Foo = () => {',
						'  const q = useStaffUsersQuery();',
						'  return q.isError ? <Error /> : <div>{q.data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Real offender shape: route component file (general.tsx-like).
				{
					code: [
						'const TenantSettingsGeneralPage = () => {',
						'  const { data, isPending, isError } = useTenantSettingsGeneralQuery(tenantId);',
						'  if (isError) return <ErrorStateSurface />;',
						'  if (isPending) return <Skeleton />;',
						'  return <div>{data}</div>;',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [
						{ messageId: 'preferQueryDisplay' },
						{ messageId: 'preferQueryDisplay' },
					],
				},
				// Conditional spread inside JSX.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  return <div>{q.isError ? <Error /> : q.data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// `for`/`while` guard reading the flag.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  while (q.isLoading) { doSpin(); }',
						'  return <div>{q.data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Two different query bindings both flagged (one diagnostic per field set).
				{
					code: [
						'const Foo = () => {',
						'  const a = useThingAQuery();',
						'  const b = useThingBQuery();',
						'  if (a.isError) return <Error />;',
						'  if (b.isPending) return <Skeleton />;',
						'  return <div>{a.data}{b.data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [
						{ messageId: 'preferQueryDisplay' },
						{ messageId: 'preferQueryDisplay' },
					],
				},
			],
		});
	});
};

runCases(preferQueryDisplay, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
