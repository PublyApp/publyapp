/**
 * End-to-end test for `prune-runtime-deps.ts` on a throwaway deploy dir.
 *
 * The script is a build-time CLI with top-level side effects, so the honest
 * test is to run it against a real (fake) pnpm deploy tree and look at what
 * survived — importing it would execute the prune in the test process.
 *
 * The fixture pins the four cases that decide whether a package is kept:
 * imported by `server.ts`, imported only by a `dist/server` chunk, reached
 * transitively from a kept package, and never imported at all. It also pins
 * that `dist/**` source maps are stripped.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

const script = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'prune-runtime-deps.ts',
);

const write = (file: string, content: string): void => {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
};

/** Creates `<appDir>/node_modules/.pnpm/<entry>/node_modules/<name>`. */
const storePackage = (
	appDir: string,
	entry: string,
	name: string,
	manifest: Record<string, unknown> = {},
): string => {
	const dir = path.join(
		appDir,
		'node_modules',
		'.pnpm',
		entry,
		'node_modules',
		name,
	);
	write(path.join(dir, 'package.json'), JSON.stringify({ name, ...manifest }));
	write(path.join(dir, 'index.js'), '');
	return dir;
};

const link = (target: string, linkPath: string): void => {
	fs.mkdirSync(path.dirname(linkPath), { recursive: true });
	fs.symlinkSync(target, linkPath, 'dir');
};

test('the prune keeps the runtime closure and drops unused packages and source maps', () => {
	const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-runtime-deps-'));

	try {
		const usedDirect = storePackage(
			appDir,
			'used-direct@1.0.0',
			'used-direct',
			{
				dependencies: { transitive: '1.0.0' },
			},
		);
		const usedChunk = storePackage(appDir, 'used-chunk@1.0.0', 'used-chunk');
		const transitive = storePackage(appDir, 'transitive@1.0.0', 'transitive');
		const unused = storePackage(appDir, 'unused@1.0.0', 'unused');

		const modulesDir = path.join(appDir, 'node_modules');
		link(usedDirect, path.join(modulesDir, 'used-direct'));
		link(usedChunk, path.join(modulesDir, 'used-chunk'));
		link(unused, path.join(modulesDir, 'unused'));
		// pnpm links a package's own dependencies as siblings inside its store
		// entry; that is the edge the closure walk follows.
		link(transitive, path.join(path.dirname(usedDirect), 'transitive'));

		write(path.join(appDir, 'server.ts'), "import { a } from 'used-direct';\n");
		write(
			path.join(appDir, 'dist', 'server', 'assets', 'chunk-abc.js'),
			"import { c } from 'used-chunk';\n",
		);
		const sourceMap = path.join(
			appDir,
			'dist',
			'server',
			'assets',
			'chunk-abc.js.map',
		);
		write(sourceMap, '{}');

		execFileSync(process.execPath, [script, appDir], { stdio: 'pipe' });

		const storeDir = path.join(modulesDir, '.pnpm');
		const storeEntry = (entry: string): boolean =>
			fs.existsSync(path.join(storeDir, entry));

		expect(storeEntry('used-direct@1.0.0')).toBe(true);
		expect(storeEntry('used-chunk@1.0.0')).toBe(true);
		expect(storeEntry('transitive@1.0.0')).toBe(true);
		expect(storeEntry('unused@1.0.0')).toBe(false);

		// The dangling top-level link is removed too, not just its store entry.
		expect(
			fs.lstatSync(path.join(modulesDir, 'unused'), { throwIfNoEntry: false }),
		).toBeUndefined();
		expect(fs.existsSync(sourceMap)).toBe(false);
		expect(
			fs.existsSync(
				path.join(appDir, 'dist', 'server', 'assets', 'chunk-abc.js'),
			),
		).toBe(true);
	} finally {
		fs.rmSync(appDir, { recursive: true, force: true });
	}
});
