import { spawnSync } from 'node:child_process';
import process from 'node:process';

import {
	CI_CONTRACT_TEST_FILES,
	validateCiContractTestFiles,
} from './ci-contract-test-files.ts';

const missing = validateCiContractTestFiles(process.cwd());
if (missing.length > 0) {
	console.error(
		`CI contract test authority is incomplete; missing or unresolved files: ${missing.join(', ')}`,
	);
	process.exit(1);
}

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(
	command,
	[
		'--filter',
		'scripts-ts',
		'exec',
		'vitest',
		'run',
		...CI_CONTRACT_TEST_FILES,
	],
	{ stdio: 'inherit' },
);

if (result.error !== undefined) {
	throw result.error;
}
process.exit(result.status ?? 1);
