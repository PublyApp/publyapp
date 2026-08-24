/**
 * Harness test for `publy/prefer-query-display` (dormant detector).
 *
 * Uses Oxlint's own `RuleTester` (from `oxlint/plugins-dev`) bridged into
 * Node's built-in `node:test` runner — same approach as other publy/* tests.
 *
 * What this proves:
 * - Plugin wiring: `index.js` exposes `rules['prefer-query-display']`
 *   pointing at the same rule object exported from the rule module.
 * - `valid`: QueryDisplay usage, mutations (including aliased ones), query-
 *   definition modules, the allow-listed route/auth files, pure helper reads,
 *   non-query aliases/renames, event handlers, memo/effect callbacks, and
 *   bindings that are never rendered conditionally.
 * - `invalid`: a component that binds a `use*Query` result and renders JSX
 *   conditionally on `isPending` / `isLoading` / `isError` / `isSuccess` /
 *   `status` / `error` — via ternary, `&&`, early return, `if`, whole-binding
 *   (`q.isError`) and destructured (`{ isError }`) reads, renamed
 *   destructuring (`{ isPending: loading }`), rest elements (`...rest`),
 *   whole-binding aliasing (`const q = r;`), destructuring from an aliased
 *   binding, JSX-returning render-prop callbacks (`render={…}`,
 *   `children={() => …}`), and hand-rolled ladders inside `switch` case
 *   bodies. `useMutation` results are never flagged.
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
						'  const { isPending } = useMutation();',
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
				// Non-query aliases are not tracked — a plain hook result aliased
				// through an intermediate variable stays unflagged.
				{
					code: [
						'const Foo = () => {',
						'  const r = useWidget();',
						'  const q = r;',
						'  return q.isPending ? <div /> : <div>x</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
				},
				// Non-query renamed destructuring stays unflagged.
				{
					code: [
						'const Foo = () => {',
						'  const { isPending: loading } = useWidget();',
						'  return loading ? <div /> : <div>x</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
				},
				// Aliased useMutation results stay out of scope.
				{
					code: [
						'const Foo = () => {',
						'  const m = useMutation({});',
						'  const { isPending } = m;',
						'  return isPending ? <Spinner /> : <div />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
				},
				// A non-JSX-returning callback in a JSX value position is an event
				// handler (`onClick`-style), not a render prop.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  return <button onClick={(event) => { if (q.isError) event.preventDefault(); }}>go</button>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
				},
				// A JSX-returning memo/effect callback is not a render prop (not in
				// a JSX value position).
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  const extra = useMemo(() => (q.isError ? <Err /> : null), [q.isError]);',
						'  return <div>{extra}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
				},
				// A callback in a render-prop slot that does not return JSX is left
				// alone.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  return <Controller name="a" control={c} render={({ field }) => field.onChange(String(q.data))} />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
				},
				// Computed prop values are not render output: a flag read inside an
				// attribute expression (`disabled={q.isPending}`) or a nested
				// element's attributes stays unflagged.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  return <DropdownMenuTrigger render={<Button disabled={q.isPending} title={q.isPending ? t("loading") : undefined} />}>',
						'    go',
						'  </DropdownMenuTrigger>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
				},
				// Delegating props (`isPending={q.isPending}`) hand the state to
				// QueryDisplay/DataTable — not a hand-rolled ladder.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  return <DataTable rows={rows} isPending={q.isPending} isError={q.isError} />;',
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
				// A hoisted callback that does NOT return JSX stays skipped even in
				// a render-named slot.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  const renderValue = ({ field }) => field.onChange(String(q.data));',
						'  return <Controller name="a" control={c} render={renderValue} />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
				},
				// An identifier prop that is not a hoisted callback reference
				// (`render={someString}`) is not render context.
				{
					code: [
						'const Foo = () => {',
						'  const label = "loading";',
						'  return <Wizard render={label} />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
				},
				// A hoisted JSX-returning callback never passed anywhere is just an
				// unused local — no render position, no ladder.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  const maybeRender = () => (q.isError ? <Error /> : <div>{q.data}</div>);',
						'  console.log(maybeRender);',
						'  return <QueryDisplay query={q}>{({ data }) => <div>{data}</div>}</QueryDisplay>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
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
				// Renamed destructuring: the local alias of a flagged field is
				// tracked through the rename.
				{
					code: [
						'const Foo = () => {',
						'  const { isPending: loading } = useThingQuery();',
						'  return loading ? <Skeleton /> : <div />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Renamed destructuring alongside untouched names.
				{
					code: [
						'const Foo = () => {',
						'  const { data, isPending: loading, isError: failed } = useThingQuery();',
						'  if (failed) return <Error />;',
						'  return loading ? <Skeleton /> : <div>{data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [
						{ messageId: 'preferQueryDisplay' },
						{ messageId: 'preferQueryDisplay' },
					],
				},
				// Rest element keeps a whole result object: `...rest` reads flags
				// via member access.
				{
					code: [
						'const Foo = () => {',
						'  const { data, ...rest } = useThingQuery();',
						'  return rest.isPending ? <Skeleton /> : <div>{data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Whole binding aliased through an intermediate variable.
				{
					code: [
						'const Foo = () => {',
						'  const r = useThingQuery();',
						'  const q = r;',
						'  return q.isPending ? <Skeleton /> : <div>{r.data}</div>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Destructuring from an already tracked whole binding.
				{
					code: [
						'const Foo = () => {',
						'  const r = useThingQuery();',
						'  const { isPending } = r;',
						'  return isPending && <Skeleton />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Alias chain: hook result → alias → renamed destructure, used late.
				{
					code: [
						'const Foo = () => {',
						'  const r = useThingQuery();',
						'  const q = r;',
						'  const { isLoading: spinning } = q;',
						'  return spinning ? <Spinner /> : <div />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Render prop: JSX-returning `render` callback on a Controller is
				// render context even though it sits in a callback.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  return (',
						'    <Controller',
						'      name="a"',
						'      control={c}',
						'      render={({ field }) => (',
						'        q.isPending ? <LoadingSpinner /> : <button onClick={field.onChange} />',
						'      )}',
						'    />',
						'  );',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Render prop with a block body computing state from the query
				// (_invite-profile-select.tsx shape).
				{
					code: [
						'const Foo = () => {',
						'  const profilesQuery = useStaffProfilesQuery();',
						'  return (',
						'    <Controller',
						'      name="profiles"',
						'      control={control}',
						'      render={({ field }) => {',
						'        const triggerLabel = profilesQuery.isPending',
						'          ? t("loading-profiles")',
						'          : t("select-profiles");',
						'        return <span>{triggerLabel}</span>;',
						'      }}',
						'    />',
						'  );',
						'};',
					].join('\n'),
					filename: ROUTE_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Render prop as a JSX child expression: `children={() => …}`.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  return (',
						'    <Select>',
						'      {() => (q.isError ? <Error /> : <List items={q.data} />)}',
						'    </Select>',
						'  );',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Renamed destructure read inside a render-prop callback: tracking
				// and render-context detection compose.
				{
					code: [
						'const Foo = () => {',
						'  const { isPending: loading } = useThingQuery();',
						'  return <Wizard steps={[loading]} render={() => (loading ? <Skeleton /> : <Done />)} />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Hand-rolled ladder inside a `switch` case body: the case-body
				// walk must reach statements under `case`/`default`. The
				// discriminant carries no flagged field, so the diagnostic can
				// only come from walking the case body itself.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  const mode = "view";',
						'  switch (mode) {',
						'    case "pending":',
						'      return q.isPending ? <Skeleton /> : <div>{q.data}</div>;',
						'    default:',
						'      return <div>{q.data}</div>;',
						'  }',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Same ladder inside a brace-less case body.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  switch (q.data?.id) {',
						'    case 1:',
						'      if (q.isError) return <Error />;',
						'      return <div>{q.data}</div>;',
						'    default:',
						'      return null;',
						'  }',
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
				// Hoisted render prop: the JSX-returning callback is declared as a
				// variable first and passed as `render={renderX}` — still render
				// context (r2 review bypass).
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  const renderField = ({ field }) => (',
						'    q.isPending ? <LoadingSpinner /> : <button onClick={field.onChange} />',
						'  );',
						'  return <Controller name="a" control={c} render={renderField} />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Hoisted render prop via a member expression: `render={obj.render}`.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  const slots = { render: () => (q.isError ? <Error /> : <List items={q.data} />) };',
						'  return <Controller name="a" control={c} render={slots.render} />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Hoisted render prop passed as an explicit `children={renderX}` prop.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  const renderItems = () => (q.isPending ? <Skeleton /> : <List items={q.data} />);',
						'  return <Select children={renderItems} />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Hoisted render prop declared with a function expression.
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  const renderBody = function ({ field }) {',
						'    return q.error ? <Error /> : <div>{q.data}</div>;',
						'  };',
						'  return <Controller name="a" control={c} render={renderBody} />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// Hoisted render prop referenced from a rest-destructured query
				// result: tracking and hoisted-reference resolution compose.
				{
					code: [
						'const Foo = () => {',
						'  const { data, ...rest } = useThingQuery();',
						'  const renderRow = () => (rest.isPending ? <Skeleton /> : <div>{data}</div>);',
						'  return <Table render={renderRow} />;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
				// A JSX-returning callback referenced from ANY prop position is
				// treated like its inline equivalent (`onClick={(…) => <jsx/>}` is
				// already render context under the shipped semantics).
				{
					code: [
						'const Foo = () => {',
						'  const q = useThingQuery();',
						'  const handleDelete = () => (q.isError ? null : <span />);',
						'  return <Button onClick={handleDelete}>go</Button>;',
						'};',
					].join('\n'),
					filename: COMPONENT_FILE,
					errors: [{ messageId: 'preferQueryDisplay' }],
				},
			],
		});
	});
};

runCases(preferQueryDisplay, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
