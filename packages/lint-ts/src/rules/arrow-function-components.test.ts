/**
 * Harness test for `publy/arrow-function-components` (dormant detector).
 *
 * Uses Oxlint's own `RuleTester` (from `oxlint/plugins-dev`) bridged into
 * Node's built-in `node:test` runner — same approach as other publy/* tests.
 *
 * What this proves:
 * - Plugin wiring: `index.js` exposes `rules['arrow-function-components']`
 *   pointing at the same rule object exported from the rule module.
 * - `valid`: arrow components, PascalCase helpers that never return JSX,
 *   camelCase hook functions, lowercase function declarations returning JSX,
 *   and class declarations are all left un-flagged.
 * - `invalid`: PascalCase function declarations that return JSX are flagged,
 *   including context providers and JSX-fragment-returning layouts.
 * - Ternary / logical JSX returns are caught (finding #1).
 * - Null-only hook-calling PascalCase components are caught (finding #2).
 * - memo/forwardRef-wrapped function expressions are caught (finding #3).
 * - Anonymous default-exported function components are caught (finding #3).
 * - Round-2: control-flow test expressions are scanned for hook calls.
 * - Round-2: hook detection is import-binding-aware (locally-declared non-hook
 *   `use*` utilities are not treated as React hooks).
 * - Round-2: wrapper detection is import-binding-aware (locally-defined `memo`
 *   functions do not trigger the wrapper check).
 * - Round-2: expressionContainsJsx branches (parenthesized, TSAsExpression,
 *   TSSatisfiesExpression, TSNonNullExpression) are exercised.
 * - Round-3: alias-aware react imports for wrappers: `import { memo as m }` →
 *   `m(fn)` IS flagged; `import { useMemo as memo }` → `memo(fn)` is NOT a wrapper.
 * - Round-3: local arrow-function map: `const useThing = () => 42` is locally declared
 *   so Helper calling useThing() is NOT flagged; but a local arrow `useThing` that
 *   itself calls an imported hook DOES propagate hook-ness to the caller.
 * - Round-4: expression-bodied local arrow hooks: `const useThing = () => useRef(null)`
 *   has an expression body — analyseBody now scans it for hook calls (not early-return).
 *   Helper calling useThing() is flagged; non-hook expression bodies stay clean.
 */
import assert from 'node:assert/strict';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import plugin from '../index.ts';
import { arrowFunctionComponents } from './arrow-function-components.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'arrow-function-components';

// -- Plugin entrypoint wiring assertion ---------------------------------------
describe('plugin entrypoint wiring (@org/lint-ts)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		assert.strictEqual(plugin.rules[RULE_NAME], arrowFunctionComponents);
	});
});

// -- RuleTester cases ---------------------------------------------------------
const ruleTester = new RuleTester();

const runCases = (rule, label) => {
	describe(`publy/${RULE_NAME} (${label})`, () => {
		ruleTester.run(RULE_NAME, rule, {
			valid: [
				// Arrow function component — the canonical form
				{
					code: 'const Foo = () => <div />;',
					filename: 'apps/front/src/components/foo.tsx',
				},
				// Arrow function component with block body
				{
					code: 'const Card = ({ title }) => { return <Box>{title}</Box>; };',
					filename: 'apps/front/src/components/card.tsx',
				},
				// PascalCase helper that never returns JSX — plain string return
				{
					code: 'function FormatLabel(value) { return value.toUpperCase(); }',
					filename: 'apps/front/src/utils/format.ts',
				},
				// PascalCase helper that returns a number
				{
					code: 'function ComputeTotal(items) { return items.length; }',
					filename: 'apps/front/src/utils/math.ts',
				},
				// camelCase hook — not a component by naming convention
				{
					code: 'function useMyHook() { return <div/>; }',
					filename: 'apps/front/src/hooks/use-my-hook.tsx',
				},
				// Lowercase function returning JSX — not a component by convention
				{
					code: 'function renderRow(item) { return <Box>{item.name}</Box>; }',
					filename: 'apps/front/src/components/table.tsx',
				},
				// Class declaration — out of scope for this rule
				{
					code: 'class MyComponent extends React.Component { render() { return <div />; } }',
					filename: 'apps/front/src/components/legacy.tsx',
				},
				// Generator function — always excluded
				{
					code: 'function* Counter() { yield <div/>; }',
					filename: 'apps/front/src/components/counter.tsx',
				},
				// PascalCase function with no return value at all
				{
					code: 'function SideEffect() { console.log("hello"); }',
					filename: 'apps/front/src/utils/side-effects.ts',
				},
				// PascalCase function returning null only, no hooks — NOT flagged
				// (indistinguishable from a utility function without file-path heuristics)
				{
					code: 'function Placeholder() { return null; }',
					filename: 'apps/front/src/utils/placeholder.ts',
				},
				// Arrow-form component inside memo (imported from react) — valid (already arrow)
				{
					code: "import { memo } from 'react'; const Foo = memo(() => <div />);",
					filename: 'apps/front/src/components/foo.tsx',
				},
				// Arrow-form component inside forwardRef (imported from react) — valid
				{
					code: "import { forwardRef } from 'react'; const Input = forwardRef((props, ref) => <input ref={ref} {...props} />);",
					filename: 'apps/front/src/components/input.tsx',
				},
				// Arrow-form inside React.memo — valid
				{
					code: "import React from 'react'; const Foo = React.memo(() => <div />);",
					filename: 'apps/front/src/components/foo.tsx',
				},
				// Ternary JSX return in arrow function — valid
				{
					code: 'const Badge = ({ count }) => count > 0 ? <span>{count}</span> : null;',
					filename: 'apps/front/src/components/badge.tsx',
				},
				// PascalCase function with null-only return AND no hooks — NOT flagged
				{
					code: 'function EmptyState() { const x = 1; return null; }',
					filename: 'apps/front/src/utils/empty.ts',
				},

				// Round-2 valid: PascalCase helper calling a locally-declared non-hook
				// `use*` utility (not imported from 'react' or any module).
				// useThing() is declared locally and does NOT itself call any hooks,
				// so PascalCase helper calling it + returning null must NOT be flagged.
				{
					code: [
						'function useThing() { return 42; }',
						'function Helper() { const val = useThing(); return null; }',
					].join('\n'),
					filename: 'apps/front/src/utils/helper.ts',
				},

				// Round-2 valid: a locally-defined custom `memo` function that is NOT
				// imported from 'react' must not trigger wrapper detection.
				// The FunctionExpression argument `function() { return <span />; }` must
				// NOT be flagged because the local `memo` is not React's memo.
				{
					code: [
						'function memo(fn) { return fn; }',
						'const Wrapped = memo(function() { return <span />; });',
					].join('\n'),
					filename: 'apps/front/src/utils/memo-util.tsx',
				},

				// Round-3 valid: `import { useMemo as memo }` — local 'memo' has imported
				// name 'useMemo', NOT 'memo', so `memo(fn, [])` must NOT be treated as a
				// React.memo wrapper call. The inner `function computeX()` is NOT flagged
				// (because memo() is not a React wrapper here).
				{
					code: [
						"import { useMemo as memo } from 'react';",
						'const Comp = () => {',
						'  const val = memo(function computeX() { return 42; }, []);',
						'  return <div>{val}</div>;',
						'};',
					].join('\n'),
					filename: 'apps/front/src/components/comp.tsx',
				},

				// Round-3 valid: local arrow `useThing` is NOT a hook (returns a plain value,
				// calls no hooks itself) → Helper calling it + returning null must NOT be flagged.
				{
					code: [
						'const useThing = () => 42;',
						'function Helper() { const val = useThing(); return null; }',
					].join('\n'),
					filename: 'apps/front/src/utils/helper.ts',
				},

				// Round-3 valid: exported const arrow non-hook useThing → no diagnostic.
				{
					code: [
						"export const useThing = () => 'label';",
						'function Helper() { const val = useThing(); return null; }',
					].join('\n'),
					filename: 'apps/front/src/utils/helper.ts',
				},

				// Round-4 valid: expression-bodied local arrow that returns a plain value
				// (not a hook call) must NOT cause Helper2 to be flagged.
				// This is the companion to the Round-4 invalid case above —
				// confirms the expression-body scanner correctly rejects non-hook expressions.
				{
					code: [
						'const useThing = () => 42;',
						'function Helper2() { useThing(); return null; }',
					].join('\n'),
					filename: 'apps/front/src/utils/helper2.ts',
				},
			],
			invalid: [
				// Basic function declaration component
				{
					code: 'function Foo() { return <div />; }',
					filename: 'apps/front/src/components/foo.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
				// Exported function declaration component
				{
					code: 'export function Card() { return <Box />; }',
					filename: 'apps/front/src/components/card.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
				// Context provider — returns JSX so it IS a component
				{
					code: 'export function BrandProvider({ children }) { return <Ctx.Provider>{children}</Ctx.Provider>; }',
					filename: 'apps/front/src/components/brand-context.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
				// JSX fragment return
				{
					code: 'function Layout() { return <><div /></>; }',
					filename: 'apps/front/src/layouts/layout.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
				// Component with props destructuring
				{
					code: 'export function NavItem({ href, label }) { return <a href={href}>{label}</a>; }',
					filename: 'apps/front/src/components/nav-item.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
				// Component with conditional JSX return (non-JSX guard + JSX return)
				{
					code: 'export function ProgressBar({ value }) { if (value < 0) { return null; } return <div style={{ width: value + "%" }} />; }',
					filename: 'apps/front/src/components/progress-bar.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},

				// Finding #1: ternary JSX return — `return ok ? <Foo /> : null`
				{
					code: 'function Badge({ count }) { return count > 0 ? <span>{count}</span> : null; }',
					filename: 'apps/front/src/components/badge.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
				// Finding #1: logical-and JSX return — `return flag && <Foo />`
				{
					code: 'function Overlay({ visible }) { return visible && <div className="overlay" />; }',
					filename: 'apps/front/src/components/overlay.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
				// Finding #1: nullish-coalescing JSX return — `return value ?? <Fallback />`
				{
					code: 'function MaybeContent({ node }) { return node ?? <Fallback />; }',
					filename: 'apps/front/src/components/maybe-content.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},

				// Finding #2: null-only component that calls a hook (imported from react)
				{
					code: "import { useRef } from 'react'; function ProgressBar({ value }) { const x = useRef(null); return null; }",
					filename: 'apps/front/src/components/progress-bar.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
				// Finding #2: null-only with useEffect hook (imported from react)
				{
					code: "import { useEffect } from 'react'; function SyncEffect({ id }) { useEffect(() => { sync(id); }, [id]); return null; }",
					filename: 'apps/front/src/components/sync-effect.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},

				// Finding #3: memo(function Foo() {...}) — named function expression (memo imported from react)
				{
					code: "import { memo } from 'react'; const Foo = memo(function Foo() { return <div />; });",
					filename: 'apps/front/src/components/foo.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
				// Finding #3: memo(function() {...}) — anonymous function expression (memo imported from react)
				{
					code: "import { memo } from 'react'; const Bar = memo(function() { return <span />; });",
					filename: 'apps/front/src/components/bar.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
				// Finding #3: forwardRef(function Input() {...}) — imported from react
				{
					code: "import { forwardRef } from 'react'; const Input = forwardRef(function Input(props, ref) { return <input ref={ref} />; });",
					filename: 'apps/front/src/components/input.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
				// Finding #3: React.memo(function Foo() {...}) — default import
				{
					code: "import React from 'react'; const Foo = React.memo(function Foo() { return <div />; });",
					filename: 'apps/front/src/components/foo.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
				// Finding #3: React.forwardRef(function() {...}) — default import
				{
					code: "import React from 'react'; const Input = React.forwardRef(function(props, ref) { return <input ref={ref} />; });",
					filename: 'apps/front/src/components/input.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
				// Finding #3: anonymous export default function
				{
					code: 'export default function() { return <div />; }',
					filename: 'apps/front/src/routes/page.tsx',
					errors: [{ messageId: 'useArrowFunctionAnonymous' }],
				},

				// Round-2 finding #1: hook call in `if` condition test expression is scanned.
				// `function Gate() { if (useFeatureFlag()) { return null; } return null; }`
				// useFeatureFlag is imported, so it IS a hook → component must be flagged.
				{
					code: "import { useFeatureFlag } from '#app/hooks'; function Gate() { if (useFeatureFlag()) { return null; } return null; }",
					filename: 'apps/front/src/components/gate.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},

				// Round-2 finding #2: imported custom hook from non-react module counts as hook.
				// Ensures PascalCase components calling imported use* helpers are correctly flagged.
				{
					code: "import { useStore } from '#app/store'; function StatusBar() { const state = useStore(); return null; }",
					filename: 'apps/front/src/components/status-bar.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},

				// Round-2 finding #4: parenthesized JSX return from function-declaration component.
				{
					code: 'function Card() { return (<div />); }',
					filename: 'apps/front/src/components/card.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
				// Round-2 finding #4: TSAsExpression-wrapped JSX return.
				{
					code: 'function Widget() { return <span /> as unknown; }',
					filename: 'apps/front/src/components/widget.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
				// Round-2 finding #4: TSSatisfiesExpression-wrapped JSX return.
				{
					code: 'function Panel() { return <div /> satisfies React.ReactElement; }',
					filename: 'apps/front/src/components/panel.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
				// Round-2 finding #4: TSNonNullExpression-wrapped JSX return.
				// `(<span />)!` is TSNonNullExpression → ParenthesizedExpression → JSXElement,
				// which exercises both the TSNonNullExpression and ParenthesizedExpression
				// branches of expressionContainsJsx.
				{
					code: 'function Toast() { return (<span />)!; }',
					filename: 'apps/front/src/components/toast.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},

				// Round-3 finding #1 (invalid): aliased memo import IS treated as React.memo
				// wrapper. `import { memo as m }` → imported name is 'memo' → m(fn) IS flagged.
				{
					code: [
						"import { memo as m } from 'react';",
						'const Foo = m(function Foo() { return <div />; });',
					].join('\n'),
					filename: 'apps/front/src/components/foo.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},

				// Round-3 finding #2 (invalid): local arrow `useThing` that itself calls an
				// imported hook propagates hook-ness → Helper is correctly flagged.
				{
					code: [
						"import { useRef } from 'react';",
						'const useThing = () => { const r = useRef(null); return r; };',
						'function Helper() { useThing(); return null; }',
					].join('\n'),
					filename: 'apps/front/src/components/helper.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},

				// Round-4 finding #1 (invalid): expression-bodied local arrow hook.
				// `const useThing = () => useRef(null)` has an expression body (not a
				// BlockStatement) — analyseBody must scan it for hook calls rather than
				// returning early. Helper calls useThing() → useThing is a hook →
				// Helper (PascalCase, returns only null) must be flagged.
				{
					code: [
						"import { useRef } from 'react';",
						'const useThing = () => useRef(null);',
						'function Helper() { useThing(); return null; }',
					].join('\n'),
					filename: 'apps/front/src/components/helper.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
			],
		});
	});
};

runCases(arrowFunctionComponents, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
