import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Waits for every service of the e2e compose stack to be running, with a
// healthcheck that is either absent or healthy.
//
// Formerly the `run:` block of ci.yml::e2e-smoke|e2e-test::Wait for e2e stack
// health: `timeout 180 bash -lc '…'` wrapping a 90-attempt loop over six
// services, two `docker inspect --format` shapes per service, and a `sleep 2`
// (docs/guides/languages.md: loops and conditions are logic, so it is a script).

const composeFile = 'apps/front/docker-compose.test.yml';
const attempts = 90;
const intervalMilliseconds = 2000;
// The step used to run under `timeout 180`, so the whole wait — not just the
// attempt count — is bounded, and no single docker call may hang it.
const totalMilliseconds = 180_000;
const dockerCallMilliseconds = 10_000;

/**
 * Every service the stack must bring up before Playwright runs. Kept as one
 * space-separated literal because the gate structure guard pins that exact
 * string (it used to live in the step's `bash -lc` here-doc).
 */
export const SERVICE_LIST =
	'front api request-counter traefik toxiproxy postgres';

export const SERVICES: readonly string[] = SERVICE_LIST.split(' ');

/**
 * One container is ready when it is running and its healthcheck — if it has one
 * — reports healthy. `no-healthcheck` comes from the inspect format below.
 */
export const containerIsReady = (state: string, health: string): boolean =>
	state === 'running' && (health === 'healthy' || health === 'no-healthcheck');

const compose = (args: string[]) =>
	spawnSync('docker', ['compose', '-f', composeFile, ...args], {
		encoding: 'utf8',
		timeout: dockerCallMilliseconds,
	});

const inspect = (container: string, format: string) =>
	spawnSync('docker', ['inspect', '--format', format, container], {
		encoding: 'utf8',
		timeout: dockerCallMilliseconds,
	});

const serviceIsReady = (service: string): boolean => {
	const container = compose(['ps', '-q', service]).stdout.trim();

	if (container === '') {
		return false;
	}

	const state = inspect(container, '{{.State.Status}}').stdout.trim();
	const health = inspect(
		container,
		'{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}',
	).stdout.trim();

	return containerIsReady(state, health);
};

const sleep = (milliseconds: number) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

const run = async () => {
	const deadline = Date.now() + totalMilliseconds;

	for (let attempt = 1; attempt <= attempts; attempt++) {
		if (SERVICES.every(serviceIsReady)) {
			return;
		}

		if (Date.now() + intervalMilliseconds > deadline) {
			break;
		}

		await sleep(intervalMilliseconds);
	}

	console.error(
		`e2e stack was not healthy after ${(attempts * intervalMilliseconds) / 1000}s`,
	);
	process.exit(1);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await run();
}
