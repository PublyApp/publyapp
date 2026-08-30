/**
 * Built-artifact guard (#1234): asserts on the PRODUCTION BUILD OUTPUT under
 * dist/client that the React Compiler actually ran.
 *
 * Why an artifact guard: every source-level gate stays green if the compiler
 * silently stops compiling (e.g. someone flips `vite.config.ts` to
 * `compilationMode: 'annotation'` while no module carries a `"use memo"`
 * directive, or an upgrade drops the compiler from the pipeline). This guard
 * reads the emitted client chunks instead of source code, so "the build
 * completed" is no longer mistaken for "the build was optimised".
 *
 * Two assertions, both derived from how @vitejs/plugin-react 6.1 emits
 * compiler output (see docs/guides/front/react-compiler.md):
 *
 * 1. Runtime present — the compiler's cache runtime is emitted as its own
 *    chunk (`assets/compiler-runtime-<hash>.js`). Nothing imports it unless
 *    at least one module was compiled, so its absence means zero compilation.
 *
 * 2. Compiled-component floor — every compiled module embeds the memo-cache
 *    sentinel (`Symbol.for("react.memo_cache_sentinel")`) or imports the
 *    runtime chunk. The floor is a PINNED constant set at exactly 80 % of the
 *    measured count from the build that introduced this guard, so a silent
 *    regression (a dependency upgrade, a config flip, a broad pattern change)
 *    fails loudly instead of re-baselining itself downward. Deliberately NOT
 *    computed from the inspected build: a guard that derives its own threshold
 *    from whatever it inspects cannot detect the very regression it exists to
 *    catch. Raise/lower it deliberately when the real count legitimately
 *    moves (new components, deliberate opt-outs), updating MEASURED_BASELINE
 *    with the fresh build number in the same commit.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/**
 * The compiler emits its `react/compiler-runtime` shim as a dedicated chunk
 * named `compiler-runtime-<content-hash>.js`.
 */
export const RUNTIME_CHUNK_PATTERN = /^compiler-runtime-[A-Za-z0-9_-]+\.js$/;

/** Every compiled function body allocates its memo-cache array against this
 * well-known sentinel symbol (string-literal embedded by the compiler). */
export const MEMO_CACHE_SENTINEL = 'react.memo_cache_sentinel';

/**
 * What compiled CODE looks like versus the sentinel's mere definition inside
 * React's own runtime chunk (`ie=Symbol.for(\`react.memo_cache_sentinel\`)`,
 * which ships in every bundle regardless of compilation). A compiled cache
 * slot is always COMPARED against the sentinel, so require the `===`
 * comparison form; matching the bare string would miscount React itself as a
 * "compiled module" once compilation stops entirely.
 */
export const MEMO_CACHE_COMPARE_PATTERN =
	/===Symbol\.for\([`"']react\.memo_cache_sentinel[`"']\)/;

/**
 * Measured with `node scripts/guards/check-react-compiler.mts --measure` on the
 * #1234 lane's post-rewrite production build (2026-08-23): 90 modules across
 * dist/client/assets embed the memo-cache sentinel. Pinned as a literal so
 * the floor cannot silently drift with whatever the inspected build happens
 * to contain.
 */
export const MEASURED_BASELINE = 90;

/** The pass floor: exactly 80 % of the measured baseline, per #1234. */
export const COMPILED_FLOOR = Math.floor(MEASURED_BASELINE * 0.8);

export interface ClientBundleAnalysis {
	found: boolean;
	reason?: string;
	totalJsFiles?: number;
	runtimeChunk?: string | null;
	compiledCount?: number;
	compiledFiles?: string[];
}

export const collectClientJsFiles = (assetsDir: string): string[] | null => {
	if (!existsSync(assetsDir)) {
		return null;
	}
	return readdirSync(assetsDir).filter((name) => name.endsWith('.js'));
};

export const analyzeClientBundle = (
	assetsDir: string,
): ClientBundleAnalysis => {
	const jsFiles = collectClientJsFiles(assetsDir);
	if (jsFiles === null) {
		return { found: false, reason: 'dist/client/assets does not exist' };
	}

	let runtimeChunk: string | null = null;
	const compiledFiles: string[] = [];
	for (const name of jsFiles) {
		if (RUNTIME_CHUNK_PATTERN.test(name)) {
			runtimeChunk = name;
			continue;
		}
		const contents = readFileSync(path.join(assetsDir, name), 'utf8');
		if (MEMO_CACHE_COMPARE_PATTERN.test(contents)) {
			compiledFiles.push(name);
		}
	}

	return {
		found: true,
		totalJsFiles: jsFiles.length,
		runtimeChunk,
		compiledCount: compiledFiles.length,
		compiledFiles,
	};
};

/**
 * Returns the failed assertion name, or `null` when the artifacts prove the
 * compiler ran above the floor. Exported so the test suite can exercise each
 * branch without rebuilding the app.
 */
export const assertCompiledArtifacts = (
	analysis: ClientBundleAnalysis,
	floor: number,
): string | null => {
	if (!analysis.found) {
		return 'MISSING_DIST';
	}
	if (!analysis.runtimeChunk) {
		return 'MISSING_RUNTIME';
	}
	// found === true always carries a numeric compiledCount (see
	// analyzeClientBundle); the fallback only satisfies the optional-field type.
	const compiledCount = analysis.compiledCount ?? 0;
	if (compiledCount < 1) {
		return 'NO_COMPILED_MODULES';
	}
	if (compiledCount < floor) {
		return 'BELOW_FLOOR';
	}
	return null;
};

const main = () => {
	const assetsDir = path.join(rootDir, 'dist', 'client', 'assets');
	const analysis = analyzeClientBundle(assetsDir);
	const failure = assertCompiledArtifacts(analysis, COMPILED_FLOOR);

	if (process.argv.includes('--measure')) {
		console.log(
			JSON.stringify(
				{
					runtimeChunk: analysis.runtimeChunk ?? null,
					compiledModules: analysis.found ? analysis.compiledCount : null,
					clientJsChunks: analysis.found ? analysis.totalJsFiles : null,
				},
				null,
				2,
			),
		);
		return;
	}

	if (failure !== null) {
		console.error(
			`React Compiler artifact guard FAILED (${failure}).\n\n` +
				`The production build under dist/client does not prove the React ` +
				`Compiler ran:\n` +
				`  runtime chunk : ${analysis.runtimeChunk ?? 'NOT FOUND'}\n` +
				`  compiled mods : ${analysis.found ? analysis.compiledCount : 'n/a'}\n` +
				`  required floor: ${COMPILED_FLOOR} (80% of measured ${MEASURED_BASELINE})\n\n` +
				`If this is a deliberate, reviewed change (compiler removed, a big ` +
				`opt-out landed, or the codebase legitimately grew past a boundary), ` +
				`re-measure with \`node scripts/guards/check-react-compiler.mts --measure\`, ` +
				`update MEASURED_BASELINE in this script, and explain it in the PR. ` +
				`Otherwise inspect apps/front/vite.config.ts and the ` +
				`\`@vitejs/plugin-react\` version.`,
		);
		process.exit(1);
	}

	console.log(
		`front React Compiler artifacts: runtime chunk ${analysis.runtimeChunk}; ` +
			`${analysis.compiledCount} compiled module(s) >= floor ${COMPILED_FLOOR} ` +
			`(of ${analysis.totalJsFiles} client chunks).`,
	);
};

// Only run the CLI when executed directly; the test suite imports the helpers.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
