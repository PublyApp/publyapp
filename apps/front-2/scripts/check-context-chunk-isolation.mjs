import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const defaultSourceDir = path.join(rootDir, 'src');
const defaultDistAssetsDir = path.join(rootDir, 'dist', 'client', 'assets');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

const pathExists = async (dir) => {
	try {
		await readdir(dir);
		return true;
	} catch {
		return false;
	}
};

const collectFiles = async (dir, extensions) => {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const absolutePath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(absolutePath, extensions)));
			continue;
		}

		if (!extensions || extensions.has(path.extname(entry.name))) {
			files.push(absolutePath);
		}
	}

	return files;
};

// A route-scoped React context whose accessor hook throws when read outside
// its Provider embeds an identifying "... must be used within ..." message
// (see -overview-context.tsx). That thrown string is a stable, greppable
// fingerprint for the module carrying the `createContext()` call: if Vite
// ends up duplicating that module into two client chunks (e.g. because a
// sibling route imports it via the parent route's specifier instead of the
// leaf module — the exact bug this guard exists to catch, see
// $userId/index.test.tsx), the two chunks hold two distinct Context objects,
// and the fingerprint string appears twice in dist/client/assets instead of
// once.
//
// This is deliberately NOT a fully general "every createContext() is safe"
// scanner. It only fingerprints contexts that follow the
// `throw new Error('... must be used within ...')` convention every context
// in this codebase currently uses. A `createContext()` call site that is
// found but doesn't match that message is reported separately as
// "unfingerprinted" rather than silently passing — see `unfingerprinted` in
// the return value and the CLI output below. An unfingerprinted context, and
// a source tree with zero detected contexts at all, are both treated as hard
// failures: this guard exists to fail when it can't verify isolation, not to
// pass by default.
//
// Matches `createContext(...)` and `createContext<T>(...)`, including
// generic type arguments (`createContext<Foo<Bar> | null>(...)`) and
// formatter-mangled spacing (`createContext < Foo > (...)`). The negative
// lookahead requires the next character not be an identifier character, so
// lookalikes like `useCreateContext(` or `createContextValue(` never match.
// Biased toward over-matching: a false positive here only produces a loud
// "unfingerprinted" report, while a false negative silently defeats the
// entire guard — which is the bug this script exists to fix.
//
// Global: a single file can declare more than one context (e.g. a
// recovery-state context and a validation-query context in the same
// module). Each `createContext()` call site is its own isolation unit and
// must get its own fingerprint — collapsing a file's contexts down to one
// fingerprint is exactly how a second, unfingerprinted context can be
// duplicated across chunks without the guard ever noticing.
const CREATE_CONTEXT_PATTERN = /createContext(?![\w$])\s*(<[^(]*>)?\s*\(/g;

const MUST_BE_USED_WITHIN_PATTERN = /[^'"`]*must be used within[^'"`]*/;

export const findContextFingerprints = async ({
	sourceDir = defaultSourceDir,
} = {}) => {
	const files = await collectFiles(sourceDir, SOURCE_EXTENSIONS);
	const fingerprints = [];

	for (const filePath of files) {
		const source = await readFile(filePath, 'utf8');
		const contextMatches = [...source.matchAll(CREATE_CONTEXT_PATTERN)];
		if (contextMatches.length === 0) {
			continue;
		}

		const relativePath = path
			.relative(sourceDir, filePath)
			.split(path.sep)
			.join('/');

		contextMatches.forEach((contextMatch, index) => {
			// Scope the search for this context's accessor message to the
			// source between this `createContext()` call and the next one (or
			// end of file), so a second context declared later in the same
			// file can never be misattributed to an earlier one's message.
			const segmentStart = contextMatch.index;
			const segmentEnd = contextMatches[index + 1]?.index ?? source.length;
			const segment = source.slice(segmentStart, segmentEnd);
			const match = segment.match(MUST_BE_USED_WITHIN_PATTERN);

			fingerprints.push({
				file: relativePath,
				identifyingString: match ? match[0].trim() : null,
			});
		});
	}

	return fingerprints;
};

export const checkContextChunkIsolation = async ({
	sourceDir = defaultSourceDir,
	distAssetsDir = defaultDistAssetsDir,
} = {}) => {
	if (!(await pathExists(distAssetsDir))) {
		throw new Error(
			`checkContextChunkIsolation: no build output at ${distAssetsDir}. ` +
				'This guard reads compiled chunks, not source — run ' +
				'"pnpm --filter front-2 build" first.',
		);
	}

	const fingerprints = await findContextFingerprints({ sourceDir });

	if (fingerprints.length === 0) {
		throw new Error(
			`checkContextChunkIsolation: found zero createContext() call(s) under ${sourceDir}. ` +
				'This guard requires at least one context to protect — zero found means ' +
				'either the detection pattern broke or every context was removed from the ' +
				'source tree, and both need a human to look rather than a silent pass.',
		);
	}

	const assetFiles = (await collectFiles(distAssetsDir)).filter((file) =>
		file.endsWith('.js'),
	);
	const assetContents = await Promise.all(
		assetFiles.map((file) => readFile(file, 'utf8')),
	);

	const violations = [];
	const unfingerprinted = [];

	for (const context of fingerprints) {
		if (!context.identifyingString) {
			unfingerprinted.push(context.file);
			continue;
		}

		const chunkCount = assetContents.filter((content) =>
			content.includes(context.identifyingString),
		).length;

		if (chunkCount !== 1) {
			violations.push({
				file: context.file,
				identifyingString: context.identifyingString,
				chunkCount,
			});
		}
	}

	return { violations, unfingerprinted };
};

if (
	process.argv[1] &&
	pathToFileURL(process.argv[1]).href === import.meta.url
) {
	// Env overrides exist only so tests can spawn this file as a real
	// subprocess against fixture directories and assert on its exit code —
	// the actual regression this packet fixes (a guard that reports failures
	// but exits 0 anyway) can only be caught by observing the process exit
	// code, not by inspecting the exported function's return value.
	const sourceDir =
		process.env.CONTEXT_CHUNK_ISOLATION_SOURCE_DIR ?? defaultSourceDir;
	const distAssetsDir =
		process.env.CONTEXT_CHUNK_ISOLATION_DIST_DIR ?? defaultDistAssetsDir;

	const { violations, unfingerprinted } = await checkContextChunkIsolation({
		sourceDir,
		distAssetsDir,
	});

	let hasFailure = false;

	if (unfingerprinted.length > 0) {
		hasFailure = true;
		console.error(
			'context-chunk-isolation guard: found createContext() call(s) with ' +
				'no "must be used within" message, so this script cannot ' +
				'fingerprint them in the build output and cannot verify they are ' +
				"not duplicated across chunks. Add that message to the context's " +
				'accessor hook, or extend this script with an explicit ' +
				'fingerprint:',
		);
		for (const file of unfingerprinted) {
			console.error(`  ${file}`);
		}
	}

	if (violations.length > 0) {
		hasFailure = true;
		console.error('context-chunk-isolation guard failed:');
		for (const violation of violations) {
			console.error(
				`  ${violation.file}: "${violation.identifyingString}" found in ` +
					`${violation.chunkCount} client chunk(s), expected exactly 1`,
			);
		}
	}

	if (hasFailure) {
		process.exit(1);
	}
}
