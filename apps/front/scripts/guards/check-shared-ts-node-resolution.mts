/**
 * Node-ESM resolution guard for `packages/shared-ts` source (#1868).
 *
 * The defect. `packages/shared-ts/src/utils/retry-fn.ts` imported a sibling
 * module extensionless (`./any.utils`). Bundlers and vitest resolve that form,
 * but raw Node ESM — `node --experimental-strip-types`, the runtime CI uses
 * for the `.mts` scripts under `apps/front/scripts` — does not: extensionless
 * relative specifiers throw `ERR_MODULE_NOT_FOUND`. The bug was latent (no
 * Node-ESM caller walked that import yet) and would trigger at the first raw
 * Node-ESM caller.
 *
 * Why `.ts` and not `.js`? Node.js 24 executes `.ts` files by stripping types
 * and mandates the REAL file extension in relative specifiers (`import
 * './file.ts'`, not `import './file'` — see the Node.js "Modules: TypeScript"
 * docs, "Determining module system"). It does not rewrite `.js` to `.ts`:
 * importing `./any.utils.js` while only `any.utils.ts` exists also throws
 * `ERR_MODULE_NOT_FOUND` (verified empirically against node v24.19.0, the
 * same version `actions/setup-node@v7` with `node-version: 24` installs).
 * `allowImportingTsExtensions` keeps `tsc` (bundler resolution) in sync with
 * the specifier form Node actually resolves.
 *
 * What this guard does (the real artifact, no fixtures). It spawns a real
 * `node --experimental-strip-types` process and imports the REAL
 * `packages/shared-ts/src/utils/retry-fn.ts` by absolute file URL. Node's ESM
 * loader then resolves every relative specifier inside the real file exactly
 * as a CI `.mts` script calling `@org/shared-ts/utils/retry-fn` would. If the
 * suffix is ever dropped again, the child exits non-zero with
 * `ERR_MODULE_NOT_FOUND` and the guard fails. A regex over source text, a
 * synthetic fixture, or a package descriptor cannot reproduce that failure —
 * only the real loader can, and that is what this guard drives.
 *
 * Failure classification (#1885). The child can fail for reasons other than
 * the #1868 defect — most commonly a missing dependency when `node_modules`
 * is absent. The guard classifies `ERR_MODULE_NOT_FOUND` from the specifier
 * Node actually names, so a failure never gets a substituted cause:
 * - `Cannot find package '<name>'` — a bare dependency is missing. Environment
 *   error: the package is named and `pnpm install` is suggested; the source is
 *   not at fault.
 * - `Cannot find module '<abs>'` where `<abs>` lies under a `node_modules/`
 *   directory — a package subpath is missing. Same environment diagnosis.
 * - `Cannot find module '<abs>'` outside `node_modules`, with a real `.ts`
 *   sibling at `<abs>.ts` — the #1868 signature, current message kept.
 * - `Cannot find module '<abs>'` with no such file at all — a genuinely
 *   missing module: stated as-is, never claimed as #1868.
 * - `Directory import '<abs>' is not supported ...` (Node 24's
 *   ERR_UNSUPPORTED_DIR_IMPORT, #1894) — the relative specifier resolves to
 *   a directory. A directory is not a valid entry point under Node ESM; the
 *   diagnostic names that cause and the action: point the import at the
 *   file explicitly.
 * - anything else — reported unclassified with the raw reporter, never guessed.
 *
 * Node's error codes and messages are not a stable contract: they change
 * between Node versions and platforms. Every classification branch above is
 * written to assume it stops matching one day — and that day the behavior
 * must fall to the loud `unclassified` report with the raw Node message,
 * never to a neighboring category (the #1885 invariant, pinned by the
 * unknown-code test in the paired proof).
 *
 * Run: `node scripts/guards/check-shared-ts-node-resolution.mts`
 * Paired proof: `check-shared-ts-node-resolution.test.mts` — RED when the
 * suffix is dropped, GREEN when restored, plus a deletion proof that the
 * guard exercises the real module graph, not the import line's text.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sharedTsSrc = path.resolve(
	scriptDir,
	'../../../../packages/shared-ts/src',
);

/**
 * Real artifacts the guard loads through `node --experimental-strip-types` to
 * close the #1868 class, not just the #1868 instance (#1882). Each entry is
 * `{ relativePath, expectedExport }` — the relative path inside the shared-ts
 * source root, and a name the loaded module MUST export (so a successful
 * import + a missing export is still caught). A regression that drops the
 * `.ts` suffix on a relative import inside any of these files makes the
 * corresponding child fail with `ERR_MODULE_NOT_FOUND` and the guard goes
 * RED with the same diagnostic as the retry-fn case.
 *
 * The list is hand-curated from a real `node --experimental-strip-types`
 * probe: only files whose load graph is clean TODAY. Adding a file here is
 * a STATEMENT that its import chain is currently clean; the next regression
 * on that file will be caught.
 */
export const DEFAULT_TARGETS: ReadonlyArray<{
	readonly relativePath: string;
	readonly expectedExport: string;
}> = [
	{ relativePath: path.join('utils', 'retry-fn.ts'), expectedExport: 'retry' },
	{ relativePath: path.join('utils', 'any.utils.ts'), expectedExport: 'delay' },
	{
		relativePath: path.join('utils', 'env.utils.ts'),
		expectedExport: 'checkIsServer',
	},
	{
		relativePath: path.join('utils', 'error.utils.ts'),
		expectedExport: 'getErrorMessage',
	},
	{
		relativePath: path.join('utils', 'validation.utils.ts'),
		expectedExport: 'getListParamsSchema',
	},
];

const CHILD_PREFIX = 'check-shared-ts-node-resolution: ';
const ERR_MODULE_NOT_FOUND = 'ERR_MODULE_NOT_FOUND';
const ERR_UNSUPPORTED_DIR_IMPORT = 'ERR_UNSUPPORTED_DIR_IMPORT';

/**
 * The classified cause of a guard failure, named after the specifier Node
 * actually reports — never a substituted explanation.
 */
export type NodeLoadFailure =
	| { kind: 'dependency-missing'; packageName: string; importer: string }
	| { kind: 'extensionless-relative'; targetPath: string; importer: string }
	| { kind: 'missing-relative-module'; targetPath: string; importer: string }
	| { kind: 'directory-import'; targetPath: string; importer: string }
	| { kind: 'unclassified' };

/**
 * #1882 test instrumentation. A monotonically increasing counter the paired
 * proof reads after a guard run to assert the iteration walked every
 * `DEFAULT_TARGETS` entry. Exported (not just module-private) so the test
 * can import it; the `__testOnly` prefix signals it is not part of the
 * guard's public contract. The reset function is also exported so the test
 * can start from a known baseline.
 */
let __testOnly_resolveCallCount = 0;
export const __testOnly_incrementResolveCallCount = (): void => {
	__testOnly_resolveCallCount += 1;
};
export const __testOnly_resetResolveCallCount = (): void => {
	__testOnly_resolveCallCount = 0;
};
export const __testOnly_getResolveCallCount = (): number =>
	__testOnly_resolveCallCount;

/**
 * Spawns a real `node --experimental-strip-types` process and imports a real
 * shared-ts source file by absolute file URL, so Node's ESM loader resolves
 * every relative specifier inside the real file (#1868, #1882). The child
 * exits non-zero when the import fails (ERR_MODULE_NOT_FOUND) or when
 * `expectedExport` is not a function. The env var only carries the absolute
 * target URL + the expected export name — quoting paths inside `-e` would be
 * fragile on Windows-style paths.
 */
export const resolveModuleViaNode = (
	moduleUrl: string,
	expectedExport: string,
): { status: number; stderr: string } => {
	__testOnly_incrementResolveCallCount();
	const result = spawnSync(
		process.execPath,
		[
			'--experimental-strip-types',
			'--input-type=module',
			'-e',
			`
import(process.env.PUBLY_CHECK_SHARED_TS_MODULE_URL)
  .then((mod) => {
    const name = process.env.PUBLY_CHECK_SHARED_TS_EXPECTED_EXPORT;
    if (typeof mod[name] !== 'function') {
      console.error('check-shared-ts-node-resolution: ' + name + ' is not exported by ' + process.env.PUBLY_CHECK_SHARED_TS_MODULE_URL);
      process.exit(1);
    }
    console.log('check-shared-ts-node-resolution: ' + process.env.PUBLY_CHECK_SHARED_TS_MODULE_URL + ' resolved under node --experimental-strip-types [OK]');
  })
  .catch((err) => {
    const code = err && err.code ? String(err.code) : 'UNKNOWN';
    console.error('check-shared-ts-node-resolution: ' + code + (err && err.message ? ': ' + String(err.message) : ''));
    process.exit(1);
  });
`,
		],
		{
			encoding: 'utf8',
			env: {
				...process.env,
				PUBLY_CHECK_SHARED_TS_MODULE_URL: moduleUrl,
				PUBLY_CHECK_SHARED_TS_EXPECTED_EXPORT: expectedExport,
			},
		},
	);
	return { status: result.status ?? 1, stderr: result.stderr ?? '' };
};

/**
 * Back-compat wrapper for the #1868 single-target API. Loads retry-fn.ts
 * through `resolveModuleViaNode` so the existing tests (and any external
 * caller) keep working without modification. New code should use
 * `resolveModuleViaNode` directly with a target from `DEFAULT_TARGETS`.
 */
export const resolveRetryFnViaNode = (retryFnUrl: string) =>
	resolveModuleViaNode(retryFnUrl, 'retry');

/**
 * Extracts `<target> imported from <importer>` from a `Cannot find module`
 * message (the resolved absolute path Node reports, not the original
 * specifier).
 */
const parseCannotFindModule = (
	message: string,
): { target: string; importer: string } | null => {
	const match = /^Cannot find module '([^']+)' imported from (.+)$/.exec(
		message,
	);
	if (match === null) {
		return null;
	}
	return { target: match[1], importer: match[2] };
};

/**
 * Names the package owning a path under a `node_modules/` directory, handling
 * scoped names (`@scope/pkg/...`) and the trailing subpath of either form.
 */
const packageFromNodeModulesPath = (target: string): string | null => {
	const match =
		/(?:^|[\\/])node_modules[\\/](@[^\\/]+[\\/][^\\/]+|[^\\/]+)/.exec(target);
	if (match === null) {
		return null;
	}
	return match[1];
};

/**
 * Classifies the child's stderr line into a truthful cause. `Cannot find
 * package '<name>'` and `Cannot find module '<path>'` under `node_modules/`
 * both mean a dependency is missing (environment error). `Cannot find module
 * '<path>'` outside `node_modules/` is the relative-specifier family: the
 * #1868 signature when a real `.ts` sibling exists at `<path>.ts` (the
 * artifact's own name already carries dots, e.g. `any.utils` →
 * `any.utils.ts`, so the target's text extension is no signal), a genuinely
 * missing file otherwise. Node 24's `Directory import '<path>' is not
 * supported ...` (ERR_UNSUPPORTED_DIR_IMPORT, #1894) is a directory
 * imported as an entry point. Anything unparseable (other error
 * codes, future message formats, the custom retry-export check) is
 * `unclassified` — the guard fails on the raw reporter instead of guessing.
 */
export const classifyLoadFailure = (stderr: string): NodeLoadFailure => {
	const errorLine = stderr
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.startsWith(CHILD_PREFIX));
	if (errorLine === undefined) {
		return { kind: 'unclassified' };
	}
	if (errorLine.startsWith(`${CHILD_PREFIX}${ERR_UNSUPPORTED_DIR_IMPORT}: `)) {
		// Node 24's wording; if it ever changes, the parse fails and the
		// failure falls to `unclassified` — loud, never a neighbor category.
		const dirMessage = errorLine.slice(
			CHILD_PREFIX.length + ERR_UNSUPPORTED_DIR_IMPORT.length + 2,
		);
		const dirMatch =
			/^Directory import '([^']+)' is not supported resolving ES modules imported from (.+)$/.exec(
				dirMessage,
			);
		if (dirMatch === null) {
			return { kind: 'unclassified' };
		}
		return {
			kind: 'directory-import',
			targetPath: dirMatch[1],
			importer: dirMatch[2],
		};
	}
	if (!errorLine.startsWith(`${CHILD_PREFIX}${ERR_MODULE_NOT_FOUND}: `)) {
		return { kind: 'unclassified' };
	}
	const message = errorLine.slice(
		CHILD_PREFIX.length + ERR_MODULE_NOT_FOUND.length + 2,
	);
	const packageMatch =
		/^Cannot find package '([^']+)' imported from (.+)$/.exec(message);
	if (packageMatch) {
		return {
			kind: 'dependency-missing',
			packageName: packageMatch[1],
			importer: packageMatch[2],
		};
	}
	const moduleMatch = parseCannotFindModule(message);
	if (moduleMatch) {
		const packageName = packageFromNodeModulesPath(moduleMatch.target);
		if (packageName !== null) {
			return {
				kind: 'dependency-missing',
				packageName,
				importer: moduleMatch.importer,
			};
		}
		if (existsSync(`${moduleMatch.target}.ts`)) {
			return {
				kind: 'extensionless-relative',
				targetPath: moduleMatch.target,
				importer: moduleMatch.importer,
			};
		}
		return {
			kind: 'missing-relative-module',
			targetPath: moduleMatch.target,
			importer: moduleMatch.importer,
		};
	}
	return { kind: 'unclassified' };
};

/**
 * Runs the guard against a shared-ts source root (the real tree by default,
 * an override for the paired RED/GREEN proof in the test file). Iterates
 * over every entry in `targets` (default: `DEFAULT_TARGETS`, one per real
 * artifact) so a regression on any of them is caught — closing the #1868
 * class, not just the #1868 instance (#1882). Exits non-zero on the first
 * target that fails to resolve under real Node ESM, with the diagnostic for
 * the failure classified per #1885.
 */
export const main = (
	roots?: {
		sharedTsSrc?: string;
		targets?: ReadonlyArray<{
			readonly relativePath: string;
			readonly expectedExport: string;
		}>;
	},
): void => {
	const root = path.resolve(roots?.sharedTsSrc ?? sharedTsSrc);
	const targets = roots?.targets ?? DEFAULT_TARGETS;
	if (targets.length === 0) {
		console.error(
			'check-shared-ts-node-resolution: no targets configured — refusing to run a no-op guard.',
		);
		process.exit(1);
	}
	for (const target of targets) {
		const targetPath = path.join(root, target.relativePath);
		if (!existsSync(targetPath)) {
			console.error(
				`check-shared-ts-node-resolution: ${targetPath} does not exist — ` +
					'cannot exercise Node ESM resolution on the real artifact.',
			);
			process.exit(1);
		}
		const { status, stderr } = resolveModuleViaNode(
			pathToFileURL(targetPath).href,
			target.expectedExport,
		);
		if (status !== 0) {
			const failure = classifyLoadFailure(stderr);
			console.error(
				`check-shared-ts-node-resolution: target '${target.relativePath}' did not load under node --experimental-strip-types.`,
			);
			switch (failure.kind) {
				case 'dependency-missing':
					console.error(
						`check-shared-ts-node-resolution: ENVIRONMENT — package '${failure.packageName}' is not installed, so shared-ts does not load under node --experimental-strip-types. Install the workspace dependencies (pnpm install) and re-run. This is NOT the #1868 import-extension defect: the source is not at fault.`,
					);
					break;
				case 'extensionless-relative':
					console.error(
						'check-shared-ts-node-resolution: FAILED — shared-ts source does not ' +
							'load under node --experimental-strip-types. Every relative import ' +
							'inside packages/shared-ts must carry the real file extension (#1868).',
					);
					break;
				case 'missing-relative-module':
					console.error(
						`check-shared-ts-node-resolution: FAILED — a relative import inside shared-ts does not resolve: ${failure.targetPath} does not exist (imported from ${failure.importer}). Not the #1868 extension defect: restore the missing file or fix the specifier.`,
					);
					break;
				case 'directory-import':
					console.error(
						`check-shared-ts-node-resolution: FAILED — a relative import inside shared-ts points at a directory, and a directory is not a valid entry point under Node ESM: ${failure.targetPath} (imported from ${failure.importer}). Point the import at the file explicitly (#1894), e.g. import from '${failure.targetPath.replace(/\\/g, '/')}/index.ts'.`,
					);
					break;
				case 'unclassified':
					console.error(
						'check-shared-ts-node-resolution: FAILED — shared-ts source does not load under node --experimental-strip-types, and this failure cannot be classified: it is not claimed as the #1868 import-extension defect. The raw reporter follows:',
					);
					break;
			}
			if (stderr.trim() !== '') {
				console.error(stderr.trimEnd());
			}
			process.exit(1);
		}
	}
};

// Only run when invoked directly (node scripts/guards/x.mts), not when
// imported by the test file.
const invokedDirectly =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	main();
}
