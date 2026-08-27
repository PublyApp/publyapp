/**
 * Harness test for `publy/require-commit-of-use-offset-page-clamp` (issue #1660).
 *
 * Uses Oxlint's own `RuleTester` (from `oxlint/plugins-dev`) bridged into
 * vitest, matching the house pattern in `no-array-reduce.test.ts`.
 *
 * What this proves:
 * - Plugin wiring: `index.ts` exposes
 *   `rules['require-commit-of-use-offset-page-clamp']` pointing at the same
 *   rule object exported from the rule module.
 * - valid (the real callers' pattern):
 *   1. `if (clamped !== pageIndex) setPageIndex(clamped)` — the adjust-
 *      state-while-rendering commit pattern (#1660 contract).
 *   2. Direct setter-arg call: `setPageIndex(useOffsetPageClamp({...}))`.
 *   3. Destructured assignment + setter usage in the same scope.
 *   4. Member-expression hook call + setter commit.
 *   5. Committed via `setMembersPageIndex` (different setter name).
 *   6. A legit `set*` that receives the clamped value as its FIRST argument.
 * - invalid (fabricated negligent callers):
 *   1. `const clamped = useOffsetPageClamp({...});` — assignment with no
 *      setter usage anywhere in the function body (the exact foot-gun).
 *   2. `useOffsetPageClamp({...});` — bare statement, return discarded.
 *   3. `const clamped = useOffsetPageClamp({...});` with the variable never
 *      reaching a setter (e.g. passed to a non-setter function).
 *   4. `setTimeout(() => {}, clamped)` — clamped is the second argument (a
 *      delay), not a setter commit. After the fix this is caught.
 *   5. `obj.set(clamped)` — member-expression callee, not a bare Identifier
 *      setter. After the fix this is caught.
 * - valid: calls to other hooks (`useOtherHook`) are not affected.
 */
import assert from 'node:assert/strict';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import plugin from '../index.ts';
import { noRequireCommitOfUseOffsetPageClamp } from './no-require-commit-of-use-offset-page-clamp.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'require-commit-of-use-offset-page-clamp';

const HOOK_IMPORT = `import { useOffsetPageClamp } from '~/components/table/offset-pagination';`;

// -- Plugin entrypoint wiring assertion ---------------------------------------
describe('plugin entrypoint wiring (@org/lint-ts)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		assert.strictEqual(
			plugin.rules[RULE_NAME],
			noRequireCommitOfUseOffsetPageClamp,
		);
	});
});

// -- RuleTester cases ---------------------------------------------------------
const ruleTester = new RuleTester();

const runCases = (rule, label) => {
	describe(`publy/${RULE_NAME} (${label})`, () => {
		ruleTester.run(RULE_NAME, rule, {
			valid: [
				// #1 pattern: adjust-state-while-rendering commit
				// (the canonical shape used by all three real callers).
				{
					code: [
						HOOK_IMPORT,
						'function Comp({ pageIndex, setPageIndex }) {',
						'  const clampedPageIndex = useOffsetPageClamp({',
						'    pageIndex,',
						'    size: 20,',
						'    count: 100,',
						'    resetKeys: ["a"],',
						'  });',
						'  if (clampedPageIndex !== pageIndex) {',
						'    setPageIndex(clampedPageIndex);',
						'  }',
						'  return null;',
						'}',
					].join('\n'),
					filename: 'apps/front/src/routes/some-page.tsx',
				},

				// #2 pattern: direct setter-arg call — committed inline.
				{
					code: [
						HOOK_IMPORT,
						'function Comp({ pageIndex, setPageIndex }) {',
						'  return setPageIndex(',
						'    useOffsetPageClamp({',
						'      pageIndex,',
						'      size: 20,',
						'      count: 100,',
						'      resetKeys: ["a"],',
						'    }),',
						'  );',
						'}',
					].join('\n'),
					filename: 'apps/front/src/routes/some-page.tsx',
				},

				// #3 pattern: variable extracted and committed without a guard.
				{
					code: [
						HOOK_IMPORT,
						'function Comp({ setPageIndex }) {',
						'  const clamped = useOffsetPageClamp({',
						'    pageIndex: 0,',
						'    size: 20,',
						'    count: 100,',
						'    resetKeys: ["a"],',
						'  });',
						'  setPageIndex(clamped);',
						'  return null;',
						'}',
					].join('\n'),
					filename: 'apps/front/src/routes/some-page.tsx',
				},

				// #4 pattern: member expression call to the hook, committed.
				{
					code: [
						'import { hooks } from "~/hooks";',
						'function Comp({ setPageIndex }) {',
						'  const clamped = hooks.useOffsetPageClamp({',
						'    pageIndex: 0,',
						'    size: 20,',
						'    count: 100,',
						'    resetKeys: ["a"],',
						'  });',
						'  setPageIndex(clamped);',
						'  return null;',
						'}',
					].join('\n'),
					filename: 'apps/front/src/routes/some-page.tsx',
				},

				// Not a useOffsetPageClamp call — no-op.
				{
					code: [
						'function Comp({ setPageIndex }) {',
						'  const x = useOtherHook();',
						'  return null;',
						'}',
					].join('\n'),
					filename: 'apps/front/src/routes/some-page.tsx',
				},

				// Committed to a setter with a different name (startsWith "set").
				{
					code: [
						HOOK_IMPORT,
						'function Comp({ setMembersPageIndex }) {',
						'  const clamped = useOffsetPageClamp({',
						'    pageIndex: 0,',
						'    size: 20,',
						'    count: 100,',
						'    resetKeys: ["a"],',
						'  });',
						'  if (clamped !== pageIndex) {',
						'    setMembersPageIndex(clamped);',
						'  }',
						'  return null;',
						'}',
					].join('\n'),
					filename: 'apps/front/src/routes/some-page.tsx',
				},
			],

			invalid: [
				// Fabricated negligent caller: assignment with NO setter usage.
				// This is the exact foot-gun described in the brief.
				{
					code: [
						HOOK_IMPORT,
						'function Comp({ pageIndex }) {',
						'  const clampedPageIndex = useOffsetPageClamp({',
						'    pageIndex,',
						'    size: 20,',
						'    count: 100,',
						'    resetKeys: ["a"],',
						'  });',
						'  return null;',
						'}',
					].join('\n'),
					filename: 'apps/front/src/routes/some-page.tsx',
					errors: [{ messageId: 'notCommitted' }],
				},

				// Bare statement: return value discarded entirely.
				{
					code: [
						HOOK_IMPORT,
						'function Comp() {',
						'  useOffsetPageClamp({',
						'    pageIndex: 0,',
						'    size: 20,',
						'    count: 100,',
						'    resetKeys: ["a"],',
						'  });',
						'  return null;',
						'}',
					].join('\n'),
					filename: 'apps/front/src/routes/some-page.tsx',
					errors: [{ messageId: 'notCommitted' }],
				},

				// Variable extracted but only used in a non-setter call.
				{
					code: [
						HOOK_IMPORT,
						'function Comp({ pageIndex }) {',
						'  const clamped = useOffsetPageClamp({',
						'    pageIndex,',
						'    size: 20,',
						'    count: 100,',
						'    resetKeys: ["a"],',
						'  });',
						'  logPage(clamped);',
						'  return null;',
						'}',
						'function logPage(n: number) { console.log(n); }',
					].join('\n'),
					filename: 'apps/front/src/routes/some-page.tsx',
					errors: [{ messageId: 'notCommitted' }],
				},

				// --- After-fix proof cases (false negatives the old heuristic missed) ---

				// 1. setTimeout(() => {}, clamped) — clamped is the SECOND argument
				// (a delay). The old heuristic accepted this silently because
				// `setTimeout` starts with "set" and `clamped` appears somewhere
				// in the args. After the fix, it must be reported.
				{
					code: [
						HOOK_IMPORT,
						'function Comp({ pageIndex }) {',
						'  const clamped = useOffsetPageClamp({',
						'    pageIndex,',
						'    size: 20,',
						'    count: 100,',
						'    resetKeys: ["a"],',
						'  });',
						'  setTimeout(() => {}, clamped);',
						'  return null;',
						'}',
					].join('\n'),
					filename: 'apps/front/src/routes/some-page.tsx',
					errors: [{ messageId: 'notCommitted' }],
				},

				// 2. obj.set(clamped) — member-expression callee. The old heuristic
				// accepted this because `getCalleeName` extracts "set" from
				// `obj.set` and `clamped` is the first (and only) argument. After
				// the fix, only bare Identifiers are treated as setters.
				{
					code: [
						HOOK_IMPORT,
						'function Comp({ pageIndex }) {',
						'  const clamped = useOffsetPageClamp({',
						'    pageIndex,',
						'    size: 20,',
						'    count: 100,',
						'    resetKeys: ["a"],',
						'  });',
						'  obj.set(clamped);',
						'  return null;',
						'}',
					].join('\n'),
					filename: 'apps/front/src/routes/some-page.tsx',
					errors: [{ messageId: 'notCommitted' }],
				},
			],
		});
	});
};

runCases(noRequireCommitOfUseOffsetPageClamp, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
