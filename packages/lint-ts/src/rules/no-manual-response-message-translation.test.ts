/**
 * Harness test for `publy/no-manual-response-message-translation` (issue #350,
 * PR JS.7, tracking #502).
 *
 * Uses Oxlint's own `RuleTester` (from `oxlint/plugins-dev`) bridged into
 * Node's built-in `node:test` runner, matching the existing custom lint rules.
 *
 * What this proves:
 * - Plugin wiring: `index.js` exposes
 *   `rules['no-manual-response-message-translation']` pointing at the same rule
 *   object exported from this rule module.
 * - `valid`: unrelated translation keys, the preferred `getFailureMessage`
 *   path, and response-looking but non-matching prefixes report nothing.
 * - `invalid`: `t(...)`, `i18n.t(...)`, and any member expression ending in
 *   `.t(...)` report when called with a response-message key.
 */
import assert from 'node:assert/strict';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import plugin from '../index.ts';
import { noManualResponseMessageTranslation } from './no-manual-response-message-translation.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'no-manual-response-message-translation';

describe('plugin entrypoint wiring (@org/lint-ts)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		assert.strictEqual(
			plugin.rules[RULE_NAME],
			noManualResponseMessageTranslation,
		);
	});
});

const ruleTester = new RuleTester();

const runCases = (rule, label) => {
	describe(`publy/${RULE_NAME} (${label})`, () => {
		ruleTester.run(RULE_NAME, rule, {
			valid: [
				"t('common.save');",
				"t('errors.unknown');",
				't();',
				'i18n.t();',
				'getFailureMessage(toApiFailure(error));',
				'const responseMessage = getMessage(); t(responseMessage);',
				"t('response-other.key');",
				"i18n.exists('response-message.user-not-found');",
				"translate('response-message.user-not-found');",
				't(`${namespace}.user-not-found`);',
			],
			invalid: [
				{
					code: "t('response-message.user-not-found');",
					errors: [{ messageId: 'manualResponseMessage' }],
				},
				{
					code: "t('response-message:user-not-found');",
					errors: [{ messageId: 'manualResponseMessage' }],
				},
				{
					code: 't(`response-message.${key}`);',
					errors: [{ messageId: 'manualResponseMessage' }],
				},
				{
					code: "i18n.t('response-message.user-not-found');",
					errors: [{ messageId: 'manualResponseMessage' }],
				},
				{
					code: 'i18n.t(`response-message.${key}`);',
					errors: [{ messageId: 'manualResponseMessage' }],
				},
				{
					code: "someObj.t('response-message.foo');",
					errors: [{ messageId: 'manualResponseMessage' }],
				},
			],
		});
	});
};

runCases(noManualResponseMessageTranslation, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
