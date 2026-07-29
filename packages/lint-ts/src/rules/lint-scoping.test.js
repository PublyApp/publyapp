/**
 * Scoping matrix for M0.6 rule rollout.
 *
 * This test ensures:
 * - Portable rules apply to both `apps/old-front` and `apps/front`.
 * - MUI-specific rules remain scoped to `apps/old-front` only.
 * - Root `.oxlintrc.json` keeps the relevant `publy/*` rules at `error`.
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
import { basename, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { RuleTester } from 'oxlint/plugins-dev';

import plugin from '../index.js';
import { noArrayReduce } from './no-array-reduce.js';
import { noConsoleInSource } from './no-console-in-source.js';
import { noDirectDayjsInComponents } from './no-direct-dayjs-in-components.js';
import { noManualResponseMessageTranslation } from './no-manual-response-message-translation.js';
import { noNativeHtmlInMuiSurfaces } from './no-native-html-in-mui-surfaces.js';
import { noRawImgInProductSurfaces } from './no-raw-img-in-product-surfaces.js';
import { noRawMuiTextfieldRegister } from './no-raw-mui-textfield-register.js';

RuleTester.describe = describe;
RuleTester.it = it;

const WORKSPACE_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const OXLINTRC_PATH = fileURLToPath(
	new URL('../../../../.oxlintrc.json', import.meta.url),
);
const OXLINT_BIN = fileURLToPath(
	new URL('../../../../node_modules/oxlint/bin/oxlint', import.meta.url),
);

const ROOT_RULES = JSON.parse(readFileSync(OXLINTRC_PATH, 'utf8')).rules;

const M0_6_PUBLY_RULES = [
	'no-array-reduce',
	'no-console-in-source',
	'no-direct-dayjs-in-components',
	'no-manual-response-message-translation',
	'no-native-html-in-mui-surfaces',
	'no-raw-img-in-product-surfaces',
	'no-raw-mui-textfield-register',
];
const FRONT_SCOPED_MUI_RULE_CODES = [
	'publy(no-native-html-in-mui-surfaces)',
	'publy(no-raw-img-in-product-surfaces)',
	'publy(no-raw-mui-textfield-register)',
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
	{
		ruleName: 'no-native-html-in-mui-surfaces',
		rule: noNativeHtmlInMuiSurfaces,
		valid: [
			{
				code: 'const Component = () => <div>front 2 escape hatch</div>;',
				filename: 'apps/front/src/components/upload-preview.tsx',
			},
		],
		invalid: [
			{
				code: 'const Component = () => <div>legacy front surface</div>;',
				filename: 'apps/old-front/src/components/upload-preview.tsx',
				errors: [{ messageId: 'div' }],
			},
		],
	},
	{
		ruleName: 'no-raw-img-in-product-surfaces',
		rule: noRawImgInProductSurfaces,
		valid: [
			{
				code: 'const Preview = () => <img alt="Front 2" src="/preview.png" />;',
				filename: 'apps/front/src/components/upload-preview.tsx',
			},
		],
		invalid: [
			{
				code: 'const Preview = () => <img alt="Front" src="/preview.png" />;',
				filename: 'apps/old-front/src/components/upload-preview.tsx',
				errors: [{ messageId: 'rawImg' }],
			},
		],
	},
	{
		ruleName: 'no-raw-mui-textfield-register',
		rule: noRawMuiTextfieldRegister,
		valid: [
			{
				code: '<TextField {...register("email")} />;',
				filename: 'apps/front/src/components/example-form.tsx',
			},
		],
		invalid: [
			{
				code: '<TextField {...register("email")} />;',
				filename: 'apps/old-front/src/components/example-form.tsx',
				errors: [{ messageId: 'raw' }],
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

	return JSON.parse(output);
};

const createScopingFixtures = () => {
	mkdirSync(join(WORKSPACE_ROOT, '.tmp'), { recursive: true });
	const tempRoot = mkdtempSync(
		join(WORKSPACE_ROOT, '.tmp', 'm0.6-lint-scoping-'),
	);
	const oldFrontComponentsDir = join(tempRoot, 'apps/old-front/src/components');
	const frontComponentsDir = join(tempRoot, 'apps/front/src/components');

	mkdirSync(oldFrontComponentsDir, { recursive: true });
	mkdirSync(frontComponentsDir, { recursive: true });

	const oldFrontNativePath = join(oldFrontComponentsDir, 'bad-native.tsx');
	const oldFrontNativeJsxPath = join(oldFrontComponentsDir, 'bad-native.jsx');
	const oldFrontImgPath = join(oldFrontComponentsDir, 'bad-img.tsx');
	const oldFrontImgJsxPath = join(oldFrontComponentsDir, 'bad-img.jsx');
	const oldFrontTextFieldPath = join(
		oldFrontComponentsDir,
		'bad-textfield.tsx',
	);
	const oldFrontTextFieldJsxPath = join(
		oldFrontComponentsDir,
		'bad-textfield.jsx',
	);
	const frontNativePath = join(frontComponentsDir, 'front-native.tsx');
	const frontNativeJsxPath = join(frontComponentsDir, 'front-native.jsx');
	const frontImgPath = join(frontComponentsDir, 'front-img.tsx');
	const frontImgJsxPath = join(frontComponentsDir, 'front-img.jsx');
	const frontTextFieldPath = join(frontComponentsDir, 'front-textfield.tsx');
	const frontTextFieldJsxPath = join(frontComponentsDir, 'front-textfield.jsx');
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

	writeFileSync(
		oldFrontNativePath,
		"import * as React from 'react';\n" +
			'export const NativeView = () => <div>legacy</div>;\n',
	);
	writeFileSync(
		oldFrontNativeJsxPath,
		"import * as React from 'react';\n" +
			'export const NativeView = () => <div>legacy jsx</div>;\n',
	);
	writeFileSync(
		oldFrontImgPath,
		"import * as React from 'react';\n" +
			"export const RawImage = () => <img alt='Preview' src='/preview.png' />;\n",
	);
	writeFileSync(
		oldFrontImgJsxPath,
		"import * as React from 'react';\n" +
			"export const RawImage = () => <img alt='Preview' src='/preview.png' />;\n",
	);
	writeFileSync(
		oldFrontTextFieldPath,
		"import * as React from 'react';\n" +
			"import { TextField } from '@mui/material';\n" +
			'const register = (name: string) => ({ name });\n' +
			"export const Field = () => <TextField {...register('email')} />;\n",
	);
	writeFileSync(
		oldFrontTextFieldJsxPath,
		"import * as React from 'react';\n" +
			"import { TextField } from '@mui/material';\n" +
			'const register = (name) => ({ name });\n' +
			"export const Field = () => <TextField {...register('email')} />;\n",
	);
	writeFileSync(
		frontNativePath,
		"import * as React from 'react';\n" +
			'export const NativeView = () => <div>front</div>;\n',
	);
	writeFileSync(
		frontNativeJsxPath,
		"import * as React from 'react';\n" +
			'export const NativeView = () => <div>front jsx</div>;\n',
	);
	writeFileSync(
		frontImgPath,
		"import * as React from 'react';\n" +
			"export const RawImage = () => <img alt='Preview' src='/preview.png' />;\n",
	);
	writeFileSync(
		frontImgJsxPath,
		"import * as React from 'react';\n" +
			"export const RawImage = () => <img alt='Preview' src='/preview.png' />;\n",
	);
	writeFileSync(
		frontTextFieldPath,
		"import * as React from 'react';\n" +
			"import { TextField } from '@mui/material';\n" +
			'const register = (name: string) => ({ name });\n' +
			"export const Field = () => <TextField {...register('email')} />;\n",
	);
	writeFileSync(
		frontTextFieldJsxPath,
		"import * as React from 'react';\n" +
			"import { TextField } from '@mui/material';\n" +
			'const register = (name) => ({ name });\n' +
			"export const Field = () => <TextField {...register('email')} />;\n",
	);
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

	return {
		oldFrontNativePath,
		oldFrontNativeJsxPath,
		oldFrontImgPath,
		oldFrontImgJsxPath,
		oldFrontTextFieldPath,
		oldFrontTextFieldJsxPath,
		frontNativePath,
		frontNativeJsxPath,
		frontImgPath,
		frontImgJsxPath,
		frontTextFieldPath,
		frontTextFieldJsxPath,
		frontConsolePath,
		frontDayjsPath,
		frontArrayReducePath,
		frontManualResponsePath,
		cleanup: () => rmSync(tempRoot, { force: true, recursive: true }),
	};
};

const uniqueSorted = (values) => Array.from(new Set(values)).sort();

describe('M0.6 rule scoping matrix', () => {
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
		for (const ruleName of M0_6_PUBLY_RULES) {
			const configValue = ROOT_RULES[`publy/${ruleName}`];

			assert.strictEqual(
				isRuleEnabledAsError(configValue),
				true,
				`publy/${ruleName} should be configured as error in .oxlintrc.json`,
			);
		}
	});

	it('verifies apps/old-front remains protected while apps/front is not scoped by MUI rules', () => {
		const fixtures = createScopingFixtures();

		try {
			const oldFrontDiagnostics = runOxlint([
				fixtures.oldFrontNativePath,
				fixtures.oldFrontNativeJsxPath,
				fixtures.oldFrontImgPath,
				fixtures.oldFrontImgJsxPath,
				fixtures.oldFrontTextFieldPath,
				fixtures.oldFrontTextFieldJsxPath,
			]).diagnostics;
			const frontDiagnostics = runOxlint([
				fixtures.frontNativePath,
				fixtures.frontNativeJsxPath,
				fixtures.frontImgPath,
				fixtures.frontImgJsxPath,
				fixtures.frontTextFieldPath,
				fixtures.frontTextFieldJsxPath,
				fixtures.frontConsolePath,
				fixtures.frontDayjsPath,
				fixtures.frontArrayReducePath,
				fixtures.frontManualResponsePath,
			]).diagnostics;

			const hasDiagnosticForPath = (diagnostics, ruleCode, filePath) =>
				diagnostics.some(
					(diag) =>
						diag.code === ruleCode &&
						typeof diag.filename === 'string' &&
						(pathBasename(diag.filename) === basename(filePath) ||
							pathIncludes(diag.filename, filePath)),
				);

			const pathBasename = (filePath) =>
				basename(filePath.replaceAll('\\', '/'));

			const pathIncludes = (haystack, needle) => {
				const normalizedHaystack = haystack.replaceAll('\\', '/');
				const normalizedNeedle = needle.replaceAll('\\', '/');

				return (
					normalizedHaystack === normalizedNeedle ||
					normalizedHaystack.endsWith(normalizedNeedle)
				);
			};

			const oldFrontDiagnosticCodes = new Set(
				oldFrontDiagnostics.map((diag) => diag.code),
			);
			const frontDiagnosticCodes = new Set(
				frontDiagnostics.map((diag) => diag.code),
			);

			for (const ruleCode of FRONT_SCOPED_MUI_RULE_CODES) {
				assert.ok(
					oldFrontDiagnosticCodes.has(ruleCode),
					`${ruleCode} should report in apps/old-front`,
				);
				assert.ok(
					!frontDiagnosticCodes.has(ruleCode),
					`${ruleCode} should not report in apps/front`,
				);
			}

			assert.ok(
				hasDiagnosticForPath(
					oldFrontDiagnostics,
					'publy(no-native-html-in-mui-surfaces)',
					fixtures.oldFrontNativePath,
				),
				'no-native-html-in-mui-surfaces should fire in apps/old-front .tsx',
			);
			assert.ok(
				hasDiagnosticForPath(
					oldFrontDiagnostics,
					'publy(no-native-html-in-mui-surfaces)',
					fixtures.oldFrontNativeJsxPath,
				),
				'no-native-html-in-mui-surfaces should fire in apps/old-front .jsx',
			);
			assert.ok(
				!hasDiagnosticForPath(
					frontDiagnostics,
					'publy(no-native-html-in-mui-surfaces)',
					fixtures.frontNativePath,
				),
				'no-native-html-in-mui-surfaces should not fire in front .tsx',
			);
			assert.ok(
				!hasDiagnosticForPath(
					frontDiagnostics,
					'publy(no-native-html-in-mui-surfaces)',
					fixtures.frontNativeJsxPath,
				),
				'no-native-html-in-mui-surfaces should not fire in front .jsx',
			);
			assert.ok(
				hasDiagnosticForPath(
					oldFrontDiagnostics,
					'publy(no-raw-img-in-product-surfaces)',
					fixtures.oldFrontImgPath,
				),
				'no-raw-img-in-product-surfaces should fire in apps/old-front .tsx',
			);
			assert.ok(
				hasDiagnosticForPath(
					oldFrontDiagnostics,
					'publy(no-raw-img-in-product-surfaces)',
					fixtures.oldFrontImgJsxPath,
				),
				'no-raw-img-in-product-surfaces should fire in apps/old-front .jsx',
			);
			assert.ok(
				!hasDiagnosticForPath(
					frontDiagnostics,
					'publy(no-raw-img-in-product-surfaces)',
					fixtures.frontImgPath,
				),
				'no-raw-img-in-product-surfaces should not fire in front .tsx',
			);
			assert.ok(
				!hasDiagnosticForPath(
					frontDiagnostics,
					'publy(no-raw-img-in-product-surfaces)',
					fixtures.frontImgJsxPath,
				),
				'no-raw-img-in-product-surfaces should not fire in front .jsx',
			);
			assert.ok(
				hasDiagnosticForPath(
					oldFrontDiagnostics,
					'publy(no-raw-mui-textfield-register)',
					fixtures.oldFrontTextFieldPath,
				),
				'no-raw-mui-textfield-register should fire in apps/old-front .tsx',
			);
			assert.ok(
				hasDiagnosticForPath(
					oldFrontDiagnostics,
					'publy(no-raw-mui-textfield-register)',
					fixtures.oldFrontTextFieldJsxPath,
				),
				'no-raw-mui-textfield-register should fire in apps/old-front .jsx',
			);
			assert.ok(
				!hasDiagnosticForPath(
					frontDiagnostics,
					'publy(no-raw-mui-textfield-register)',
					fixtures.frontTextFieldPath,
				),
				'no-raw-mui-textfield-register should not fire in front .tsx',
			);
			assert.ok(
				!hasDiagnosticForPath(
					frontDiagnostics,
					'publy(no-raw-mui-textfield-register)',
					fixtures.frontTextFieldJsxPath,
				),
				'no-raw-mui-textfield-register should not fire in front .jsx',
			);

			const frontDiagnosticsCodes = frontDiagnostics.map((diag) => diag.code);
			assert.deepStrictEqual(
				uniqueSorted(frontDiagnosticsCodes),
				FRONT_PORTABLE_RULE_CODES.slice().sort(),
				'front apps should report exactly the expected portable violations',
			);
		} finally {
			fixtures.cleanup();
		}
	});
});
