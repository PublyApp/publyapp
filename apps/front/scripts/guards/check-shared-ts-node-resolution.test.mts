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
 * #1885 classification. The guard must not substitute the #1868 extension
 * claim for failures it did not decide. These tests pin the classification:
 * a missing package is reported as an environment error naming the package; a
 * leading-dot specifier naming a genuinely absent file is reported as a
 * missing file; an unclassifiable failure (syntax error) is reported on its
 * own cause. The tightened RED test asserts the #1868 message only when the
 * failing specifier really is the extensionless form.
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

import {
	classifyLoadFailure,
	resolveRetryFnViaNode,
} from './check-shared-ts-node-resolution.mts';

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
const runGuard = (root: string) => {
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
		result.stderr.includes('must carry the real file extension (#1868)'),
		`stderr must name the #1868 extension defect, got: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes('utils/any.utils'),
		`stderr must name the failing module, got: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes('retry-fn.ts'),
		`stderr must name the importing file, got: ${result.stderr}`,
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
	assert.ok(
		result.stderr.includes('does not exist'),
		`stderr must say the module file is missing, got: ${result.stderr}`,
	);
});

// ---- #1868 self-check: the spawned child is what the guard relies on ------

void test('resolveRetryFnViaNode exits non-zero for an unresolvable file URL', () => {
	const result = resolveRetryFnViaNode('file:///definitely/not/retry-fn.ts');

	assert.notEqual(result.status, 0, 'unresolvable URL must fail');
});

// ---- #1885 failure classification: dependency vs extension vs missing file -
// These recreate the two real-world failures the guard must tell apart, on
// COPIES of the real shared-ts tree: a missing dependency (fresh worktree
// without node_modules) and the #1868 extensionless import. A guard that
// collapses every failure into the #1868 extension claim would substitute a
// cause for the dependency case — these tests fail it for that.

void test('RED (#1885): a missing package is reported as an environment error naming the package, not an extension defect', () => {
	// A bare specifier that no install can provide: Node fails with
	// `Cannot find package 'definitely-not-a-real-package-1885'`, exactly like
	// lodash in a worktree without node_modules. Deterministic in both
	// environments, so this test is not hostage to the host's node_modules.
	const root = makeSandbox();
	rewriteRetryFnImport(root, 'definitely-not-a-real-package-1885');

	const result = runGuard(root);

	assert.notEqual(
		result.status,
		0,
		`a missing package must fail the guard, got exit code ${result.status}. stderr: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes(
			"package 'definitely-not-a-real-package-1885' is not installed",
		),
		`stderr must name the missing dependency, got: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes('pnpm install'),
		`stderr must suggest installing the dependency, got: ${result.stderr}`,
	);
	assert.ok(
		!result.stderr.includes('must carry the real file extension'),
		`stderr must not claim the #1868 extension defect for a missing dependency, got: ${result.stderr}`,
	);
});

void test('RED (#1885): a leading-dot specifier naming a missing file is reported as a missing file, not an extension defect', () => {
	// Mutation against the classifier: the specifier starts with '.' (the
	// relative family) but names a file that genuinely does not exist — no
	// `.ts` sibling either. The guard must say so instead of claiming the
	// #1868 extension rule, which would send the reader chasing a suffix that
	// would not fix anything.
	const root = makeSandbox();
	rewriteRetryFnImport(root, './any.utils');
	rmSync(path.join(root, 'utils', 'any.utils.ts'), { force: true });

	const result = runGuard(root);

	assert.notEqual(
		result.status,
		0,
		`a missing file must fail the guard, got exit code ${result.status}. stderr: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes('does not exist'),
		`stderr must say the module file is missing, got: ${result.stderr}`,
	);
	assert.ok(
		!result.stderr.includes('must carry the real file extension'),
		`stderr must not claim the #1868 extension defect when the file is genuinely absent, got: ${result.stderr}`,
	);
});

void test('RED (#1885): an unclassifiable failure is reported on its own cause, not the #1868 banner', () => {
	// A syntax error in the artifact: the child fails with
	// ERR_INVALID_TYPESCRIPT_SYNTAX. The guard must not substitute the #1868
	// extension claim for a cause it cannot classify.
	const root = makeSandbox();
	writeFileSync(retryFnPath(root), 'this is not typescript !!!');

	const result = runGuard(root);

	assert.notEqual(
		result.status,
		0,
		`a syntax error must fail the guard, got exit code ${result.status}. stderr: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes('cannot be classified'),
		`stderr must explicitly say the failure cannot be classified, got: ${result.stderr}`,
	);
	assert.ok(
		!result.stderr.includes('must carry the real file extension'),
		`stderr must not claim the #1868 extension defect for a syntax error, got: ${result.stderr}`,
	);
});

void test('classifyLoadFailure maps the message shapes Node v24.19.0 really emits', () => {
	// Each string below is a verbatim `err.message` captured from a real
	// `node` run (v24.19.0), prefixed as the guard child formats it.
	assert.deepEqual(
		classifyLoadFailure(
			"check-shared-ts-node-resolution: ERR_MODULE_NOT_FOUND: Cannot find package 'lodash' imported from /pkg/src/utils/any.utils.ts\n",
		),
		{
			kind: 'dependency-missing',
			packageName: 'lodash',
			importer: '/pkg/src/utils/any.utils.ts',
		},
	);
	// Installed package, missing subpath: Node reports the resolved path under
	// node_modules/ and the guard must attribute it to the package, not to a
	// relative-import extension.
	assert.deepEqual(
		classifyLoadFailure(
			"check-shared-ts-node-resolution: ERR_MODULE_NOT_FOUND: Cannot find module '/x/node_modules/@scope/pkg/missing.ts' imported from /x/src/main.ts\n",
		),
		{
			kind: 'dependency-missing',
			packageName: '@scope/pkg',
			importer: '/x/src/main.ts',
		},
	);
	// A non-resolution failure carries no ERR_MODULE_NOT_FOUND line.
	assert.deepEqual(
		classifyLoadFailure(
			"check-shared-ts-node-resolution: ERR_INVALID_TYPESCRIPT_SYNTAX: Expected ';', '}' or <eof>\n",
		),
		{ kind: 'unclassified' },
	);
	// Unknown future message shape inside ERR_MODULE_NOT_FOUND.
	assert.deepEqual(
		classifyLoadFailure(
			'check-shared-ts-node-resolution: ERR_MODULE_NOT_FOUND: some future wording\n',
		),
		{ kind: 'unclassified' },
	);
});
