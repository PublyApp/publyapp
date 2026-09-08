import { readFileSync } from 'node:fs';
import process from 'node:process';

export type NonVitestCommand = {
	id: number;
	argv: string[];
};

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const command = (id: number, argv: string[]): NonVitestCommand => ({
	id,
	argv,
});

type FrontPackage = {
	ciNonVitestCommandInventory?: unknown;
};

const frontPackage = JSON.parse(
	readFileSync(
		new URL('../../../apps/front/package.json', import.meta.url),
		'utf8',
	),
) as FrontPackage;

if (!Array.isArray(frontPackage.ciNonVitestCommandInventory)) {
	throw new Error(
		'apps/front/package.json must define ciNonVitestCommandInventory',
	);
}

const packageInventory = frontPackage.ciNonVitestCommandInventory;
const packageCommand = (value: unknown, index: number): NonVitestCommand => {
	if (
		!Array.isArray(value) ||
		value.length === 0 ||
		!value.every((part): part is string => typeof part === 'string')
	) {
		throw new Error(
			`apps/front/package.json has malformed non-Vitest command ${index + 1}`,
		);
	}
	const [file, ...args] = value;
	return command(index + 1, [file === 'pnpm' ? pnpm : file, ...args]);
};

export const NON_VITEST_COMMAND_COUNT = 32;
export const NON_VITEST_COMMANDS = packageInventory.map(packageCommand);

export const validateNonVitestManifest = (
	commands: NonVitestCommand[],
): void => {
	if (commands.length !== NON_VITEST_COMMAND_COUNT) {
		throw new Error(
			'non-Vitest command manifest must contain exactly 32 commands',
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
