/**
 * Guard (#1682, extended #1752): front test code must not re-declare a
 * constant that `packages/shared-ts` already exports.
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
 * THE RULE (#1752). For every `const NAME = …` declaration at ANY depth in the
 * scanned test surface: if `NAME` is exported by any `packages/shared-ts/src/**`
 * module AND the declaration's initializer is statically the SAME scalar value
 * (`string | number | boolean`) as the exported constant, the guard fails and
 * names the file, the line, and the module to import from instead.
 *
 * The value condition is what separates a COPY from a name collision. A name
 * match alone is too loose once the scan goes deep: `retry` (an exported helper
 * function) is a common local name for a UI button locator or a mock, and a
 * test declaring it is not re-declaring the shared utility. The real #1682
 * copies carried the production VALUE (`SESSION_TOKEN_HEADER_KEY =
 * 'X-Session-Token'`), and that is what this rule compares.
 *
 * The scanned surface is the front test code the defect actually lives in:
 * - `apps/front/e2e` — every `.ts`/`.tsx` file (specs, helpers, setup), as
 *   before #1752, but now at any depth, not only module top level;
 * - `apps/front/src` — the `.test.ts` and `.test.tsx` files (the Vitest
 *   unit/component surface; mirrors `vitest.config.ts`).
 *
 * Deliberately NOT scanned, each with its reason:
 * - `apps/front/tests/proofs/**` — versioned paired-red proofs replay the
 *   RED mutation against the CURRENT production code; a proof may need to
 *   re-declare a constant to reproduce the defect it pins. Flagging them
 *   would prevent writing the proof at all.
 * - `apps/front/scripts/**` — runner-internal scripts (the guard's own unit
 *   tests build fixture trees that intentionally declare shared-shaped
 *   names); these are not user-facing test code.
 *
 * FAIL-CLOSED on an absent target. A missing directory is a finding, not a skip,
 * and a run that finds zero e2e files, zero src test files, or zero shared-ts
 * exports is a failure: examining nothing must never be reported as compliance.
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
 * and a raw literal (`'X-Session-Token'` written as-is) are NOT caught.
 * Catching those needs value comparison, which would flag every unrelated
 * string that happens to coincide with an exported value (an asserted error
 * message, a route path ...). The name rule is the mechanical part; the value
 * rule stays a review concern — the same trade-off #1682 documented, now
 * applied to the deep and Vitest surfaces.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Node, Project, ts } from 'ts-morph';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT_DIR = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(FRONT_DIR, '..', '..');
const E2E_DIR = path.join(FRONT_DIR, 'e2e');
const SRC_DIR = path.join(FRONT_DIR, 'src');
const SHARED_TS_SRC = path.join(REPO_ROOT, 'packages', 'shared-ts', 'src');

/** File-name suffixes the Vitest surface uses (mirrors the `include` globs
 * `src/**` + `*.{test.ts,test.tsx}` in `apps/front/vitest.config.ts`). */
const VITEST_TEST_SUFFIXES = ['.test.ts', '.test.tsx'];

type Finding = {
	file: string;
	line: number;
	name: string;
	source: string;
	kind: 'copy' | 'unfoldable';
};

/** Test files of the Vitest surface under `root` (`*.test.ts` / `*.test.tsx`),
 * matching the `include` globs of `apps/front/vitest.config.ts`. Non-test code
 * under the root is deliberately skipped: the defect is a TEST that asserts
 * against its own copy of a production value, so production source files are
 * not the target. Fail-closed on a missing root, same as `listTypeScriptFiles`. */
export const listVitestTestFiles = (root: string): string[] => {
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
			if (
				VITEST_TEST_SUFFIXES.some((suffix) =>
					full.toLowerCase().endsWith(suffix),
				)
			) {
				out.push(full);
			}
		}
	};
	walk(root);
	return out;
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
			// `default` is not a name a spec can re-declare — `const default = …`
			// is a syntax error — so mapping it only adds an unstable entry that
			// four different modules fight over. Dropping it keeps the map made
			// of names the guard can actually be asked about.
			if (name === 'default') {
				continue;
			}
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
			// A name reachable through a barrel is ALSO reachable through the
			// module the barrel re-exports, so the same name is seen twice and a
			// plain `set` lets directory order decide which specifier the
			// developer is told to import — advice that would silently change
			// when an unrelated file is renamed.
			//
			// The tie is broken on where the name is DECLARED, not on which path
			// is shorter. Two reasons, both measured in this repo rather than
			// assumed: `packages/shared-ts/package.json` maps `./*` to
			// `./src/*.ts`, so `@org/shared-ts/lib/session` resolves to a
			// `lib/session.ts` that does not exist — the barrel is not an
			// importable specifier here, only `lib/session/index` is. And every
			// real import in the tree names the declaring module
			// (`@org/shared-ts/lib/session/parse`,
			// `@org/shared-ts/lib/api-failure/to-api-failure`); not one imports a
			// barrel. Pointing at the barrel would print advice that resolves
			// nowhere and that no existing line follows.
			const declaredHere = declarations.some(
				(declaration) => declaration.getSourceFile().getFilePath() === file,
			);
			if (!declaredHere && exports.has(name)) {
				continue;
			}
			const specifier = `@org/shared-ts/${relative}`;
			const existing = exports.get(name);
			if (existing !== undefined && !declaredHere) {
				continue;
			}
			exports.set(name, specifier);
		}
	}
	return exports;
};

/** A scalar constant value the guard can compare a test declaration against. */
export type ScalarValue = string | number | boolean;

/**
 * The result of folding a variable initializer: either a comparable scalar
 * value, or `unfoldable` — the initializer is present but not a static
 * scalar (a call, an object literal, an unresolved identifier, a binary
 * expression ...). `unfoldable` is a RESULT, never `undefined`: a caller
 * that maps it to "no finding" installs a silent false negative — the guard
 * would report compliance for a declaration it could not decide.
 */
export type FoldResult =
	| { kind: 'value'; value: ScalarValue }
	| { kind: 'unfoldable' };

/**
 * Folds a variable initializer to a scalar value when it is statically a
 * scalar: a string/number literal, `true`/`false`, or a template literal
 * whose parts are ALL static (string parts + identifiers resolving through
 * `known` — e.g. `` `${APP_ID}-locale` `` where `APP_ID` is an exported
 * scalar const in the same module). Anything else (objects, arrays, calls,
 * functions, identifiers that do not resolve, a missing initializer) is
 * `{ kind: 'unfoldable' }` — the caller decides what cannot be decided
 * means for the rule it enforces. The guard never guesses a value it cannot
 * prove.
 */
export const foldInitializer = (
	initializer: Node | undefined,
	known: Map<string, ScalarValue>,
): FoldResult => {
	if (initializer === undefined) {
		return { kind: 'unfoldable' };
	}
	if (Node.isStringLiteral(initializer)) {
		return { kind: 'value', value: initializer.getLiteralValue() };
	}
	if (Node.isNumericLiteral(initializer)) {
		return { kind: 'value', value: initializer.getLiteralValue() };
	}
	// Booleans are NOT one node in ts-morph: `true` is a `TrueLiteral`
	// (`TrueKeyword`), `false` a `FalseLiteral`. There is no
	// `Node.isBooleanLiteral` — calling it is a TypeError (seen live, the
	// very bug this guard shipped with).
	if (Node.isTrueLiteral(initializer)) {
		return { kind: 'value', value: true };
	}
	if (Node.isFalseLiteral(initializer)) {
		return { kind: 'value', value: false };
	}
	if (Node.isNoSubstitutionTemplateLiteral(initializer)) {
		return { kind: 'value', value: initializer.getLiteralValue() };
	}
	// Template EXPRESSION: `` `${A}-${B}` ``. Only folds when EVERY
	// substitution resolves to a scalar through `known` (a template
	// coerces each part to a string, so numbers and booleans fold into
	// their `${…}` text like the runtime would).
	if (Node.isTemplateExpression(initializer)) {
		const parts: string[] = [initializer.getHead().compilerNode.text];
		for (const span of initializer.getTemplateSpans()) {
			const expression = span.getExpression();
			if (Node.isStringLiteral(expression)) {
				parts.push(expression.getLiteralValue());
			} else if (Node.isIdentifier(expression)) {
				const resolved = known.get(expression.getText());
				if (resolved === undefined) {
					return { kind: 'unfoldable' };
				}
				parts.push(String(resolved));
			} else {
				return { kind: 'unfoldable' };
			}
			parts.push(span.getLiteral().compilerNode.text);
		}
		return { kind: 'value', value: parts.join('') };
	}
	return { kind: 'unfoldable' };
};

/**
 * Scalar constant values exported by `packages/shared-ts/src/**`, mapped by
 * name and read from the REAL module tree (the guard never carries its own
 * copy of a value list). The value is the static initializer of the exported
 * `const` — folded through `foldInitializer` — so `SESSION_TOKEN_HEADER_KEY`
 * maps to `'X-Session-Token'` and
 * `` LOCALE_COOKIE_KEY `` maps to `'publyapp-locale'`.
 *
 * Name collisions across modules follow the same rule as
 * `collectSharedTsExports`: the module that DECLARES the name wins. Only
 * scalar consts carry a value; objects, arrays, functions and classes are
 * deliberately absent (a test cannot be PROVEN to copy a non-scalar, so the
 * guard does not claim it — the #1752 boundary, stated in the header docs).
 */
export const collectSharedTsConstantValues = (
	sharedTsSrc: string,
): Map<string, ScalarValue> => {
	const project = new Project({ useInMemoryFileSystem: false });
	const values = new Map<string, ScalarValue>();
	for (const file of listTypeScriptFiles(sharedTsSrc)) {
		if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) {
			continue;
		}
		const source = project.addSourceFileAtPath(file);
		// Fold every module-scope const once so templates can resolve their
		// identifier parts against the module's own scalar consts.
		const moduleValues = new Map<string, ScalarValue>();
		for (const statement of source.getVariableStatements()) {
			for (const declaration of statement.getDeclarations()) {
				const folded = foldInitializer(
					declaration.getInitializer(),
					moduleValues,
				);
				if (folded.kind === 'value') {
					moduleValues.set(declaration.getName(), folded.value);
				}
			}
		}
		for (const [name, declarations] of source.getExportedDeclarations()) {
			if (name === 'default') {
				continue;
			}
			const isVariable = declarations.some((declaration) =>
				Node.isVariableDeclaration(declaration),
			);
			if (!isVariable) {
				continue;
			}
			const value = moduleValues.get(name);
			if (value === undefined) {
				continue;
			}
			const declaredHere = declarations.some(
				(declaration) => declaration.getSourceFile().getFilePath() === file,
			);
			if (values.has(name) && !declaredHere) {
				continue;
			}
			values.set(name, value);
		}
	}
	return values;
};

/** `const NAME = …` declarations at ANY depth in the given files whose NAME is
 * already exported by shared-ts. The AST walk visits every VariableStatement
 * wherever it sits (module top level, a `describe` callback, a function body),
 * so moving a copied declaration one nesting level deeper cannot escape the
 * net (#1752). The caller decides which files are scanned (e2e + Vitest
 * surface) and passes the resolved list. */
export const findRedeclaredConstants = (
	files: readonly string[],
	sharedExports: Map<string, string>,
	sharedValues: Map<string, ScalarValue>,
): Finding[] => {
	const project = new Project({ useInMemoryFileSystem: false });
	const findings: Finding[] = [];
	for (const file of files) {
		const source = project.addSourceFileAtPath(file);
		// `getVariableStatements()` only returns module-level statements; the
		// deep walk visits EVERY VariableStatement at any depth (a `describe`
		// callback, a helper function, a test body) so moving a copied
		// declaration one nesting level deeper cannot escape the net (#1752).
		for (const statement of source.getDescendantsOfKind(
			ts.SyntaxKind.VariableStatement,
		)) {
			for (const declaration of statement.getDeclarations()) {
				const name = declaration.getName();
				const source_ = sharedExports.get(name);
				if (source_ === undefined) {
					continue;
				}
				// The value must match, not just the name: `retry` is a shared-ts
				// export AND a common local name for a button locator or a mock —
				// only the copied VALUE is evidence of the #1682 defect. A name
				// whose export is not a scalar const at all carries no value to
				// compare, so it is a plain collision, not a copy.
				const exportedValue = sharedValues.get(name);
				if (exportedValue === undefined) {
					continue;
				}
				const folded = foldInitializer(
					declaration.getInitializer(),
					sharedValues,
				);
				if (folded.kind === 'unfoldable') {
					// The guard cannot decide this declaration — the value may be
					// the copy it exists to catch. Treating it as "nothing to
					// report" would install a silent false negative (a call or an
					// identifier initializer is exactly how a copy hides), so it
					// is a loud finding, not a pass.
					findings.push({
						file: path.relative(REPO_ROOT, file),
						line: declaration.getStartLineNumber(),
						name,
						source: source_,
						kind: 'unfoldable',
					});
					continue;
				}
				if (folded.value !== exportedValue) {
					continue;
				}
				findings.push({
					file: path.relative(REPO_ROOT, file),
					line: declaration.getStartLineNumber(),
					name,
					source: source_,
					kind: 'copy',
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

	const sharedValues = collectSharedTsConstantValues(SHARED_TS_SRC);
	if (sharedValues.size === 0) {
		console.error(
			'e2e shared-constant guard: read ZERO scalar constant values from ' +
				`${path.relative(REPO_ROOT, SHARED_TS_SRC)}. Examining nothing must ` +
				'never pass — check the path and the parse.',
		);
		process.exit(1);
	}

	const e2eFiles = listTypeScriptFiles(E2E_DIR);
	if (e2eFiles.length === 0) {
		console.error(
			'e2e shared-constant guard: found ZERO test files under ' +
				`${path.relative(REPO_ROOT, E2E_DIR)}. Examining nothing must never pass.`,
		);
		process.exit(1);
	}

	const srcTestFiles = listVitestTestFiles(SRC_DIR);
	if (srcTestFiles.length === 0) {
		console.error(
			'e2e shared-constant guard: found ZERO Vitest test files under ' +
				`${path.relative(REPO_ROOT, SRC_DIR)}. Examining nothing must never pass.`,
		);
		process.exit(1);
	}

	const scannedFiles = [...e2eFiles, ...srcTestFiles];
	const findings = findRedeclaredConstants(
		scannedFiles,
		sharedExports,
		sharedValues,
	);
	if (findings.length > 0) {
		console.error(
			'front test code re-declares constants that packages/shared-ts already ' +
				'exports (#1682, #1752). The test then asserts its OWN copy: change the ' +
				'production value and the test keeps passing on a value that no longer ' +
				'exists.',
		);
		for (const finding of findings) {
			if (finding.kind === 'copy') {
				console.error(
					`  ${finding.file}:${finding.line}  ${finding.name} — import it from ` +
						`'${finding.source}' instead of re-declaring it.`,
				);
			} else {
				console.error(
					`  ${finding.file}:${finding.line}  ${finding.name} — initializer is ` +
						`not a static scalar (call/identifier/object): cannot decide whether ` +
						`this is a copy of the shared-ts export. Import it from ` +
						`'${finding.source}' or make the initializer a plain literal.`,
				);
			}
		}
		process.exit(1);
	}

	console.log(
		`e2e shared-constant guard: ${scannedFiles.length} test files checked against ` +
			`${sharedExports.size} shared-ts exports at any nesting depth, ` +
			'0 copied values [OK]',
	);
};

const invokedDirectly =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	main();
}
