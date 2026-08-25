import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testFile = fileURLToPath(
	new URL('./check-design-system.test.mts', import.meta.url),
);
const env: NodeJS.ProcessEnv = {
	...process.env,
	FRONT2_DESIGN_GUARD_RUNNER_PROBE: '1',
};
delete env.NODE_TEST_CONTEXT;
const child = spawn(
	process.execPath,
	['--test', '--test-name-pattern', 'runner interruption probe', testFile],
	{
		cwd: path.dirname(testFile),
		env,
		stdio: ['ignore', 'pipe', 'pipe'],
	},
);
process.stdout.write(`RUNNER_PID=${child.pid}\n`);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.once('exit', (code) => process.exit(code ?? 1));
