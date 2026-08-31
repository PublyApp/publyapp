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
	mkdirSync,
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
	DEFAULT_TARGETS,
	main,
	__testOnly_getResolveCallCount,
	__testOnly_resetResolveCallCount,
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
 * Makes the import target a DIRECTORY under the sandbox copy: the real
 * `utils/any.utils.ts` file becomes `utils/any.utils/index.ts` with the same
 * content, so `import ... from './any.utils'` hits Node's real directory
 * import code path (ERR_UNSUPPORTED_DIR_IMPORT) against copied real source —
 * no synthetic message, no fixture.
 */
const makeImportTargetADirectory = (root: string): void => {
	const file = path.join(root, 'utils', 'any.utils.ts');
	const content = readFileSync(file, 'utf8');
	const dir = path.join(path.dirname(file), 'any.utils');
	mkdirSync(dir);
	writeFileSync(path.join(dir, 'index.ts'), content);
	rmSync(file, { force: true });
};

/**
 * Runs the guard as CI runs it — a real `node --experimental-strip-types`
 * process — against the given shared-ts root. The default target set is
 * `DEFAULT_TARGETS` (one per real artifact the guard must keep loadable);
 * pass a custom `targets` to scope the run to a single file (used by the
 * #1882 paired proof so a regression on try-catch is observed without the
 * other targets pre-empting the failure).
 */
const runGuard = (
	root: string,
	targets: ReadonlyArray<{
		readonly relativePath: string;
		readonly expectedExport: string;
	}> = DEFAULT_TARGETS,
) => {
	const result = spawnSync(
		'node',
		[
			'--experimental-strip-types',
			'-e',
			`
import { main } from '${path.resolve(here, './check-shared-ts-node-resolution.mts').replace(/\\/g, '/')}';
const targets = ${JSON.stringify(targets)};
main({ sharedTsSrc: '${root.replace(/\\/g, '/')}', targets });
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
	// #1894: the verbatim ERR_UNSUPPORTED_DIR_IMPORT message captured from a
	// real node v24.19.0 run (a directory as the import target).
	assert.deepEqual(
		classifyLoadFailure(
			"check-shared-ts-node-resolution: ERR_UNSUPPORTED_DIR_IMPORT: Directory import '/pkg/src/utils/any.utils' is not supported resolving ES modules imported from /pkg/src/utils/retry-fn.ts\n",
		),
		{
			kind: 'directory-import',
			targetPath: '/pkg/src/utils/any.utils',
			importer: '/pkg/src/utils/retry-fn.ts',
		},
	);
});

// ---- #1894 directory-import classification --------------------------------
// Node 24's ESM loader rejects a relative specifier that resolves to a
// DIRECTORY with ERR_UNSUPPORTED_DIR_IMPORT — a code outside the
// ERR_MODULE_NOT_FOUND family, so before #1894 it fell into `unclassified`.
// The paired proof below recreates the case on a copy of the REAL tree (the
// import target becomes a real directory containing real copied source),
// and the unknown-code test pins the #1885 invariant: a code the classifier
// does not recognize must stay unclassified + raw reporter — it must never
// inherit a plausible-looking label in its place.

void test('RED (#1894): importing a directory fails with the directory-import cause and the action, not a guessed label', () => {
	// The sandbox copy's `utils/any.utils.ts` becomes a real directory
	// `utils/any.utils/` with the real source as `index.ts`, so the
	// extensionless specifier `./any.utils` hits Node's actual
	// ERR_UNSUPPORTED_DIR_IMPORT path against real copied source.
	const root = makeSandbox();
	makeImportTargetADirectory(root);
	rewriteRetryFnImport(root, './any.utils');

	const result = runGuard(root);

	assert.notEqual(
		result.status,
		0,
		`a directory import must FAIL under real Node ESM, got exit code ${result.status}. stderr: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes('a directory is not a valid entry point'),
		`stderr must name the cause: a directory is not a valid entry point under Node ESM, got: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes('Point the import at the file explicitly'),
		`stderr must name the next action: point the import at the file explicitly, got: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes('utils/any.utils'),
		`stderr must name the directory Node rejected, got: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes('retry-fn.ts'),
		`stderr must name the importing file, got: ${result.stderr}`,
	);
	assert.ok(
		!result.stderr.includes('cannot be classified'),
		`a directory import is classified since #1894 and must not fall back to the unclassified banner, got: ${result.stderr}`,
	);
});

void test('RED (#1894): an unknown Node error code stays unclassified + raw reporter, never wearing the directory-import label', () => {
	// The invented code ERR_NOT_A_REAL_NODE_CODE is the assumed exception of
	// this file: it is the unknown-case probe, so its line is built by hand.
	// If the classifier ever falls back silently onto a neighboring label
	// for codes it does not recognize — the defect #1893 closed — this test
	// fails.
	const craftedStderr =
		'check-shared-ts-node-resolution: ERR_NOT_A_REAL_NODE_CODE: some invented future wording\n';

	assert.deepEqual(
		classifyLoadFailure(craftedStderr),
		{ kind: 'unclassified' },
		'an error code the classifier does not recognize must stay unclassified',
	);
	// The full guard path for an unknown code: unclassified banner + the raw
	// reporter + no plausible substituted cause.
	const root = makeSandbox();
	writeFileSync(
		retryFnPath(root),
		'const boom: number = "not a number";\n' +
			'process.stderr.write(' +
			JSON.stringify(craftedStderr) +
			');\nprocess.exit(1);\n',
	);

	const result = runGuard(root);

	assert.notEqual(
		result.status,
		0,
		`an unknown-code failure must fail the guard, got exit code ${result.status}. stderr: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes('cannot be classified'),
		`stderr must say the failure cannot be classified, got: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes('ERR_NOT_A_REAL_NODE_CODE'),
		`stderr must carry the raw reporter, got: ${result.stderr}`,
	);
	assert.ok(
		!result.stderr.includes('a directory is not a valid entry point'),
		`stderr must not substitute the #1894 directory-import label for an unknown code, got: ${result.stderr}`,
	);
});

// ---- #1882 paired proof: the class, not just the instance ----------------
// The #1868 guard originally iterated over exactly one target
// (`retry-fn.ts`). A regression on a DIFFERENT file shipping the same
// extensionless-relative shape — e.g. `error.utils.ts` re-introducing
// `./any.utils` — would sail through silently. These tests pin the class:
// dropping the suffix on a sibling import inside error.utils (RED) is caught
// the same way the original retry-fn regression is, and the restored suffix
// (GREEN) is accepted. A third test passes a single-element targets list so
// a future regression on error.utils is observed directly, without the other
// DEFAULT_TARGETS targets pre-empting the failure.
//
// Why `error.utils.ts` and not `try-catch.ts`? The brief named try-catch.ts
// as the example, but its real load graph already contains an unrelated
// #1868 defect inside `lib/logger/iso-logger.ts` (which imports
// `'../constants'` without the `.ts` suffix). That latent defect makes
// try-catch.ts unloadable under `node --experimental-strip-types` even when
// try-catch.ts itself is clean — so the GREEN arm of the paired proof
// would fail today, not because the proof is wrong but because the source
// already violates the #1868 rule. error.utils.ts has a clean load graph
// (its only extensionless import is an `import type`, which TypeScript
// erases before Node sees the file), so the proof runs there. The latent
// iso-logger defect is reported separately in the rapport — it is an
// instance of the same class the guard now closes, and #1882's extended
// guard is the tool that surfaces it.

const errorUtilsPath = (root: string): string =>
	path.join(root, 'utils', 'error.utils.ts');

/**
 * Rewrites the single sibling-import line of error.utils.ts inside a sandbox
 * copy to the given specifier. Mirrors `rewriteRetryFnImport` but on the
 * error.utils artifact: the real source ships
 * `import { getErrorMessage } from './any.utils.ts';` — wait, that line
 * does not exist in error.utils.ts today. error.utils.ts only imports
 * `'../lib/i18n/resources'` (an `import type`, erased before Node sees the
 * file). For the paired proof we INJECT a sibling-style import of
 * `./any.utils` (any function from any.utils — the import shape is what
 * matters, not whether the function is actually called) so the test can
 * regress the suffix and observe the guard catching it. Every other byte
 * of error.utils.ts is the real source.
 */
const injectErrorUtilsSiblingImport = (
	root: string,
	specifier: string,
): void => {
	const file = errorUtilsPath(root);
	const source = readFileSync(file, 'utf8');
	const importLine = `import { delay as anyUtilsDelay } from '${specifier}';\n`;
	// Insert after the first existing import line so the injected line
	// participates in Node's real resolution order.
	const rewritten = source.replace(/^(import [^\n]+\n)/m, `$1${importLine}`);
	assert.notEqual(
		rewritten,
		source,
		'expected the error.utils first import line to be augmented with a sibling import',
	);
	writeFileSync(file, rewritten);
};

const ERROR_UTILS_TARGET = [
	{
		relativePath: path.join('utils', 'error.utils.ts'),
		expectedExport: 'getErrorMessage',
	},
] as const;

void test('RED (#1882): error.utils.ts importing a sibling extensionless fails the guard with the same diagnostic as the retry-fn case', () => {
	const root = makeSandbox();
	injectErrorUtilsSiblingImport(root, './any.utils');

	const result = runGuard(root, ERROR_UTILS_TARGET);

	assert.notEqual(
		result.status,
		0,
		`extensionless sibling import in error.utils must FAIL the guard, got exit code ${result.status}. stderr: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes('must carry the real file extension (#1868)'),
		`stderr must name the #1868 extension defect so the class — not just the retry-fn instance — is reported, got: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes("'utils/error.utils.ts'"),
		`stderr must name the failing target, got: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes('utils/any.utils'),
		`stderr must name the failing module, got: ${result.stderr}`,
	);
});

void test('GREEN (#1882): error.utils.ts importing a sibling with the .ts suffix passes the guard', () => {
	const root = makeSandbox();
	injectErrorUtilsSiblingImport(root, './any.utils.ts');

	const result = runGuard(root, ERROR_UTILS_TARGET);

	assert.equal(
		result.status,
		0,
		`.ts-suffixed error.utils import must resolve under real Node ESM, got exit code ${result.status}. stderr: ${result.stderr}`,
	);
});

// ---- #1882 anti-mutation: the iteration actually walks the class ---------
// The guard's invariant is that EVERY entry in DEFAULT_TARGETS is exercised.
// A future change that drops a target (e.g. "retry-fn is enough") would
// close the class back open without anyone noticing: a single-target guard
// is the exact pre-#1882 shape. This test fails if `resolveModuleViaNode`
// is called fewer times than `DEFAULT_TARGETS.length` against the real
// shared-ts tree, pinning the iteration.

void test('#1882 invariant: the guard iterates over every DEFAULT_TARGETS entry against the real shared-ts tree', () => {
	// The guard's invariant is that EVERY entry in DEFAULT_TARGETS is
	// exercised (#1882). A future change that drops a target (e.g. "retry-fn
	// is enough") would close the class back open without anyone noticing:
	// a single-target guard is the exact pre-#1882 shape, and a regression
	// on any non-retry-fn artifact would sail through.
	//
	// We pin the iteration by importing the test-instrumentation counter
	// the guard increments inside `resolveModuleViaNode`. Running the guard
	// via the same `spawnSync` helper the test already uses, the counter
	// accumulates once per call to `resolveModuleViaNode` inside the child
	// process. But the child is a fresh `node` process — the parent's
	// counter is the only one we can read directly. So we run the guard
	// IN-PROCESS: importing `main` directly (no spawn) executes the loop
	// in this very test process, where the counter is observable.
	//
	// Catches the mutation: `for (const target of targets.slice(0, 1))` — the
	// loop only walks the first target, the rest of DEFAULT_TARGETS is
	// silently ignored, and a regression on any other entry sails through.
	__testOnly_resetResolveCallCount();
	const baseline = __testOnly_getResolveCallCount();
	assert.equal(
		baseline,
		0,
		'counter must start at 0 after a reset (test isolation)',
	);

	// Run the guard IN-PROCESS against a sandbox copy of the real tree.
	const sandbox = makeSandbox();
	main({ sharedTsSrc: sandbox });

	const observed = __testOnly_getResolveCallCount();
	assert.equal(
		observed,
		DEFAULT_TARGETS.length,
		`the guard must call resolveModuleViaNode exactly DEFAULT_TARGETS.length times (${DEFAULT_TARGETS.length}); observed ${observed}. A smaller count means the iteration was truncated — the pre-#1882 single-target shape is back.`,
	);
	// Pin the constant the test pins: a future PR shrinking the list must
	// update this assertion, surfacing the class-shrinking decision.
	assert.equal(
		DEFAULT_TARGETS.length,
		5,
		`DEFAULT_TARGETS must cover at least 5 artifacts to close the class, got ${DEFAULT_TARGETS.length}`,
	);
});
