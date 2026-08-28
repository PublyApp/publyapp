/**
 * Guard (#1682): an e2e spec must not re-declare a constant that
 * `packages/shared-ts` already exports.
 *
 * Background. `apps/front/e2e/log-leak.spec.ts` declared its own
 * `SESSION_TOKEN_HEADER_KEY = 'X-Session-Token'` while
 * `packages/shared-ts/src/lib/constants.ts` exports the same name. The test
 * then asserted against ITS OWN copy: had production changed the header, the
 * spec would have kept passing while asserting a value that no longer exists.
 * The sibling case was worse — `SESSION_VALIDATION_TIMEOUT_MS` was copied into
 * `ssr-auth-shell.spec.ts`, and PR #1647 cut the production timeout from 20s to
 * 1s with the spec still green.
 *
 * WHAT THIS GUARD INSPECTS (AST, not text).
 *
 * Both sides are parsed into a TypeScript AST via ts-morph — the same reason
 * `check-shared-ts-import-paths.mts` gives: under TS 7 a bare
 * `import ts from 'typescript'` no longer exposes the AST. A regex over source
 * text would also read the name out of comments and strings.
 *
 * The shared-ts side is read from the REAL module tree, never from a list
 * copied into this file. A guard that carried its own list of exported names
 * would be the very defect it is meant to catch: the list would drift from the
 * module, and the guard would go quiet.
 *
 * THE RULE. For every top-level `const NAME = …` in `apps/front/e2e/**`, if
 * `NAME` is exported by any `packages/shared-ts/src/**` module, the guard fails
 * and names the file, the line, and the module to import from instead.
 *
 * FAIL-CLOSED on an absent target. A missing directory is a finding, not a skip,
 * and a run that finds zero e2e files or zero shared-ts exports is a failure:
 * examining nothing must never be reported as compliance.
 *
 * FAIL-CLOSED does NOT extend to syntactically broken files, and saying so
 * would be a lie worth more than the limit itself. ts-morph's parser is
 * fault-tolerant: it accepts `const X = function( { return 1; };` without
 * throwing and yields a best-effort tree. The guard therefore cannot promise to
 * turn red on unparseable input — it will simply see whatever the tolerant
 * parser produced. In practice broken TypeScript reddens the typecheck long
 * before it reaches here, so this is a documentation boundary, not an open
 * hole; it is written down because a guard that overstates what it proves is
 * worse than one that states a narrow truth.
 *
 * KNOWN LIMIT, stated rather than left to be discovered. The rule keys on the
 * NAME, so a copy under a different local name (`const TOKEN_HEADER = 'X-Session-Token'`)
 * is NOT caught. Catching that needs value comparison, which would flag every
 * unrelated string that happens to coincide. The name rule is the mechanical
 * part; the value rule stays a review concern.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Node, Project } from 'ts-morph';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT_DIR = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(FRONT_DIR, '..', '..');
const E2E_DIR = path.join(FRONT_DIR, 'e2e');
const SHARED_TS_SRC = path.join(REPO_ROOT, 'packages', 'shared-ts', 'src');

type Finding = {
	file: string;
	line: number;
	name: string;
	source: string;
};

const listTypeScriptFiles = (root: string): string[] => {
	// Fail-closed on a root that is not there. Letting `readdirSync` throw would
	// end the run with a stack trace instead of a cause; an empty array would be
	// worse still, reporting "0 re-declarations" for a scan that read nothing.
	if (!existsSync(root)) {
		console.error(
			`e2e shared-constant guard: the directory to scan does not exist — ` +
				`${root}. The guard cannot report compliance for a tree it never read.`,
		);
		process.exit(1);
	}

	const out: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir)) {
			const full = path.join(dir, entry);
			if (statSync(full).isDirectory()) {
				if (entry === 'node_modules') {
					continue;
				}
				walk(full);
				continue;
			}
			if (full.endsWith('.ts') || full.endsWith('.tsx')) {
				out.push(full);
			}
		}
	};
	walk(root);
	return out;
};

/** Every VALUE name `packages/shared-ts/src/**` exports, mapped to the module
 * path a consumer should import it from. Read from the real tree — this guard
 * never carries its own copy of the list.
 *
 * Collection goes through ts-morph's `getExportedDeclarations()`, which resolves
 * a name whatever form its export takes. An earlier version walked
 * `getVariableStatements()` and asked each statement `isExported()`; that misses
 * `const X = …; export { X };` outright — the statement itself carries no export
 * modifier — and it misses exported functions, classes and enums entirely. Three
 * real shared-ts files use the separate-`export {}` form today, so the blind spot
 * was not hypothetical: a re-declaration of one of those names would have gone
 * unreported by a guard whose whole purpose is to report it.
 *
 * Type-only exports are dropped on purpose: an e2e `const` that happens to share
 * a name with an exported TYPE is not a duplicated constant. */
export const collectSharedTsExports = (
	sharedTsSrc: string,
): Map<string, string> => {
	const project = new Project({ useInMemoryFileSystem: false });
	const exports = new Map<string, string>();
	for (const file of listTypeScriptFiles(sharedTsSrc)) {
		if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) {
			continue;
		}
		const source = project.addSourceFileAtPath(file);
		const relative = path.relative(sharedTsSrc, file).replace(/\.tsx?$/, '');
		for (const [name, declarations] of source.getExportedDeclarations()) {
			const isValue = declarations.some(
				(declaration) =>
					Node.isVariableDeclaration(declaration) ||
					Node.isFunctionDeclaration(declaration) ||
					Node.isClassDeclaration(declaration) ||
					Node.isEnumDeclaration(declaration),
			);
			if (!isValue) {
				continue;
			}
			exports.set(name, `@org/shared-ts/${relative}`);
		}
	}
	return exports;
};

/** Top-level `const NAME = …` declarations in e2e specs whose NAME is already
 * exported by shared-ts. */
export const findRedeclaredConstants = (
	e2eDir: string,
	sharedExports: Map<string, string>,
): Finding[] => {
	const project = new Project({ useInMemoryFileSystem: false });
	const findings: Finding[] = [];
	for (const file of listTypeScriptFiles(e2eDir)) {
		const source = project.addSourceFileAtPath(file);
		for (const statement of source.getVariableStatements()) {
			// Only module-level declarations: a const inside a test body is a
			// local, not a stand-in for a production constant.
			if (statement.getParent() !== source) {
				continue;
			}
			for (const declaration of statement.getDeclarations()) {
				const name = declaration.getName();
				const source_ = sharedExports.get(name);
				if (source_ === undefined) {
					continue;
				}
				findings.push({
					file: path.relative(REPO_ROOT, file),
					line: declaration.getStartLineNumber(),
					name,
					source: source_,
				});
			}
		}
	}
	return findings;
};

const main = (): void => {
	const sharedExports = collectSharedTsExports(SHARED_TS_SRC);
	if (sharedExports.size === 0) {
		console.error(
			'e2e shared-constant guard: read ZERO exported constants from ' +
				`${path.relative(REPO_ROOT, SHARED_TS_SRC)}. Examining nothing must ` +
				'never pass — check the path and the parse.',
		);
		process.exit(1);
	}

	const e2eFiles = listTypeScriptFiles(E2E_DIR);
	if (e2eFiles.length === 0) {
		console.error(
			'e2e shared-constant guard: found ZERO e2e spec files under ' +
				`${path.relative(REPO_ROOT, E2E_DIR)}. Examining nothing must never pass.`,
		);
		process.exit(1);
	}

	const findings = findRedeclaredConstants(E2E_DIR, sharedExports);
	if (findings.length > 0) {
		console.error(
			'e2e specs re-declare constants that packages/shared-ts already exports ' +
				'(#1682). The spec then asserts its OWN copy: change the production ' +
				'value and the spec keeps passing on a value that no longer exists.',
		);
		for (const finding of findings) {
			console.error(
				`  ${finding.file}:${finding.line}  ${finding.name} — import it from ` +
					`'${finding.source}' instead of re-declaring it.`,
			);
		}
		process.exit(1);
	}

	console.log(
		`e2e shared-constant guard: ${e2eFiles.length} spec files checked against ` +
			`${sharedExports.size} shared-ts exports, 0 re-declarations [OK]`,
	);
};

const invokedDirectly =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	main();
}
