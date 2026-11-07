import { spawn } from 'node:child_process';
import { createReadStream, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

// Loads the fork run's e2e images from the tarballs the download-artifact step
// unpacked.
//
// Formerly the `run:` block of ci.yml::e2e-smoke|e2e-test::Load fork e2e images:
// `for tarball in /tmp/e2e-images/*.tar.gz; do gunzip -c "$tarball" | docker load; done`
// (docs/guides/languages.md: a loop is logic, so it is a script).

const defaultDirectory = '/tmp/e2e-images';

/** The tarballs to load, in a stable order so failures name the same file. */
export const imageTarballs = (directory: string = defaultDirectory): string[] =>
	readdirSync(directory)
		.filter((entry) => entry.endsWith('.tar.gz'))
		.sort()
		.map((entry) => path.join(directory, entry));

const loadTarball = async (tarball: string) => {
	const docker = spawn('docker', ['load'], {
		stdio: ['pipe', 'inherit', 'inherit'],
	});
	const exit = new Promise<number>((resolve) => {
		docker.on('close', (code) => resolve(code ?? 1));
	});

	await pipeline(createReadStream(tarball), createGunzip(), docker.stdin);

	const code = await exit;

	if (code !== 0) {
		throw new Error(`docker load < ${tarball} failed with exit ${code}`);
	}
};

const run = async () => {
	const tarballs = imageTarballs();

	if (tarballs.length === 0) {
		console.error(`no e2e image tarballs in ${defaultDirectory}`);
		process.exit(1);
	}

	for (const tarball of tarballs) {
		await loadTarball(tarball);
	}
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await run();
}
