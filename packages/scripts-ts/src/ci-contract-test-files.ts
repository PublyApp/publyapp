import { existsSync, statSync } from 'node:fs';

export const CI_CONTRACT_TEST_FILES = [
	'src/check-ci-gate-structure.test.ts',
	'src/ci-gate-aggregation.test.ts',
	'src/ci-gate-bootstrap.test.ts',
	'src/ci-artifact-contract.test.ts',
	'src/ci-lane-result.test.ts',
	'src/ci-pr-snapshot.test.ts',
	'src/ci-central-workflow.test.ts',
] as const;

export const validateCiContractTestFiles = (rootDir: string): string[] =>
	CI_CONTRACT_TEST_FILES.filter((file) => {
		const path = `${rootDir}/packages/scripts-ts/${file}`;
		return !existsSync(path) || !statSync(path).isFile();
	});
