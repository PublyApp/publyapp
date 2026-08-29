/**
 * Paired proof for the Node-ESM resolution guard (#1868).
 *
 * The guard exists to stop `packages/shared-ts/src/utils/retry-fn.ts` ever
 * again importing a sibling module without the real file extension. That
 * spelling resolves under bundlers and vitest but throws ERR_MODULE_NOT_FOUND
 * under `node --experimental-strip-types` — the runtime CI uses for the `.mts`
 * scripts under `apps/front/scripts` — so the defect only surfaces at the
 * first raw Node-ESM caller.
 *
 * These tests recreate the regression against a COPY of the REAL shared-ts
 * tree (cpSync, so the artifact content is the real source), rewrite the
 * single import line of `retry-fn.ts` in the copy, run the guard against it,
 * and assert it is RED. Restoring the `.ts` suffix must make it GREEN again.
 * A third test deletes the imported sibling file while leaving the import line
 * text untouched: the guard must still go RED, proving it resolves the real
 * module graph and does not scan the import line's text.
 *
 * NOTE ON `no-floating-promises`: this file uses `node:test` (not vitest).
 * `node:test`'s runner captures test outcomes via its async-context mechanism,
 * independent of the returned Promise. The `typescript(no-floating-promises)`
 * rule flags `test()` as returning `Promise<void>` per `@types/node` 26.x, but
 * in the `node:test` execution model that Promise is fire-and-forget — the
 * runner does not depend on the caller awaiting it. We therefore prefix each
 * `test()` call with `void` (a targeted, per-call suppression) rather than
 * disabling the rule for the entire file. Same convention as
 * `check-shared-ts-import-paths.test.mts`.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveRetryFnViaNode } from './check-shared-ts-node-resolution.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const realSharedTsSrc = path.resolve(
	here,
	'../../../../packages/shared-ts/src',
);

const sandboxes: string[] = [];

after(() => {
	for (const dir of sandboxes) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const makeSandbox = (): string => {
	const dir = mkdtempSync(path.join(tmpdir(), 'shared-ts-node-resolution-'));
	sandboxes.push(dir);
	// Mirror the REAL shared-ts tree into the sandbox so the guard resolves
	// the real artifact content without touching the source under test.
	cpSync(realSharedTsSrc, dir, { recursive: true });
	// The sandbox lives outside the repo, so bare specifiers inside the real
	// files (lodash) would not resolve. Symlink the real dependency context so
	// Node resolves them exactly as it would inside packages/shared-ts.
	const realNodeModules = path.resolve(realSharedTsSrc, '../node_modules');
	if (existsSync(realNodeModules)) {
		symlinkSync(realNodeModules, path.join(dir, 'node_modules'), 'dir');
	}
	return dir;
};

const retryFnPath = (root: string): string =>
	path.join(root, 'utils', 'retry-fn.ts');

/**
 * Rewrites the single sibling-import line of retry-fn.ts inside a sandbox
 * copy to the given specifier. Every other byte is the real source.
 */
const rewriteRetryFnImport = (root: string, specifier: string): void => {
	const file = retryFnPath(root);
	const source = readFileSync(file, 'utf8');
	const rewritten = source.replace(
		/^import \{ delay as delayFn \} from '\.\/any\.utils[^']*';$/m,
		`import { delay as delayFn } from '${specifier}';`,
	);
	assert.notEqual(
		rewritten,
		source,
		'expected the retry-fn sibling import line to be rewritten',
	);
	writeFileSync(file, rewritten);
};

/**
 * Runs the guard as CI runs it — a real `node --experimental-strip-types`
 * process — against the given shared-ts root.
 */
const runGuard = (root: string): { status: number | null; stderr: string } => {
	const result = spawnSync(
		'node',
		[
			'--experimental-strip-types',
			'-e',
			`
import { main } from '${path.resolve(here, './check-shared-ts-node-resolution.mts').replace(/\\/g, '/')}';
main({ sharedTsSrc: '${root.replace(/\\/g, '/')}' });
`,
		],
		{ encoding: 'utf8' },
	);
	return { status: result.status, stderr: result.stderr ?? '' };
};

// ---- #1868 paired proof: RED without the suffix, GREEN with it ------------

void test('RED: retry-fn.ts importing a sibling extensionless fails the guard', () => {
	const root = makeSandbox();
	rewriteRetryFnImport(root, './any.utils');

	const result = runGuard(root);

	assert.notEqual(
		result.status,
		0,
		`extensionless sibling import must FAIL under real Node ESM, got exit code ${result.status}. stderr: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes('ERR_MODULE_NOT_FOUND') ||
			result.stderr.includes('check-shared-ts-node-resolution: FAILED'),
		`stderr must name the resolution failure, got: ${result.stderr}`,
	);
});

void test('GREEN: retry-fn.ts importing a sibling with the .ts suffix passes the guard', () => {
	// The sandbox copies the REAL (fixed) tree, so the suffix is present —
	// this is the "suffix restored" state of the paired proof. No rewrite.
	const root = makeSandbox();
	assert.ok(
		readFileSync(retryFnPath(root), 'utf8').includes("'./any.utils.ts'"),
		'precondition: the sandbox copy must carry the .ts-suffixed specifier',
	);

	const result = runGuard(root);

	assert.equal(
		result.status,
		0,
		`.ts-suffixed sibling import must resolve under real Node ESM, got exit code ${result.status}. stderr: ${result.stderr}`,
	);
});

void test('GREEN: the guard passes against the real shared-ts tree', () => {
	const result = runGuard(realSharedTsSrc);

	assert.equal(
		result.status,
		0,
		`the real shared-ts tree must satisfy the guard, got exit code ${result.status}. stderr: ${result.stderr}`,
	);
});

// ---- #1868 structural regression: the guard resolves the graph, not text ---

void test('RED: a broken module graph fails the guard even when the import line looks correct', () => {
	// Delete the imported sibling file but keep the import line's text
	// (`./any.utils.ts`) byte-identical. A guard that scaned the import line
	// for a suffix would pass here; only real Node resolution fails.
	const root = makeSandbox();
	const sibling = path.join(root, 'utils', 'any.utils.ts');
	assert.ok(
		readFileSync(retryFnPath(root), 'utf8').includes("'./any.utils.ts'"),
		'precondition: retry-fn.ts must carry the correct-looking specifier',
	);
	rmSync(sibling, { force: true });

	const result = runGuard(root);

	assert.notEqual(
		result.status,
		0,
		`a missing sibling must FAIL real resolution despite a correct-looking import line, got exit code ${result.status}. stderr: ${result.stderr}`,
	);
});

// ---- #1868 self-check: the spawned child is what the guard relies on ------

void test('resolveRetryFnViaNode exits non-zero for an unresolvable file URL', () => {
	const result = resolveRetryFnViaNode('file:///definitely/not/retry-fn.ts');

	assert.notEqual(result.status, 0, 'unresolvable URL must fail');
});