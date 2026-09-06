import process from 'node:process';

export type NonVitestCommand = {
	id: number;
	argv: string[];
};

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const command = (id: number, ...argv: string[]): NonVitestCommand => ({
	id,
	argv,
});

export const NON_VITEST_COMMANDS: NonVitestCommand[] = [
	command(1, pnpm, 'check:guard-coverage'),
	command(
		2,
		'node',
		'scripts/run-guarded.mts',
		'--test',
		'scripts/ci/compose-startup.test.mts',
	),
	command(3, pnpm, 'test:e2e-compose-env'),
	command(4, pnpm, 'test:route-tree-guard'),
	command(5, pnpm, 'test:design-guards'),
	command(6, pnpm, 'test:request-counter'),
	command(7, pnpm, 'test:search-cancel-css'),
	command(8, pnpm, 'test:context-chunk-isolation'),
	command(9, pnpm, 'test:simplebar-upstream-css'),
	command(10, pnpm, 'test:design-system-guard'),
	command(11, pnpm, 'test:zindex-guard'),
	command(12, pnpm, 'test:react-compiler-guard'),
	command(13, pnpm, 'test:shared-ts-import-paths'),
	command(14, pnpm, 'test:e2e-shared-constants-guard'),
	command(15, pnpm, 'test:column-type-imports-guard'),
	command(16, pnpm, 'test:server-static-imports-guard'),
	command(17, pnpm, 'test:font-bundle'),
	command(18, pnpm, 'test:shared-ts-node-resolution'),
	command(19, pnpm, 'check:design-system'),
	command(20, pnpm, 'check:zindex'),
	command(21, pnpm, 'check:react-compiler'),
	command(22, pnpm, 'check:shared-ts-import-paths'),
	command(23, pnpm, 'check:shared-ts-node-resolution'),
	command(24, pnpm, 'check:e2e-shared-constants'),
	command(25, pnpm, 'test:typecheck-coverage-guard'),
	command(26, pnpm, 'test:guard-coverage-guard'),
	command(27, pnpm, 'check:column-type-imports'),
	command(28, pnpm, 'check:server-static-imports'),
	command(29, pnpm, 'test:runtime-env-startup'),
	command(30, pnpm, 'test:front-runtime-image-guard'),
];

export const validateNonVitestManifest = (
	commands: NonVitestCommand[],
): void => {
	if (commands.length !== NON_VITEST_COMMANDS.length) {
		throw new Error(
			'non-Vitest command manifest must contain exactly 30 commands',
		);
	}
	for (const [index, expected] of NON_VITEST_COMMANDS.entries()) {
		const actual = commands[index];
		if (
			actual === undefined ||
			actual.id !== expected.id ||
			JSON.stringify(actual.argv) !== JSON.stringify(expected.argv)
		) {
			throw new Error(
				`non-Vitest command manifest differs at command ${expected.id}`,
			);
		}
	}
};

validateNonVitestManifest(NON_VITEST_COMMANDS);
