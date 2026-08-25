/**
 * Scoping matrix — verifies publy/* rules remain correctly wired and scoped
 * to apps/front (apps/old-front is gone since #1169, see #1172).
 *
 * Guarantees:
 * - Portable rules still cover apps/front source paths.
 * - Dead old-front fixtures no longer trigger their former rule.
 * - Root .oxlintrc.json pins the surviving publy/* rules at error.
 * - Plugin wiring is mutation-guarded: removing the `{ name: "anti-slop" }`
 *   jsPlugins specifier from .oxlintrc.json silences every enabled
 *   `anti-slop/*` rule, and this suite must go RED when that happens.
 */
import assert from 'node:assert/strict';
import {
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
	mkdtempSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import plugin from '../index.ts';
import { runOxlint } from '../lib/run-oxlint.ts';
import { noArrayReduce } from './no-array-reduce.ts';
import { noConsoleInSource } from './no-console-in-source.ts';
import { noDirectDayjsInComponents } from './no-direct-dayjs-in-components.ts';
import { noIife } from './no-iife.ts';
import { noManualResponseMessageTranslation } from './no-manual-response-message-translation.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const WORKSPACE_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const OXLINTRC_PATH = fileURLToPath(
	new URL('../../../../.oxlintrc.json', import.meta.url),
);

const ROOT_RULES = JSON.parse(readFileSync(OXLINTRC_PATH, 'utf8')).rules;

const PUBLY_RULES = [
	'no-never-any-casts',
	'no-array-reduce',
	'no-console-in-source',
	'no-direct-dayjs-in-components',
	'no-iife',
	'no-manual-response-message-translation',
];

const FRONT_PORTABLE_RULE_CODES = [
	'publy(no-array-reduce)',
	'publy(no-console-in-source)',
	'publy(no-direct-dayjs-in-components)',
	'publy(no-iife)',
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
		ruleName: 'no-iife',
		rule: noIife,
		valid: [
			{
				code: 'function boot() { return 1; }\nboot();',
				filename: 'apps/front/src/lib/boot.ts',
			},
		],
		invalid: [
			{
				code: 'export const ready = (() => true)();',
				filename: 'apps/front/src/routes/index.tsx',
				errors: [{ messageId: 'noIife' }],
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

const createScopingFixtures = () => {
	mkdirSync(join(WORKSPACE_ROOT, '.tmp'), { recursive: true });
	const tempRoot = mkdtempSync(join(WORKSPACE_ROOT, '.tmp', 'lint-scoping-'));
	const frontComponentsDir = join(tempRoot, 'apps/front/src/components');
	const oldFrontComponentsDir = join(tempRoot, 'apps/old-front/src/components');

	mkdirSync(frontComponentsDir, { recursive: true });
	mkdirSync(oldFrontComponentsDir, { recursive: true });

	const frontIifePath = join(frontComponentsDir, 'front-iife.tsx');
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

	writeFileSync(frontIifePath, 'export const ready = (() => true)();\n');
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
		frontIifePath,
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
				fixtures.frontIifePath,
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

	describe('anti-slop plugin wiring (mutation guard)', () => {
		it('reports an enabled anti-slop rule while its jsPlugins specifier is wired, and only then', () => {
			const config = JSON.parse(readFileSync(OXLINTRC_PATH, 'utf8')) as {
				jsPlugins: unknown[];
			};
			const antiSlopEntryIndex = config.jsPlugins.findIndex(
				(entry) =>
					typeof entry === 'object' &&
					entry !== null &&
					(entry as { name?: unknown }).name === 'anti-slop',
			);

			// Fail BEFORE any temp file/dir is created so a missing entry
			// cannot leave residue behind.
			assert.notStrictEqual(
				antiSlopEntryIndex,
				-1,
				'.oxlintrc.json must carry the { name: "anti-slop" } jsPlugins entry — without it every enabled anti-slop/* rule silently stops reporting',
			);

			const fixtureDir = mkdtempSync(
				join(WORKSPACE_ROOT, '.tmp', 'anti-slop-wiring-'),
			);
			const violationPath = join(fixtureDir, 'reflect-get-violation.ts');
			writeFileSync(
				violationPath,
				"export const value = Reflect.get({ a: 1 }, 'a');\n",
			);

			// Control = byte-equivalent config; mutant = same config with the
			// anti-slop jsPlugins entry spliced out. Both copies live at the
			// workspace root so their relative jsPlugins specifiers resolve
			// exactly like the real config's do.
			const mutant = structuredClone(config);
			mutant.jsPlugins.splice(antiSlopEntryIndex, 1);

			const controlConfigPath = join(
				WORKSPACE_ROOT,
				'.oxlintrc.wiring-control.tmp.json',
			);
			const mutantConfigPath = join(
				WORKSPACE_ROOT,
				'.oxlintrc.wiring-mutant.tmp.json',
			);
			writeFileSync(controlConfigPath, JSON.stringify(config, null, '\t'));
			writeFileSync(mutantConfigPath, JSON.stringify(mutant, null, '\t'));

			try {
				const wiredDiagnostics = runOxlint([violationPath], {
					oxlintrcPath: controlConfigPath,
				}).diagnostics as Array<{ code?: string }>;

				const wiredCodes = wiredDiagnostics.map((diag) => diag.code ?? '');
				assert.ok(
					wiredCodes.includes('anti-slop(no-reflect-get)'),
					`enabled anti-slop rule must report while its specifier is wired, got ${JSON.stringify(wiredCodes)}`,
				);

				// Mutant leg: oxlint either rejects the config outright
				// ("Plugin 'anti-slop' not found" — the enabled anti-slop/*
				// rules reference a plugin that is no longer loaded) or loads
				// without the plugin and stays silent. Both outcomes prove the
				// specifier is load-bearing; only a clean run WITH anti-slop
				// diagnostics would be a miss.
				let mutantRejectedConfig = false;
				let unwiredDiagnostics: Array<{ code?: string }> = [];

				try {
					unwiredDiagnostics = runOxlint([violationPath], {
						oxlintrcPath: mutantConfigPath,
					}).diagnostics as Array<{ code?: string }>;
				} catch {
					mutantRejectedConfig = true;
				}

				if (mutantRejectedConfig) {
					assert.ok(
						true,
						'removing the jsPlugins specifier makes oxlint reject the config outright (enabled anti-slop/* rules lose their plugin)',
					);
				} else {
					const unwiredAntiSlopCodes = unwiredDiagnostics
						.map((diag) => diag.code ?? '')
						.filter((code) => code.startsWith('anti-slop('));

					assert.deepStrictEqual(
						unwiredAntiSlopCodes,
						[],
						'removing the anti-slop jsPlugins specifier must silence enabled anti-slop/* rules',
					);
				}
			} finally {
				rmSync(controlConfigPath, { force: true });
				rmSync(mutantConfigPath, { force: true });
				rmSync(fixtureDir, { force: true, recursive: true });
			}
		});
	});
});
