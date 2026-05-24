/**
 * Harness test for the `publy/no-op` scaffold rule (issue #350, PR JS.1).
 *
 * Uses Oxlint's own `RuleTester` (exported from `oxlint/plugins-dev`) rather
 * than ESLint — no heavy new dev deps. We bridge `RuleTester` into Node's
 * built-in `node:test` runner (already used elsewhere in this repo) by handing
 * it `describe`/`it`, so RuleTester failures surface as normal test failures.
 *
 * What this proves:
 * - `valid`: the rule reports nothing under normal code (default behavior).
 * - `invalid`: when explicitly opted in via the test-only `reportEverything`
 *   option, the rule's `create`/`context.report` path actually fires — proving
 *   the rule object is correctly shaped and wired.
 */
import { describe, it } from 'node:test';

import { RuleTester } from 'oxlint/plugins-dev';

import { noOp } from './no-op.js';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

describe('publy/no-op', () => {
	ruleTester.run('no-op', noOp, {
		valid: [
			// Default config: reports nothing, even on a debugger statement.
			'const value = 1;',
			'function example() { return 42; }',
			'debugger;',
			// Explicit-off option is also a no-op.
			{ code: 'debugger;', options: [{ reportEverything: false }] },
		],
		invalid: [
			// Test-only opt-in proves the report path works end-to-end.
			{
				code: 'debugger;',
				options: [{ reportEverything: true }],
				errors: [{ messageId: 'debuggerFound' }],
			},
		],
	});
});
