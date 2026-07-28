import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';

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
// A context that deliberately does NOT throw (its accessor degrades
// gracefully instead — see auth-brand-context.tsx) carries no such message.
// For those, the fingerprint is the string assigned to `<Context>.displayName`
// instead. `displayName` is inert React DevTools metadata: setting it changes
// no runtime behaviour, and — same as a thrown message — it is a string
// literal the bundler has no reason to remove or rename, so it survives into
// the built chunk exactly like a thrown message does.
//
// A `createContext()` call site that has neither a "must be used within"
// throw nor a matching `displayName` assignment is reported separately as
// "unfingerprinted" rather than silently passing — see `unfingerprinted` in
// the return value and the CLI output below. An unfingerprinted context, and
// a source tree with zero detected contexts at all, are both treated as hard
// failures: this guard exists to fail when it can't verify isolation, not to
// pass by default.
//
// Detection is AST-based (via the `typescript` compiler API, already used
// for source scanning elsewhere in this scripts/ directory — see
// check-design-system.mjs) rather than regex. A regex approximating "a
// generic type argument list" cannot actually balance parens/brackets, so it
// silently stops matching the moment a generic contains one (e.g.
// `createContext<((brand: Brand) => void) | undefined>(...)`, the exact
// shape auth-brand-context.tsx uses) — a false negative that defeats the
// guard. A real parser has no such blind spot.
//
// A single file can declare more than one context (e.g. a recovery-state
// context and a validation-query context in the same module). Each
// `createContext()` call site is its own isolation unit and must get its own
// fingerprint — collapsing a file's contexts down to one fingerprint is
// exactly how a second, unfingerprinted context can be duplicated across
// chunks without the guard ever noticing. Each context's fingerprint search
// (both the throw-message and the displayName search) is scoped to the
// source between that `createContext()` call and the next one (or end of
// file), so a second context declared later in the same file can never be
// misattributed to an earlier one's message.
const MUST_BE_USED_WITHIN_TEXT = 'must be used within';

const scriptKindFor = (filePath) =>
	filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;

const visitDescendants = (node, visitor) => {
	visitor(node);
	node.forEachChild((child) => visitDescendants(child, visitor));
};

const isCreateContextCall = (node) => {
	if (!ts.isCallExpression(node)) {
		return false;
	}
	const callee = node.expression;
	if (ts.isIdentifier(callee)) {
		return callee.text === 'createContext';
	}
	if (ts.isPropertyAccessExpression(callee)) {
		return callee.name.text === 'createContext';
	}
	return false;
};

// For `const XContext = createContext(...)`, returns "XContext" so a later
// `XContext.displayName = "..."` assignment can be matched back to this call
// site. Calls not bound to a simple identifier (e.g. passed straight into
// another expression) have no displayName fingerprinting available.
const declaredVariableName = (createContextCall) => {
	const declaration = createContextCall.parent;
	if (
		declaration &&
		ts.isVariableDeclaration(declaration) &&
		declaration.initializer === createContextCall &&
		ts.isIdentifier(declaration.name)
	) {
		return declaration.name.text;
	}
	return null;
};

const collectCreateContextCalls = (sourceFile) => {
	const calls = [];
	visitDescendants(sourceFile, (node) => {
		if (isCreateContextCall(node)) {
			calls.push({
				pos: node.getStart(sourceFile),
				variableName: declaredVariableName(node),
			});
		}
	});
	return calls.sort((a, b) => a.pos - b.pos);
};

const collectStringLiterals = (sourceFile) => {
	const literals = [];
	visitDescendants(sourceFile, (node) => {
		if (ts.isStringLiteralLike(node)) {
			literals.push({ pos: node.getStart(sourceFile), text: node.text });
		}
	});
	return literals;
};

const collectDisplayNameAssignments = (sourceFile) => {
	const assignments = [];
	visitDescendants(sourceFile, (node) => {
		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			ts.isPropertyAccessExpression(node.left) &&
			node.left.name.text === 'displayName' &&
			ts.isIdentifier(node.left.expression) &&
			ts.isStringLiteralLike(node.right)
		) {
			assignments.push({
				pos: node.getStart(sourceFile),
				target: node.left.expression.text,
				text: node.right.text,
			});
		}
	});
	return assignments;
};

const withinSegment = (pos, segmentStart, segmentEnd) =>
	pos >= segmentStart && pos < segmentEnd;

export const findContextFingerprints = async ({
	sourceDir = defaultSourceDir,
} = {}) => {
	const files = await collectFiles(sourceDir, SOURCE_EXTENSIONS);
	const fingerprints = [];

	for (const filePath of files) {
		const source = await readFile(filePath, 'utf8');
		const relativePath = path
			.relative(sourceDir, filePath)
			.split(path.sep)
			.join('/');

		const sourceFile = ts.createSourceFile(
			relativePath,
			source,
			ts.ScriptTarget.Latest,
			true,
			scriptKindFor(filePath),
		);

		if (sourceFile.parseDiagnostics.length > 0) {
			throw new Error(
				`findContextFingerprints: cannot parse ${relativePath} safely: ` +
					sourceFile.parseDiagnostics
						.map((diagnostic) =>
							ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
						)
						.join('; '),
			);
		}

		const contextCalls = collectCreateContextCalls(sourceFile);
		if (contextCalls.length === 0) {
			continue;
		}

		const stringLiterals = collectStringLiterals(sourceFile);
		const displayNameAssignments = collectDisplayNameAssignments(sourceFile);

		contextCalls.forEach((call, index) => {
			const segmentStart = call.pos;
			const segmentEnd = contextCalls[index + 1]?.pos ?? Infinity;

			const thrownMessage = stringLiterals.find(
				(literal) =>
					withinSegment(literal.pos, segmentStart, segmentEnd) &&
					literal.text.includes(MUST_BE_USED_WITHIN_TEXT),
			);

			const displayName =
				call.variableName &&
				displayNameAssignments.find(
					(assignment) =>
						withinSegment(assignment.pos, segmentStart, segmentEnd) &&
						assignment.target === call.variableName,
				);

			fingerprints.push({
				file: relativePath,
				identifyingString: thrownMessage?.text ?? displayName?.text ?? null,
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
