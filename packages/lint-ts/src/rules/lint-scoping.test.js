/**
 * Scoping matrix — verifies publy/* rules remain correctly wired and scoped
 * to apps/front (apps/old-front is gone since #1169, see #1172).
 *
 * Guarantees:
 * - Portable rules still cover apps/front source paths.
 * - Dead old-front fixtures no longer trigger their former rule.
 * - Root .oxlintrc.json pins the surviving publy/* rules at error.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
	mkdtempSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { RuleTester } from 'oxlint/plugins-dev';

import plugin from '../index.js';
import { noArrayReduce } from './no-array-reduce.js';
import { noConsoleInSource } from './no-console-in-source.js';
import { noDirectDayjsInComponents } from './no-direct-dayjs-in-components.js';
import { noManualResponseMessageTranslation } from './no-manual-response-message-translation.js';

RuleTester.describe = describe;
RuleTester.it = it;

const WORKSPACE_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const OXLINTRC_PATH = fileURLToPath(
	new URL('../../../../.oxlintrc.json', import.meta.url),
);
const REPO_ROOT = join(WORKSPACE_ROOT, '../..');
const OXLINT_BIN = join(REPO_ROOT, 'node_modules/.bin/oxlint');

const ROOT_RULES = JSON.parse(readFileSync(OXLINTRC_PATH, 'utf8')).rules;

const PUBLY_RULES = [
	'no-array-reduce',
	'no-console-in-source',
	'no-direct-dayjs-in-components',
	'no-manual-response-message-translation',
];

const FRONT_PORTABLE_RULE_CODES = [
	'publy(no-array-reduce)',
	'publy(no-console-in-source)',
	'publy(no-direct-dayjs-in-components)',
	'publy(no-manual-response-message-translation)',
];

const RULE_SCOPING_CASES = [
	{
		ruleName: 'no-console-in-source',
		rule: noConsoleInSource,
		valid: [
			{
				code: "console.log('front 2 test file ignore');",
				filename: 'apps/front/src/components/example.test.tsx',
			},
		],
		invalid: [
			{
				code: "console.log('front should be linted');",
				filename: 'apps/front/src/routes/users/page.tsx',
				errors: [{ messageId: 'unexpected' }],
				output:
					"import { logger } from '@org/shared-ts/lib/logger/iso-logger';\n" +
					"logger.log('front should be linted');",
			},
		],
	},
	{
		ruleName: 'no-direct-dayjs-in-components',
		rule: noDirectDayjsInComponents,
		valid: [
			{
				code: "import dayjs from 'dayjs';",
				filename: 'apps/front/src/pages/users/overview.tsx',
			},
		],
		invalid: [
			{
				code: "import dayjs from 'dayjs';",
				filename: 'apps/front/src/components/date-label.tsx',
				errors: [{ messageId: 'directDayjsImport' }],
			},
			{
				code: "import * as dayjs from 'dayjs';",
				filename: 'apps/front\\src\\_parts\\date-range-picker.tsx',
				errors: [{ messageId: 'directDayjsImport' }],
			},
		],
	},
	{
		ruleName: 'no-array-reduce',
		rule: noArrayReduce,
		valid: [
			{
				code: 'const sum = [1, 2, 3].map((x) => x + 1);',
				filename: 'apps/front/src/pages/users/overview.test.ts',
			},
		],
		invalid: [
			{
				code: 'const total = values.reduce((acc, x) => acc + x, 0);',
				filename: 'apps/front/src/routes/analytics/page.tsx',
				errors: [{ messageId: 'noReduce' }],
			},
		],
	},
	{
		ruleName: 'no-manual-response-message-translation',
		rule: noManualResponseMessageTranslation,
		valid: [
			{
				code: 'getFailureMessage(toApiFailure(error));',
				filename: 'apps/front/src/components/detail-card.tsx',
			},
		],
		invalid: [
			{
				code: "t('response-message.user-not-found');",
				filename: 'apps/front/src/routes/settings/page.tsx',
				errors: [{ messageId: 'manualResponseMessage' }],
			},
		],
	},
];

const isRuleEnabledAsError = (value) => {
	if (value === 'error') {
		return true;
	}

	if (value && typeof value === 'object' && value.level === 'error') {
		return true;
	}

	return false;
};

const runOxlint = (filePaths) => {
	let output = '';

	try {
		output = execFileSync(
			OXLINT_BIN,
			['--config', OXLINTRC_PATH, '--format', 'json', '--quiet', ...filePaths],
			{
				encoding: 'utf8',
				cwd: WORKSPACE_ROOT,
			},
		);
	} catch (error) {
		if (
			!(
				typeof error === 'object' &&
				error !== null &&
				'stdout' in error &&
				'status' in error
			)
		) {
			throw error;
		}

		output = String(error.stdout ?? '');
	}

	const parsed = JSON.parse(output);

	// oxlint output shape is { diagnostics: [...] } when clean.
	if (Array.isArray(parsed.diagnostics)) {
		return parsed;
	}

	return { diagnostics: [] };
};

const createScopingFixtures = () => {
	mkdirSync(join(WORKSPACE_ROOT, '.tmp'), { recursive: true });
	const tempRoot = mkdtempSync(join(WORKSPACE_ROOT, '.tmp', 'lint-scoping-'));
	const frontComponentsDir = join(tempRoot, 'apps/front/src/components');
	const oldFrontComponentsDir = join(tempRoot, 'apps/old-front/src/components');

	mkdirSync(frontComponentsDir, { recursive: true });
	mkdirSync(oldFrontComponentsDir, { recursive: true });

	const frontConsolePath = join(frontComponentsDir, 'front-console.tsx');
	const frontDayjsPath = join(frontComponentsDir, 'front-dayjs.tsx');
	const frontArrayReducePath = join(
		frontComponentsDir,
		'front-array-reduce.tsx',
	);
	const frontManualResponsePath = join(
		frontComponentsDir,
		'front-manual-response.tsx',
	);
	const oldFrontConsolePath = join(oldFrontComponentsDir, 'old-console.tsx');
	const oldFrontDayjsPath = join(oldFrontComponentsDir, 'old-dayjs.tsx');

	writeFileSync(
		frontConsolePath,
		"console.log('front should be linted by no-console-in-source');\n",
	);
	writeFileSync(
		frontDayjsPath,
		"import dayjs from 'dayjs';\nexport const now = dayjs();\n",
	);
	writeFileSync(
		frontArrayReducePath,
		'const values = [1, 2, 3];\n' +
			'export const sum = values.reduce((acc, value) => acc + value, 0);\n',
	);
	writeFileSync(
		frontManualResponsePath,
		"t('response-message.user-not-found');\n",
	);
	writeFileSync(
		oldFrontConsolePath,
		"console.log('old-front must no longer be flagged');\n",
	);
	writeFileSync(
		oldFrontDayjsPath,
		"import dayjs from 'dayjs';\nexport const now = dayjs();\n",
	);

	return {
		frontConsolePath,
		frontDayjsPath,
		frontArrayReducePath,
		frontManualResponsePath,
		oldFrontConsolePath,
		oldFrontDayjsPath,
		cleanup: () => rmSync(tempRoot, { force: true, recursive: true }),
	};
};

const uniqueSorted = (values) => Array.from(new Set(values)).sort();

describe('rule scoping matrix', () => {
	describe('plugin entrypoint exports all scoped rules', () => {
		for (const { ruleName, rule } of RULE_SCOPING_CASES) {
			it(`wires ${ruleName}`, () => {
				assert.strictEqual(plugin.rules[ruleName], rule);
			});
		}
	});

	for (const { ruleName, rule, valid, invalid } of RULE_SCOPING_CASES) {
		const ruleTester = new RuleTester();

		ruleTester.run(ruleName, rule, { valid, invalid });
	}

	it('pins publy rule severities at error in root config', () => {
		for (const ruleName of PUBLY_RULES) {
			const configValue = ROOT_RULES[`publy/${ruleName}`];

			assert.strictEqual(
				isRuleEnabledAsError(configValue),
				true,
				`publy/${ruleName} should be configured as error in .oxlintrc.json`,
			);
		}

		for (const deadRule of [
			'no-native-html-in-mui-surfaces',
			'no-raw-img-in-product-surfaces',
			'no-raw-mui-textfield-register',
		]) {
			assert.strictEqual(
				ROOT_RULES[`publy/${deadRule}`],
				undefined,
				`dead publy/${deadRule} must be removed from .oxlintrc.json`,
			);
		}

		for (const deadRule of [
			'no-native-html-in-mui-surfaces',
			'no-raw-img-in-product-surfaces',
			'no-raw-mui-textfield-register',
		]) {
			assert.strictEqual(
				plugin.rules[deadRule],
				undefined,
				`dead ${deadRule} must be removed from the plugin export`,
			);
		}
	});

	it('verifies apps/front portable rules still fire while apps/old-front is dead', () => {
		const fixtures = createScopingFixtures();

		try {
			const frontDiagnostics = runOxlint([
				fixtures.frontConsolePath,
				fixtures.frontDayjsPath,
				fixtures.frontArrayReducePath,
				fixtures.frontManualResponsePath,
			]).diagnostics;
			const oldFrontDiagnostics = runOxlint([
				fixtures.oldFrontConsolePath,
				fixtures.oldFrontDayjsPath,
			]).diagnostics;

			// Front must report exactly the four portable violations.
			const frontDiagnosticsCodes = frontDiagnostics.map((diag) => diag.code);

			assert.deepStrictEqual(
				uniqueSorted(frontDiagnosticsCodes),
				FRONT_PORTABLE_RULE_CODES.slice().sort(),
				'front apps should report exactly the expected portable violations',
			);

			// Old-front fixtures must produce zero diagnostics (scope is gone).
			assert.strictEqual(
				oldFrontDiagnostics.length,
				0,
				`old-front fixtures must not be flagged anymore, got ${JSON.stringify(oldFrontDiagnostics)}`,
			);
		} finally {
			fixtures.cleanup();
		}
	});
});
