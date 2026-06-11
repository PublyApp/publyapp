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
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RuleTester } from 'oxlint/plugins-dev';

import plugin from '../index.js';
import { arrowFunctionComponents } from './arrow-function-components.js';

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
				// Component with conditional JSX return
				{
					code: 'export function ProgressBar({ value }) { if (value < 0) { return null; } return <div style={{ width: value + "%" }} />; }',
					filename: 'apps/front/src/components/progress-bar.tsx',
					errors: [{ messageId: 'useArrowFunction' }],
				},
			],
		});
	});
};

runCases(arrowFunctionComponents, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
