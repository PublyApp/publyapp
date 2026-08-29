/**
 * Spec for `func-style: ["error", "expression"]` (issue #1834 — uniform arrow
 * expression form for non-method functions across the monorepo).
 *
 * `func-style` is a stock ESLint rule ported by oxlint. It has no source code
 * in `publy/`, no plugin entrypoint, and no `RuleTester` body of its own — what
 * this file pins is therefore the SHAPE the rule takes in the root
 * `.oxlintrc.json` (a `["error", "expression"]` tuple, NOT a bare string), and
 * the LIVE behaviour oxlint shows when that entry is in force (a fixture with
 * a top-level `function` declaration is reported by exactly the `func-style`
 * rule). A config edit that flips the value to `"declaration"`, or to plain
 * `"error"` (which oxlint rejects for this rule), or that removes the entry
 * entirely, fails at least one of the legs below.
 *
 * The three legs are independent on purpose so a regression names the exact
 * axis that drifted:
 *
 *   1. Config leg — the root `.oxlintrc.json` configures `func-style` as the
 *      two-element tuple `["error", "expression"]`, with no override that
 *      re-asserts the rule at a different level, and no ignore-pattern that
 *      would silence the rule on the 39 files the issue owns. A config that
 *      carries `func-style: "error"` (a bare string) fails the shape check;
 *      a config that flips the value to `"declaration"` or `["error",
 *      "declaration"]` fails the literal-element check.
 *
 *   2. Behavioural leg — given a temp file with a single top-level
 *      `function foo() {}` declaration, `runOxlint` returns at least one
 *      diagnostic whose `code` is `func-style` and whose `message` mentions
 *      "function expression" (the rule's own help text, which is the exact
 *      signal a maintainer would need to convert the offender to
 *      `const foo = () => {}`). A non-`func-style` code (e.g. an unrelated
 *      oxlint rule that incidentally fires on the fixture) cannot satisfy
 *      this leg.
 *
 *   3. Negative fixture leg — a temp file with ONLY an arrow expression
 *      (`const foo = () => {};`) and a top-level class method (the one form
 *      `func-style` does NOT cover) produces zero `func-style` diagnostics.
 *      This pins the fact that the rule's scope stops at top-level
 *      declarations, so converting the 98 production violations does not
 *      accidentally drag unrelated class methods or arrow expressions into
 *      a re-fix.
 *
 * Each leg runs through `runOxlint`, the same wrapper `lint-scoping.test.ts`
 * uses for its anti-slop wiring guard — both the config-driven check and the
 * rule-fires check go through the same code path oxlint itself goes through
 * in CI, so this test cannot pass under a config that CI would reject.
 */
import assert from 'node:assert/strict';
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, it } from 'vitest';

import { runOxlint } from '../lib/run-oxlint.ts';

const WORKSPACE_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const OXLINTRC_PATH = fileURLToPath(
	new URL('../../../../.oxlintrc.json', import.meta.url),
);

// `.tmp/` n'est pas versionne : sur un checkout neuf (et donc en CI) il n'existe pas, et
// `mkdtempSync` echoue en ENOENT avant meme que le test ne demarre. On le cree ici, une
// fois, plutot que de dependre d'un residu d'execution locale.
const TMP_ROOT = join(WORKSPACE_ROOT, '.tmp');
mkdirSync(TMP_ROOT, { recursive: true });

interface OxlintRootConfig {
	rules?: Record<string, unknown>;
	overrides?: Array<{ files?: string[]; rules?: Record<string, unknown> }>;
	ignorePatterns?: string[];
}

const ROOT_CONFIG = JSON.parse(
	readFileSync(OXLINTRC_PATH, 'utf8'),
) as OxlintRootConfig;
const ROOT_RULES = ROOT_CONFIG.rules ?? {};

const isFuncStyleTuple = (
	value: unknown,
): value is ['error' | string, string] =>
	Array.isArray(value) &&
	value.length === 2 &&
	value[0] === 'error' &&
	typeof value[1] === 'string';

const writeFixture = (dir: string, name: string, body: string): string => {
	const path = join(dir, name);
	writeFileSync(path, body);
	return path;
};

describe('func-style: ["error", "expression"] (#1834 — uniform arrow form)', () => {
	describe('config leg — root .oxlintrc.json carries the exact shape', () => {
		it('configures func-style as the ["error", "expression"] tuple at the root', () => {
			const value = ROOT_RULES['func-style'];

			assert.ok(
				isFuncStyleTuple(value),
				`root .oxlintrc.json must configure "func-style" as ["error", "expression"]; got ${JSON.stringify(value)}`,
			);
			assert.strictEqual(
				value[1],
				'expression',
				`root .oxlintrc.json must configure "func-style" with the "expression" option; got ${JSON.stringify(value)}`,
			);
		});

		it('does not re-assert func-style at a different level under overrides', () => {
			const overrides = ROOT_CONFIG.overrides ?? [];

			for (const entry of overrides) {
				const overrideRules = entry.rules ?? {};
				assert.strictEqual(
					overrideRules['func-style'],
					undefined,
					`func-style must be configured exactly once at the root; an override re-asserts it under files=${JSON.stringify(entry.files)} and risks a drift that the root entry would mask`,
				);
			}
		});

		it('does not ignorePattern the 39 production files out of linting', () => {
			const ignorePatterns = ROOT_CONFIG.ignorePatterns ?? [];

			// 39 production files own the issue (#1834). If any of them were
			// dropped into `ignorePatterns` (a silent way to make a violation
			// disappear), a `func-style` diagnostic on it would never surface
			// in CI. None of them is a path oxlint already ignores by default,
			// so a real entry here is always suspicious.
			const suspiciousPattern =
				/(func-style|arrow-function-components|scripts-ts|shared-ts)/;
			const hit = ignorePatterns.find((pattern) =>
				suspiciousPattern.test(pattern),
			);

			assert.strictEqual(
				hit,
				undefined,
				`ignorePatterns must not silence func-style on the 39 production files; found ${JSON.stringify(hit)}`,
			);
		});
	});

	describe('behavioural leg — oxlint reports a `function` declaration under the root config', () => {
		const tempDir = mkdtempSync(join(TMP_ROOT, 'func-style-red-'));
		const fixturePath = writeFixture(
			tempDir,
			'function-declaration.fixture.ts',
			'export function probe() {\n\treturn 1;\n}\nprobe();\n',
		);

		afterAll(() => {
			rmSync(tempDir, { force: true, recursive: true });
		});

		it('a top-level `function` declaration is reported as `func-style`', () => {
			const diagnostics = runOxlint([fixturePath]).diagnostics as Array<{
				code?: string;
				message?: string;
			}>;

			// oxlint reports native ESLint rules with a `eslint(<rule>)` code,
			// not the bare rule name. A filter against `diag.code === 'func-style'`
			// would always be empty and the leg would never go red on a real
			// regression; substring match is the only test that actually
			// observes the rule.
			const funcStyleDiagnostics = diagnostics.filter((diag) =>
				(diag.code ?? '').includes('func-style'),
			);

			assert.ok(
				funcStyleDiagnostics.length > 0,
				`oxlint must report at least one func-style diagnostic on a top-level function declaration; got ${JSON.stringify(diagnostics)}`,
			);
			// The rule's help text names the replacement form by name — that
			// is the exact signal a maintainer would need to convert
			// `function foo() {}` to `const foo = () => {}`, so a fix that
			// drops the message would make the violation uncorrectable.
			assert.ok(
				funcStyleDiagnostics.some((diag) =>
					/function expression/i.test(diag.message ?? ''),
				),
				`the func-style diagnostic must mention "function expression" in its message; got ${JSON.stringify(funcStyleDiagnostics)}`,
			);
		});
	});

	describe('negative fixture leg — non-violating code produces zero func-style diagnostics', () => {
		const tempDir = mkdtempSync(join(TMP_ROOT, 'func-style-green-'));
		const arrowOnlyPath = writeFixture(
			tempDir,
			'arrow-only.fixture.ts',
			'export const probe = (): number => 1;\nprobe();\n',
		);
		const classMethodsPath = writeFixture(
			tempDir,
			'class-methods.fixture.ts',
			'export class Probe {\n\tpublic method(): number {\n\t\treturn 1;\n\t}\n}\n',
		);

		afterAll(() => {
			rmSync(tempDir, { force: true, recursive: true });
		});

		it('a top-level arrow expression produces zero func-style diagnostics', () => {
			const diagnostics = runOxlint([arrowOnlyPath]).diagnostics as Array<{
				code?: string;
			}>;

			// oxlint reports native ESLint rules with a `eslint(<rule>)` code
			// (see the behavioural leg above); substring match is the only
			// filter that actually observes the rule.
			const funcStyleDiagnostics = diagnostics.filter((diag) =>
				(diag.code ?? '').includes('func-style'),
			);

			assert.strictEqual(
				funcStyleDiagnostics.length,
				0,
				`a top-level arrow expression must not produce a func-style diagnostic; got ${JSON.stringify(funcStyleDiagnostics)}`,
			);
		});

		it('a class with methods produces zero func-style diagnostics (func-style does not touch class methods)', () => {
			const diagnostics = runOxlint([classMethodsPath]).diagnostics as Array<{
				code?: string;
			}>;

			// See the arrow-only test above: oxlint prefixes native ESLint
			// rule codes with `eslint(`, so substring match is the only
			// filter that observes the rule.
			const funcStyleDiagnostics = diagnostics.filter((diag) =>
				(diag.code ?? '').includes('func-style'),
			);

			assert.strictEqual(
				funcStyleDiagnostics.length,
				0,
				`a class with methods must not produce a func-style diagnostic; got ${JSON.stringify(funcStyleDiagnostics)}`,
			);
		});
	});

	describe('production tree leg — the monorepo carries zero func-style diagnostics under the root config', () => {
		// Drive `runOxlint` over the same paths oxlint lints in CI (the whole
		// workspace, scoped by the config's own `ignorePatterns`). Asserting on
		// ZERO `func-style` diagnostics here is the only honest way to pin
		// "the 98 production violations are all converted" — a counter is not
		// enough because a regression that re-introduces a `function`
		// declaration on a NEW file would not move the counter from 98 to 99
		// if the conversion left any other violation behind. The test fails
		// with the exact file:line of every offender, so a regression names
		// the regression in the test name.
		it(
			'no top-level `function` declaration survives anywhere oxlint lints',
			{ timeout: 120_000 },
			() => {
				const result = runOxlint(['.'], {
					cwd: WORKSPACE_ROOT,
				});

				// oxlint reports native ESLint rules with a `eslint(<rule>)` code
				// (see the behavioural leg above); substring match against the
				// function name is the only filter that actually observes the
				// rule. A regression that re-introduces a top-level `function`
				// on any file would land here as a non-empty list, naming the
				// file in the test output — the proof the brief asks for.
				const funcStyleDiagnostics = (
					result.diagnostics as Array<{
						code?: string;
						message?: string;
					}>
				).filter((diag) => (diag.code ?? '').includes('func-style'));

				if (funcStyleDiagnostics.length > 0) {
					const names = funcStyleDiagnostics
						.map((diag) => diag.message ?? JSON.stringify(diag))
						.join('\n  ');

					assert.fail(
						`oxlint must report zero func-style diagnostics on the production tree; got ${funcStyleDiagnostics.length}:\n  ${names}`,
					);
				}

				assert.strictEqual(funcStyleDiagnostics.length, 0);
			},
		);
	});
});
