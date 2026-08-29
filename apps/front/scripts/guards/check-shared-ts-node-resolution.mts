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

const RETRY_FN_RELATIVE = path.join('utils', 'retry-fn.ts');

/**
 * Spawns a real `node --experimental-strip-types` process and imports
 * `retry-fn.ts` (the artifact fixed by #1868) by absolute file URL, so Node's
 * ESM loader resolves every relative specifier inside the real file. The child
 * exits non-zero when the import fails (ERR_MODULE_NOT_FOUND) or when `retry`
 * is not exported. The env var only carries the absolute target URL — quoting
 * a path inside `-e` would be fragile on Windows-style paths.
 */
export const resolveRetryFnViaNode = (retryFnUrl: string) => {
	const result = spawnSync(
		process.execPath,
		[
			'--experimental-strip-types',
			'--input-type=module',
			'-e',
			`
import(process.env.PUBLY_CHECK_SHARED_TS_RETRY_FN_URL)
  .then((mod) => {
    if (typeof mod.retry !== 'function') {
      console.error('check-shared-ts-node-resolution: retry is not exported by retry-fn.ts');
      process.exit(1);
    }
    console.log('check-shared-ts-node-resolution: retry-fn.ts resolved under node --experimental-strip-types [OK]');
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
				PUBLY_CHECK_SHARED_TS_RETRY_FN_URL: retryFnUrl,
			},
		},
	);
	return { status: result.status ?? 1, stderr: result.stderr ?? '' };
};

/**
 * Runs the guard against a shared-ts source root (the real tree by default,
 * an override for the paired RED/GREEN proof in the test file). Exits non-zero
 * when the artifact cannot be resolved by real Node ESM.
 */
export const main = (roots?: { sharedTsSrc?: string }): void => {
	const root = path.resolve(roots?.sharedTsSrc ?? sharedTsSrc);
	const retryFnPath = path.join(root, RETRY_FN_RELATIVE);
	if (!existsSync(retryFnPath)) {
		console.error(
			`check-shared-ts-node-resolution: ${retryFnPath} does not exist — ` +
				'cannot exercise Node ESM resolution on the real artifact.',
		);
		process.exit(1);
	}
	const { status, stderr } = resolveRetryFnViaNode(pathToFileURL(retryFnPath).href);
	if (status !== 0) {
		console.error(
			'check-shared-ts-node-resolution: FAILED — shared-ts source does not ' +
				'load under node --experimental-strip-types. Every relative import ' +
				'inside packages/shared-ts must carry the real file extension (#1868).',
		);
		if (stderr.trim() !== '') {
			console.error(stderr.trimEnd());
		}
		process.exit(1);
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