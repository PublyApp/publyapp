import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import process from 'node:process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';

// Builds the e2e compose stack's images and publishes them: push to GHCR on a
// same-repo run, or save them as tarballs for the fork upload artifact.
//
// Formerly the `run:` block of ci.yml::e2e-build::Build and push e2e images:
// a `compose_files` array, an `if` adding the fork overlay, an `if/else` between
// `docker compose push` and a `for service … docker save | gzip` loop
// (docs/guides/languages.md: logic, so it is a script).

const baseCompose = 'apps/front/docker-compose.test.yml';
const forkOverlay = 'apps/front/docker-compose.fork-overlay.yml';
const artifactDirectory = '/tmp/e2e-images';

/** Services whose images the e2e jobs pull or load. */
export const IMAGE_SERVICES = ['migrate', 'api', 'request-counter', 'front'];

/** The `-f …` arguments `docker compose` gets for this run. */
export const composeFileArgs = (fork: boolean): string[] => [
	'-f',
	baseCompose,
	...(fork ? ['-f', forkOverlay] : []),
];

/** The GHCR reference for one service, matching the compose file's naming. */
export const imageReference = (
	namespace: string,
	tag: string,
	service: string,
): string => `${namespace}-${service}:${tag}`;

const requiredEnvironment = (name: string): string => {
	const value = process.env[name];

	if (value === undefined || value === '') {
		throw new Error(
			`${name} is not set — the e2e image build cannot name its images.`,
		);
	}

	return value;
};

const dockerCompose = (composeFiles: string[], args: string[]) => {
	const result = spawnSync('docker', ['compose', ...composeFiles, ...args], {
		stdio: 'inherit',
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
};

const saveImage = async (reference: string, target: string) => {
	const docker = spawn('docker', ['save', reference], {
		stdio: ['ignore', 'pipe', 'inherit'],
	});
	const exit = new Promise<number>((resolve) => {
		docker.on('close', (code) => resolve(code ?? 1));
	});

	await pipeline(docker.stdout, createGzip(), createWriteStream(target));

	const code = await exit;

	if (code !== 0) {
		throw new Error(`docker save ${reference} failed with exit ${code}`);
	}
};

const run = async () => {
	const fork = process.env.E2E_FORK === 'true';
	const namespace = requiredEnvironment('E2E_IMAGE_NS');
	const tag = requiredEnvironment('E2E_IMAGE_TAG');
	const composeFiles = composeFileArgs(fork);

	dockerCompose(composeFiles, ['build']);

	if (!fork) {
		dockerCompose(['-f', baseCompose], ['push', ...IMAGE_SERVICES]);

		return;
	}

	mkdirSync(artifactDirectory, { recursive: true });

	for (const service of IMAGE_SERVICES) {
		await saveImage(
			imageReference(namespace, tag, service),
			`${artifactDirectory}/${service}.tar.gz`,
		);
	}
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await run();
}
