/**
 * End-to-end test for `prune-runtime-deps.ts` on a throwaway deploy dir.
 *
 * The script is a build-time CLI with top-level side effects, so the honest
 * test is to run it against a real (fake) pnpm deploy tree and look at what
 * survived — importing it would execute the prune in the test process.
 *
 * The fixture pins the cases that decide whether a package is kept:
 * imported by `server.ts` (bare, scoped, and via a subpath), imported only by
 * a `dist/server` chunk, reached transitively from a kept package, and never
 * imported at all. It also pins that `dist/**` source maps are stripped, that
 * pnpm's hoisted `.pnpm/node_modules` directory survives with only its
 * dangling links removed, and that an unresolvable or empty closure fails the
 * build instead of shipping an empty tree.
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

/** Runs the prune; `status` is 0 on success, the exit code when it refuses. */
const run = (appDir: string) => {
	try {
		execFileSync(process.execPath, [script, appDir], { stdio: 'pipe' });
		return { status: 0, stderr: '' };
	} catch (error) {
		const failure = error as { status?: number; stderr?: Buffer };
		return {
			status: failure.status ?? -1,
			stderr: String(failure.stderr ?? ''),
		};
	}
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
		// pnpm names a scoped entry `<scope>+<name>@<version>`.
		const scoped = storePackage(appDir, '@scope+pkg@1.0.0', '@scope/pkg');
		const subpath = storePackage(appDir, 'subpath-pkg@1.0.0', 'subpath-pkg');

		const modulesDir = path.join(appDir, 'node_modules');
		link(usedDirect, path.join(modulesDir, 'used-direct'));
		link(usedChunk, path.join(modulesDir, 'used-chunk'));
		link(unused, path.join(modulesDir, 'unused'));
		link(scoped, path.join(modulesDir, '@scope', 'pkg'));
		link(subpath, path.join(modulesDir, 'subpath-pkg'));
		// pnpm links a package's own dependencies as siblings inside its store
		// entry; that is the edge the closure walk follows.
		link(transitive, path.join(path.dirname(usedDirect), 'transitive'));

		// pnpm's hoisted resolution fallback: symlinks to packages that a kept
		// package may reach without a store-entry sibling. Not a package, so it
		// must survive — only the links that dangle after the prune go.
		const hoistedDir = path.join(modulesDir, '.pnpm', 'node_modules');
		link(usedDirect, path.join(hoistedDir, 'used-direct'));
		link(unused, path.join(hoistedDir, 'unused'));

		write(
			path.join(appDir, 'server.ts'),
			"import { a } from 'used-direct';\n" +
				"import { s } from '@scope/pkg';\n" +
				"import { t } from 'subpath-pkg/static';\n" +
				"import { b } from 'node:fs';\n",
		);
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

		expect(run(appDir).status).toBe(0);

		const storeDir = path.join(modulesDir, '.pnpm');
		const storeEntry = (entry: string): boolean =>
			fs.existsSync(path.join(storeDir, entry));

		expect(storeEntry('used-direct@1.0.0')).toBe(true);
		expect(storeEntry('used-chunk@1.0.0')).toBe(true);
		expect(storeEntry('transitive@1.0.0')).toBe(true);
		expect(storeEntry('@scope+pkg@1.0.0')).toBe(true);
		expect(storeEntry('subpath-pkg@1.0.0')).toBe(true);
		expect(storeEntry('unused@1.0.0')).toBe(false);

		// The dangling top-level link is removed too, not just its store entry.
		expect(
			fs.lstatSync(path.join(modulesDir, 'unused'), { throwIfNoEntry: false }),
		).toBeUndefined();
		expect(fs.existsSync(path.join(modulesDir, '@scope', 'pkg'))).toBe(true);

		// The hoisted directory itself and the links that still resolve stay.
		expect(fs.existsSync(hoistedDir)).toBe(true);
		expect(fs.existsSync(path.join(hoistedDir, 'used-direct'))).toBe(true);
		expect(
			fs.lstatSync(path.join(hoistedDir, 'unused'), {
				throwIfNoEntry: false,
			}),
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

test('the prune refuses an unresolvable root or an empty closure, without deleting anything', () => {
	const unresolvedDir = fs.mkdtempSync(
		path.join(os.tmpdir(), 'prune-unresolved-'),
	);
	const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-empty-'));

	try {
		for (const [appDir, serverTs] of [
			[unresolvedDir, "import { x } from 'no-such-package';\n"],
			[emptyDir, "import './local.js';\n"],
		] as const) {
			const survivor = storePackage(appDir, 'survivor@1.0.0', 'survivor');
			link(survivor, path.join(appDir, 'node_modules', 'survivor'));
			write(path.join(appDir, 'server.ts'), serverTs);
			write(
				path.join(appDir, 'dist', 'server', 'assets', 'chunk-abc.js'),
				'export {};\n',
			);
		}

		const unresolved = run(unresolvedDir);
		expect(unresolved.status).toBe(1);
		expect(unresolved.stderr).toContain('no-such-package');

		const empty = run(emptyDir);
		expect(empty.status).toBe(1);
		expect(empty.stderr).toContain('Refusing to ship an empty');

		// Refusing means refusing before the delete loop.
		for (const appDir of [unresolvedDir, emptyDir]) {
			expect(
				fs.existsSync(
					path.join(appDir, 'node_modules', '.pnpm', 'survivor@1.0.0'),
				),
			).toBe(true);
		}
	} finally {
		fs.rmSync(unresolvedDir, { recursive: true, force: true });
		fs.rmSync(emptyDir, { recursive: true, force: true });
	}
});
