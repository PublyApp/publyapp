import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// chore/908 (TypeScript 7): the classic Compiler API is not reachable through
// a bare `import ts from 'typescript'` (it exposes only `version`), and
// `typescript/unstable/ast` is explicitly unstable. ts-morph vendors its own
// version-pinned copy of the classic compiler (`@ts-morph/common`), so AST
// work keeps a stable API across TypeScript upgrades — same precedent as
// check-design-system.mts and i18n-key-coverage.test.ts.
import { ts } from 'ts-morph';
import { describe, expect, test } from 'vitest';

// ---------------------------------------------------------------------------
// Route-loader query-key subset guard (#851 follow-up, #1552 / #1560)
// ---------------------------------------------------------------------------
// The front conventions (§"Client route loaders (#851)") permit a client
// `loader` on an authenticated route for exactly one purpose: awaiting the
// SAME TanStack Query options the page body queries, so the breadcrumb shell
// paints warm entity names. The prohibition is on the loader becoming a second
// fetch path with different keys. That rule used to exist only in prose — a
// description, not a guard: a future lane that warms the cache with options
// the page never queries would read the section, correctly conclude the
// pattern applies, and nothing would fail. This test turns the rule into a
// failing state:
//
//   every route `loader`'s query keys MUST be a subset of the query keys the
//   route's own components pass to `useQuery` (inclusion, never equality).
//
// It asserts the REAL route modules under `src/routes/` — never a regex over
// synthetic fixtures and never a descriptor object. Its failure discipline is
// fail-loud, matching the repo's standing rule: input it cannot statically
// resolve (a dynamic loader value, an unresolvable `queryKey` expression, a
// loader body that delegates cache-warming to an opaque helper when the
// loader has queryClient access) is a FAILURE that names the file — never a
// silently compliant default. Otherwise the first dynamic loader installs a
// permanent blind spot.
//
// Identity model (what "the same query key" means, statically):
//  - a *factory* identity is `<imported-module>#<factory-name>`, the receiver
//    of a `.queryKey(...)` call (`staffTenantDetailsQueryOptions.queryKey({..})`)
//    or a bare identifier used as `queryKey`. Query-hook wrappers
//    (`useStaffTenantDetailsQuery`) are resolved one module deep through
//    `~/lib/query/*` and mapped back to the factory their `useQuery` uses, so
//    a loader preloading `staffTenantDetailsQueryOptions` matches a page that
//    queries through `useStaffTenantDetailsQuery`.
//  - a *literal* identity is the JSON text of a static string array or a
//    string literal (`queryKey: ['staff','tenants']`).
//
// Scope of "the route's own components": the route file itself plus the
// route folder named after the route file's stem (`.../$profileId.tsx` and
// `.../$profileId/**`). The breadcrumb shell and other routes are exactly the
// places a warmed key must NOT be hiding.

const srcDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const routesDir = path.join(srcDir, 'routes');
const repoRoot = path.resolve(srcDir, '..', '..', '..');
const sharedTsSrc = path.join(repoRoot, 'packages', 'shared-ts', 'src');

// The query-client methods that warm the cache with a query key.
const QUERY_CLIENT_WARMING_METHODS = new Set([
	'query',
	'ensureQueryData',
	'prefetchQuery',
	'fetchQuery',
]);

// The query hooks a route's own components are scanned for directly.
const DIRECT_QUERY_HOOKS = new Set(['useQuery', 'useSuspenseQuery']);

// A loader whose first parameter destructures (or is named) `context` or
// `queryClient` has TanStack loader access to the query client. Its body must
// then be FULLY statically analysable: an opaque call to an imported helper
// could warm keys invisibly, which would silently widen the convention. (The
// SSR auth loaders take only `{ location }` — no queryClient access — so
// their server-action calls are out of the convention's scope.)
const hasQueryClientAccess = (
	params: readonly ts.ParameterDeclaration[],
): boolean => {
	const first = params[0];
	if (!first) {
		return false;
	}
	if (ts.isIdentifier(first.name)) {
		return first.name.text === 'context' || first.name.text === 'queryClient';
	}
	if (ts.isObjectBindingPattern(first.name)) {
		return first.name.elements.some((element) => {
			const name = element.propertyName ? element.propertyName : element.name;
			return (
				ts.isIdentifier(name) &&
				(name.text === 'context' || name.text === 'queryClient')
			);
		});
	}
	return false;
};

// Globals a loader body may call in strict mode without hiding anything.
// Property-access calls (`logger.warn`, `context.queryClient.query`,
// `Promise.all`) are always allowed; only BARE identifier calls to
// non-local, non-global names are opaque.
const GLOBAL_CALLEE_ALLOWLIST = new Set([
	'Promise',
	'URLSearchParams',
	'Math',
	'Date',
	'JSON',
	'Object',
	'Array',
	'String',
	'Number',
	'Boolean',
	'RegExp',
	'Error',
	'TypeError',
	'RangeError',
	'console',
	'setTimeout',
	'clearTimeout',
	'setInterval',
	'clearInterval',
	'structuredClone',
	'encodeURIComponent',
	'decodeURIComponent',
	'parseInt',
	'parseFloat',
	'isNaN',
	'isFinite',
	'globalThis',
	'Map',
	'Set',
	'WeakMap',
	'WeakSet',
	'Intl',
	'TextEncoder',
	'TextDecoder',
	'fetch',
	'URL',
	'undefined',
	'NaN',
	'Infinity',
	'Symbol',
	'BigInt',
	'Reflect',
	'Buffer',
	'process',
]);

// ---------------------------------------------------------------------------
// Parsing (fail loud on a partial/recovered tree — same contract as
// i18n-key-coverage.test.ts's createParsedSourceFile)
// ---------------------------------------------------------------------------

interface SourceFileWithParseDiagnostics extends ts.SourceFile {
	parseDiagnostics: readonly ts.Diagnostic[];
}

const getParseDiagnostics = (
	sourceFile: ts.SourceFile,
): readonly ts.Diagnostic[] =>
	(sourceFile as SourceFileWithParseDiagnostics).parseDiagnostics;

const parsedCache = new Map<
	string,
	{ source: string; sourceFile: ts.SourceFile }
>();

const createParsedSourceFile = (
	relativePath: string,
	source: string,
	guardName: string,
): ts.SourceFile => {
	// Keyed on `relativePath` AND validated against the exact source text
	// before reuse (same rule as i18n-key-coverage.test.ts): a fixture that
	// reuses a real file's path with different content must always trigger a
	// fresh parse — a stale tree can never be served.
	const cached = parsedCache.get(relativePath);
	if (cached && cached.source === source) {
		return cached.sourceFile;
	}

	const sourceFile = ts.createSourceFile(
		relativePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);

	const parseDiagnostics = getParseDiagnostics(sourceFile);
	if (parseDiagnostics.length > 0) {
		const messages = parseDiagnostics
			.map((diagnostic) =>
				ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
			)
			.join('; ');
		throw new Error(
			`${guardName} could not parse ${relativePath} — ` +
				`refusing to scan a partial/recovered syntax tree: ${messages}`,
		);
	}

	parsedCache.set(relativePath, { source, sourceFile });
	return sourceFile;
};

const sourceCache = new Map<string, string>();

const readSource = async (absolutePath: string): Promise<string> => {
	const cached = sourceCache.get(absolutePath);
	if (cached !== undefined) {
		return cached;
	}
	const source = await readFile(absolutePath, 'utf8');
	sourceCache.set(absolutePath, source);
	return source;
};

interface ParsedFile {
	absolutePath: string;
	/** Path relative to `srcDir`, posix-separated, e.g.
	 * `routes/authed/.../$profileId.tsx`. */
	relativePath: string;
	sourceFile: ts.SourceFile;
	bindings: Map<string, { module: string; exportedName: string }>;
}

const parseFile = async (absolutePath: string): Promise<ParsedFile> => {
	const source = await readSource(absolutePath);
	const relativePath = path
		.relative(srcDir, absolutePath)
		.split(path.sep)
		.join('/');
	const sourceFile = createParsedSourceFile(
		relativePath,
		source,
		'route-loader query-key guard',
	);

	return {
		absolutePath,
		relativePath,
		sourceFile,
		bindings: collectBindings(sourceFile),
	};
};

const collectFiles = async (dir: string): Promise<string[]> => {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const absolutePath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(absolutePath)));
			continue;
		}
		if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
			files.push(absolutePath);
		}
	}

	return files;
};

// ---------------------------------------------------------------------------
// Import binding resolution
// ---------------------------------------------------------------------------

const normalizeSpecifier = (specifier: string): string => {
	let normalized = specifier.trim();
	if (normalized.startsWith('~/')) {
		normalized = normalized.slice(2);
	}
	if (normalized.endsWith('.ts')) {
		normalized = normalized.slice(0, -3);
	} else if (normalized.endsWith('.tsx')) {
		normalized = normalized.slice(0, -4);
	}
	return normalized;
};

const isQueryModule = (modulePath: string): boolean =>
	modulePath.includes('lib/query/');

/** Import bindings local to a source file: `localName` -> `{ module, exportedName }`. */
const collectBindings = (
	sourceFile: ts.SourceFile,
): Map<string, { module: string; exportedName: string }> => {
	const bindings = new Map<string, { module: string; exportedName: string }>();

	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement)) {
			continue;
		}
		const clause = statement.importClause;
		if (!clause || !ts.isStringLiteral(statement.moduleSpecifier)) {
			continue;
		}
		const modulePath = normalizeSpecifier(statement.moduleSpecifier.text);

		if (clause.name) {
			bindings.set(clause.name.text, {
				module: modulePath,
				exportedName: 'default',
			});
		}
		if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
			for (const element of clause.namedBindings.elements) {
				const exportedName = element.propertyName
					? element.propertyName.text
					: element.name.text;
				bindings.set(element.name.text, {
					module: modulePath,
					exportedName,
				});
			}
		}
	}

	return bindings;
};

interface ResolvedModule {
	absolutePath: string;
	/** Normalized module identity used in key identities. */
	modulePath: string;
}

const moduleExistenceCache = new Set<string>();
const moduleMissingCache = new Set<string>();

const moduleFileExists = (candidate: string): boolean => {
	if (moduleExistenceCache.has(candidate)) {
		return true;
	}
	if (moduleMissingCache.has(candidate)) {
		return false;
	}
	const exists = existsSync(candidate);
	if (exists) {
		moduleExistenceCache.add(candidate);
	} else {
		moduleMissingCache.add(candidate);
	}
	return exists;
};

const resolveModuleFile = (
	importerAbsolutePath: string,
	specifier: string,
): ResolvedModule | null => {
	const normalized = normalizeSpecifier(specifier);

	if (normalized.startsWith('@org/shared-ts/')) {
		const base = path.join(
			sharedTsSrc,
			normalized.slice('@org/shared-ts/'.length),
		);
		for (const extension of ['.ts', '.tsx']) {
			const candidate = base + extension;
			if (moduleFileExists(candidate)) {
				return { absolutePath: candidate, modulePath: normalized };
			}
		}
		return null;
	}

	if (normalized.startsWith('./') || normalized.startsWith('../')) {
		const base = path.resolve(path.dirname(importerAbsolutePath), normalized);
		for (const extension of ['.ts', '.tsx']) {
			const candidate = base + extension;
			if (moduleFileExists(candidate)) {
				return {
					absolutePath: candidate,
					modulePath: path
						.relative(srcDir, candidate)
						.split(path.sep)
						.join('/')
						.replace(/\.tsx?$/, ''),
				};
			}
		}
		return null;
	}

	if (normalized.startsWith('lib/')) {
		const base = path.join(srcDir, normalized);
		for (const extension of ['.ts', '.tsx']) {
			const candidate = base + extension;
			if (moduleFileExists(candidate)) {
				return { absolutePath: candidate, modulePath: normalized };
			}
		}
	}

	return null;
};

// ---------------------------------------------------------------------------
// Query-key identities
// ---------------------------------------------------------------------------

type QueryKeyIdentity =
	| { kind: 'factory'; module: string; name: string }
	| { kind: 'literal'; value: string };

const identityToString = (identity: QueryKeyIdentity): string =>
	identity.kind === 'factory'
		? `factory ${identity.module}#${identity.name}`
		: `literal ${JSON.stringify(identity.value)}`;

const identityKey = (identity: QueryKeyIdentity): string =>
	identity.kind === 'factory'
		? `factory:${identity.module}#${identity.name}`
		: `literal:${identity.value}`;

/** Result of resolving one `queryKey` expression to a static identity. */
type ExtractedQueryKeyIdentity = {
	identity?: QueryKeyIdentity;
	error?: string;
};

/** Static keys produced by a loader body, plus anything unresolvable. */
type LoaderKeySites = {
	identities: QueryKeyIdentity[];
	errors: string[];
};

/** Where a `lib/query` hook maps: its factory identity or an analysis error. */
type ResolvedHookFactory = {
	identity?: QueryKeyIdentity;
	hasQuery?: boolean;
	error?: string;
};

const unwrapParentheses = (expression: ts.Expression): ts.Expression => {
	let node = expression;
	while (ts.isParenthesizedExpression(node)) {
		node = node.expression;
	}
	return node;
};

/** Static identity of a `queryKey` expression. Returns an ERROR for shapes
 * the guard cannot resolve — a failure naming the file, never a silent pass. */
const extractIdentity = (
	expression: ts.Expression,
	bindings: Map<string, { module: string; exportedName: string }>,
	line: number,
	/** Identity for a binding the file does not import — the file's own
	 * module when scanning inside a `lib/query` module (a factory DECLARED
	 * there), or `local` when scanning a route file. */
	defaultModule = 'local',
): ExtractedQueryKeyIdentity => {
	const node = unwrapParentheses(expression);

	if (
		ts.isCallExpression(node) &&
		ts.isPropertyAccessExpression(node.expression) &&
		node.expression.name.text === 'queryKey' &&
		ts.isIdentifier(node.expression.expression)
	) {
		const factoryName = node.expression.expression.text;
		const binding = bindings.get(factoryName);
		return {
			identity: {
				kind: 'factory',
				module: binding?.module ?? defaultModule,
				name: factoryName,
			},
		};
	}

	if (ts.isStringLiteralLike(node)) {
		return { identity: { kind: 'literal', value: JSON.stringify(node.text) } };
	}

	if (ts.isArrayLiteralExpression(node)) {
		const parts: string[] = [];
		for (const element of node.elements) {
			if (ts.isStringLiteralLike(element)) {
				parts.push(element.text);
				continue;
			}
			return {
				error: `queryKey array element ${ts.SyntaxKind[element.kind]} is not a statically known string literal (line ${line}) — cannot verify the loader key`,
			};
		}
		return { identity: { kind: 'literal', value: JSON.stringify(parts) } };
	}

	if (ts.isIdentifier(node)) {
		const binding = bindings.get(node.text);
		return {
			identity: {
				kind: 'factory',
				module: binding?.module ?? defaultModule,
				name: node.text,
			},
		};
	}

	return {
		error: `queryKey expression ${ts.SyntaxKind[node.kind]} (line ${line}) cannot be statically resolved — would silently widen the sanctioned-loader convention`,
	};
};

// ---------------------------------------------------------------------------
// Loader key production
// ---------------------------------------------------------------------------

const chainReferencesQueryClient = (expression: ts.Expression): boolean => {
	let node: ts.Expression = expression;
	for (;;) {
		if (ts.isIdentifier(node)) {
			return node.text === 'queryClient';
		}
		if (ts.isPropertyAccessExpression(node)) {
			if (node.name.text === 'queryClient') {
				return true;
			}
			node = node.expression;
			continue;
		}
		if (ts.isElementAccessExpression(node)) {
			node = node.expression;
			continue;
		}
		return false;
	}
};

const collectLoaderKeySites = (
	body: ts.Node,
	file: ParsedFile,
): LoaderKeySites => {
	const identities: QueryKeyIdentity[] = [];
	const errors: string[] = [];

	const lineOf = (node: ts.Node): number =>
		file.sourceFile.getLineAndCharacterOfPosition(
			node.getStart(file.sourceFile),
		).line + 1;

	const visit = (node: ts.Node): void => {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			QUERY_CLIENT_WARMING_METHODS.has(node.expression.name.text) &&
			chainReferencesQueryClient(node.expression.expression)
		) {
			const argument = node.arguments[0];
			if (argument && ts.isObjectLiteralExpression(argument)) {
				const keyProperty = argument.properties.find(
					(property): property is ts.PropertyAssignment =>
						ts.isPropertyAssignment(property) &&
						ts.isIdentifier(property.name) &&
						property.name.text === 'queryKey',
				);
				if (keyProperty) {
					const extracted = extractIdentity(
						keyProperty.initializer,
						file.bindings,
						lineOf(keyProperty.initializer),
					);
					if (extracted.identity) {
						identities.push(extracted.identity);
					} else {
						errors.push(
							`${file.relativePath}:${lineOf(keyProperty.initializer)}: loader queryKey cannot be statically resolved: ${extracted.error}`,
						);
					}
				}
				// Object form without a `queryKey` property warms nothing
				// checkable — nothing to verify.
			} else if (argument && ts.isStringLiteralLike(argument)) {
				// Legacy string-key form (`fetchQuery('key', fn)`).
				identities.push({
					kind: 'literal',
					value: JSON.stringify(argument.text),
				});
			} else {
				errors.push(
					`${file.relativePath}:${lineOf(node)}: loader queryClient.${node.expression.name.text} call has no statically resolvable query key`,
				);
			}
		}

		ts.forEachChild(node, visit);
	};

	visit(body);
	return { identities, errors };
};

/** In strict mode (loader with queryClient access), a bare call to an opaque
 * imported/global-unlisted helper could warm keys the guard cannot see. */
const collectStrictModeOpaqueCalls = (
	body: ts.Node,
	file: ParsedFile,
	localNames: Set<string>,
): string[] => {
	const issues: string[] = [];

	const lineOf = (node: ts.Node): number =>
		file.sourceFile.getLineAndCharacterOfPosition(
			node.getStart(file.sourceFile),
		).line + 1;

	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
			const callee = node.expression.text;
			if (!localNames.has(callee) && !GLOBAL_CALLEE_ALLOWLIST.has(callee)) {
				issues.push(
					`${file.relativePath}:${lineOf(node)}: loader body calls '${callee}' — an opaque helper that could warm query keys the guard cannot see; only local functions, property-access calls and known globals are analysable`,
				);
			}
		}
		ts.forEachChild(node, visit);
	};

	visit(body);
	return issues;
};

const collectLocalNames = (sourceFile: ts.SourceFile): Set<string> => {
	const names = new Set<string>();
	const visit = (node: ts.Node): void => {
		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
			names.add(node.name.text);
		} else if (
			(ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
			node.name
		) {
			names.add(node.name.text);
		} else if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
			names.add(node.name.text);
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return names;
};

// ---------------------------------------------------------------------------
// Loader value resolution
// ---------------------------------------------------------------------------

type ResolvedLoader =
	| {
			body: ts.Node;
			params: readonly ts.ParameterDeclaration[];
			definitionFile: ParsedFile;
	  }
	| { error: string };

const findLocalLoaderDeclaration = (
	sourceFile: ts.SourceFile,
	name: string,
): ts.VariableDeclaration | ts.FunctionDeclaration | undefined => {
	for (const statement of sourceFile.statements) {
		if (ts.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				if (
					ts.isIdentifier(declaration.name) &&
					declaration.name.text === name
				) {
					return declaration;
				}
			}
		} else if (
			ts.isFunctionDeclaration(statement) &&
			statement.name?.text === name
		) {
			return statement;
		}
	}
	return undefined;
};

const findExportedNamedDeclaration = (
	file: ParsedFile,
	name: string,
): ts.VariableDeclaration | ts.FunctionDeclaration | undefined => {
	for (const statement of file.sourceFile.statements) {
		if (
			ts.isVariableStatement(statement) &&
			statement.modifiers?.some(
				(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
			)
		) {
			for (const declaration of statement.declarationList.declarations) {
				if (
					ts.isIdentifier(declaration.name) &&
					declaration.name.text === name
				) {
					return declaration;
				}
			}
		} else if (
			ts.isFunctionDeclaration(statement) &&
			statement.modifiers?.some(
				(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
			) &&
			statement.name?.text === name
		) {
			return statement;
		}
	}
	return undefined;
};

const loaderNodeBody = (
	node: ts.VariableDeclaration | ts.FunctionDeclaration | ts.Expression,
):
	| { body: ts.Node; params: readonly ts.ParameterDeclaration[] }
	| undefined => {
	const initializer = ts.isVariableDeclaration(node) ? node.initializer : node;
	if (
		initializer &&
		(ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
	) {
		return { body: initializer.body, params: initializer.parameters };
	}
	return undefined;
};

/** Resolves a `loader:` value to an analysable body. Imported loaders are
 * followed one named-export hop (plus one re-export alias hop). Anything else
 * is a loud failure: the guard cannot verify what the loader does. */
const resolveLoader = async (
	file: ParsedFile,
	loaderNode: ts.Expression,
	hopRemaining: number,
): Promise<ResolvedLoader> => {
	const node = unwrapParentheses(loaderNode);

	if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
		return {
			body: node.body,
			params: node.parameters,
			definitionFile: file,
		};
	}

	if (ts.isIdentifier(node)) {
		const localDeclaration = findLocalLoaderDeclaration(
			file.sourceFile,
			node.text,
		);
		if (localDeclaration) {
			const resolved = loaderNodeBody(localDeclaration);
			if (resolved) {
				return { ...resolved, definitionFile: file };
			}
			return {
				error: `${file.relativePath}: loader '${node.text}' resolves to a local declaration that is not a function — cannot be statically analysed`,
			};
		}

		const binding = file.bindings.get(node.text);
		if (binding && binding.exportedName !== 'default' && hopRemaining > 0) {
			const resolvedModule = resolveModuleFile(
				file.absolutePath,
				binding.module,
			);
			if (!resolvedModule) {
				return {
					error: `${file.relativePath}: loader '${node.text}' is imported from '${binding.module}' which cannot be resolved to a file — a dynamic loader would install a permanent blind spot`,
				};
			}
			const moduleFile = await parseFile(resolvedModule.absolutePath);
			const declaration = findExportedNamedDeclaration(
				moduleFile,
				binding.exportedName,
			);
			if (!declaration) {
				return {
					error: `${file.relativePath}: imported loader '${node.text}' is not an exported declaration of '${binding.module}'`,
				};
			}
			const resolved = loaderNodeBody(declaration);
			if (resolved) {
				return { ...resolved, definitionFile: moduleFile };
			}
			if (
				ts.isVariableDeclaration(declaration) &&
				declaration.initializer &&
				ts.isIdentifier(declaration.initializer)
			) {
				// One re-export alias hop, e.g. `export const loader = otherLoader`.
				return resolveLoader(
					moduleFile,
					declaration.initializer,
					hopRemaining - 1,
				);
			}
			return {
				error: `${file.relativePath}: imported loader '${node.text}' (${binding.module}) is not a statically analysable function`,
			};
		}

		return {
			error: `${file.relativePath}: loader '${node.text}' has no local declaration and no resolvable import — a dynamic loader would install a permanent blind spot`,
		};
	}

	return {
		error: `${file.relativePath}: loader value is a ${ts.SyntaxKind[node.kind]} — only inline functions, local declarations and imported named exports are statically analysable`,
	};
};

// ---------------------------------------------------------------------------
// Component query-key collection
// ---------------------------------------------------------------------------

const QUERY_HOOK_NAME_PATTERN = /^use[A-Z].*Query(?:ies)?$/;

const resolveHookFactory = (
	moduleFile: ParsedFile,
	hookExportName: string,
	modulePath: string,
): ResolvedHookFactory => {
	const declaration = findExportedNamedDeclaration(moduleFile, hookExportName);
	if (!declaration) {
		// Not every lib/query export is a query hook (mutations, key getters).
		return { hasQuery: false };
	}

	const initializer = ts.isVariableDeclaration(declaration)
		? declaration.initializer
		: declaration;

	let result: ResolvedHookFactory = { hasQuery: false };

	const visit = (node: ts.Node): void => {
		if (result.identity !== undefined || result.error !== undefined) {
			return;
		}
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			DIRECT_QUERY_HOOKS.has(node.expression.text)
		) {
			result = { hasQuery: true };
			const argument = node.arguments[0];
			if (argument && ts.isObjectLiteralExpression(argument)) {
				const keyProperty = argument.properties.find(
					(property): property is ts.PropertyAssignment =>
						ts.isPropertyAssignment(property) &&
						ts.isIdentifier(property.name) &&
						property.name.text === 'queryKey',
				);
				if (keyProperty) {
					const line =
						moduleFile.sourceFile.getLineAndCharacterOfPosition(
							keyProperty.initializer.getStart(moduleFile.sourceFile),
						).line + 1;
					const extracted = extractIdentity(
						keyProperty.initializer,
						moduleFile.bindings,
						line,
						// A factory declared IN the module (not imported) belongs to
						// that module — the same identity a route-side import of it
						// produces.
						modulePath,
					);
					if (extracted.identity) {
						result = { hasQuery: true, identity: extracted.identity };
					} else {
						result = { hasQuery: true, error: extracted.error };
					}
				}
			} else if (argument && ts.isStringLiteralLike(argument)) {
				result = {
					hasQuery: true,
					identity: { kind: 'literal', value: JSON.stringify(argument.text) },
				};
			} else {
				result = {
					hasQuery: true,
					error: `${hookExportName} in ${moduleFile.relativePath} has no statically resolvable queryKey`,
				};
			}
			return;
		}
		ts.forEachChild(node, visit);
	};

	if (initializer) {
		visit(initializer);
	}
	return result;
};

const collectRouteComponentKeys = async (
	scopeFiles: ParsedFile[],
): Promise<{
	identities: QueryKeyIdentity[];
	errors: string[];
}> => {
	const identities: QueryKeyIdentity[] = [];
	const errors: string[] = [];

	for (const file of scopeFiles) {
		const lineOf = (node: ts.Node): number =>
			file.sourceFile.getLineAndCharacterOfPosition(
				node.getStart(file.sourceFile),
			).line + 1;

		const visit = (node: ts.Node): void => {
			if (
				ts.isCallExpression(node) &&
				ts.isIdentifier(node.expression) &&
				DIRECT_QUERY_HOOKS.has(node.expression.text)
			) {
				const argument = node.arguments[0];
				if (argument && ts.isObjectLiteralExpression(argument)) {
					const keyProperty = argument.properties.find(
						(property): property is ts.PropertyAssignment =>
							ts.isPropertyAssignment(property) &&
							ts.isIdentifier(property.name) &&
							property.name.text === 'queryKey',
					);
					if (keyProperty) {
						const extracted = extractIdentity(
							keyProperty.initializer,
							file.bindings,
							lineOf(keyProperty.initializer),
						);
						if (extracted.identity) {
							identities.push(extracted.identity);
						} else {
							errors.push(
								`${file.relativePath}:${lineOf(keyProperty.initializer)}: useQuery queryKey cannot be statically resolved: ${extracted.error}`,
							);
						}
					}
				} else if (argument && ts.isStringLiteralLike(argument)) {
					identities.push({
						kind: 'literal',
						value: JSON.stringify(argument.text),
					});
				} else if (argument) {
					errors.push(
						`${file.relativePath}:${lineOf(node)}: useQuery call has no statically resolvable queryKey — the route's own query keys cannot be verified`,
					);
				}
			}

			ts.forEachChild(node, visit);
		};

		visit(file.sourceFile);
	}

	// Query-hook wrappers imported from `lib/query/*`: map the hook back to
	// the factory its `useQuery` uses, so a loader preloading the factory
	// matches a page that queries through the wrapper.
	for (const file of scopeFiles) {
		const calledBindings = new Set<string>();
		const visitCalls = (node: ts.Node): void => {
			if (
				ts.isCallExpression(node) &&
				ts.isIdentifier(node.expression) &&
				file.bindings.has(node.expression.text)
			) {
				calledBindings.add(node.expression.text);
			}
			ts.forEachChild(node, visitCalls);
		};
		visitCalls(file.sourceFile);

		for (const bindingName of calledBindings) {
			const binding = file.bindings.get(bindingName);
			if (
				!binding ||
				!isQueryModule(binding.module) ||
				!QUERY_HOOK_NAME_PATTERN.test(binding.exportedName)
			) {
				continue;
			}

			const resolvedModule = resolveModuleFile(
				file.absolutePath,
				binding.module,
			);
			if (!resolvedModule) {
				errors.push(
					`${file.relativePath}: query hook '${bindingName}' is imported from '${binding.module}' which cannot be resolved to a file`,
				);
				continue;
			}

			const moduleFile = await parseFile(resolvedModule.absolutePath);
			const resolved = resolveHookFactory(
				moduleFile,
				binding.exportedName,
				resolvedModule.modulePath,
			);
			if (resolved.error) {
				errors.push(`${file.relativePath}: ${resolved.error}`);
			} else if (resolved.identity) {
				identities.push(resolved.identity);
			}
		}
	}

	return { identities, errors };
};

// ---------------------------------------------------------------------------
// Per-route check
// ---------------------------------------------------------------------------

const findCreateFileRouteCall = (
	sourceFile: ts.SourceFile,
): ts.CallExpression | undefined => {
	let found: ts.CallExpression | undefined;
	const visit = (node: ts.Node): void => {
		if (
			found === undefined &&
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'createFileRoute' &&
			node.arguments[0]
		) {
			found = node;
			return;
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return found;
};

const findLoaderProperty = (
	routeCall: ts.CallExpression,
): ts.PropertyAssignment | undefined => {
	// `createFileRoute('id')({ ... })`: the options object is the argument of
	// the OUTER call whose callee is the `createFileRoute('id')` call; also
	// accept the in-repo-absent `createFileRoute('id', { ... })` shape.
	const parent = routeCall.parent;
	const optionsObject =
		ts.isCallExpression(parent) && parent.expression === routeCall
			? parent.arguments[0]
			: routeCall.arguments[0];
	if (!optionsObject || !ts.isObjectLiteralExpression(optionsObject)) {
		return undefined;
	}
	return optionsObject.properties.find(
		(property): property is ts.PropertyAssignment =>
			ts.isPropertyAssignment(property) &&
			ts.isIdentifier(property.name) &&
			property.name.text === 'loader',
	);
};

const checkRouteLoader = async (
	routeFile: ParsedFile,
	loaderProperty: ts.PropertyAssignment,
): Promise<string[]> => {
	const violations: string[] = [];
	const lineOf = (node: ts.Node): number =>
		routeFile.sourceFile.getLineAndCharacterOfPosition(
			node.getStart(routeFile.sourceFile),
		).line + 1;

	const resolved = await resolveLoader(
		routeFile,
		loaderProperty.initializer,
		2,
	);
	if ('error' in resolved) {
		return [resolved.error];
	}

	const { body, params, definitionFile } = resolved;
	const strict = hasQueryClientAccess(params);

	const { identities: loaderKeys, errors: keyErrors } = collectLoaderKeySites(
		body,
		definitionFile,
	);
	violations.push(
		...keyErrors.map((error) => `${routeFile.relativePath}: ${error}`),
	);

	if (strict) {
		violations.push(
			...collectStrictModeOpaqueCalls(
				body,
				definitionFile,
				collectLocalNames(definitionFile.sourceFile),
			),
		);
	}

	// With zero loader keys there is nothing to be a subset of — the route
	// either preloads nothing (server loaders) or its keys failed loudly
	// above.
	if (loaderKeys.length === 0) {
		return violations;
	}

	// The route's own components: the route file plus the route folder named
	// after the route file's stem.
	const stem = path.posix
		.basename(routeFile.relativePath)
		.replace(/\.tsx?$/, '');
	const routeDir = path.posix.dirname(routeFile.relativePath);
	const routeFolderRelative = path.posix.join(routeDir, stem);
	const routeFolderAbsolute = path.join(srcDir, routeFolderRelative);

	const scopeFiles: ParsedFile[] = [routeFile];
	try {
		const folderFiles = (await collectFiles(routeFolderAbsolute)).filter(
			(absolutePath) => !/\.(test|spec)\.(ts|tsx)$/.test(absolutePath),
		);
		for (const absolutePath of folderFiles) {
			scopeFiles.push(await parseFile(absolutePath));
		}
	} catch {
		// No route folder — the route file alone is the scope.
	}

	const { identities: componentKeys, errors: componentErrors } =
		await collectRouteComponentKeys(scopeFiles);
	violations.push(...componentErrors);

	const componentKeySet = new Set(componentKeys.map(identityKey));
	for (const loaderKey of loaderKeys) {
		if (!componentKeySet.has(identityKey(loaderKey))) {
			violations.push(
				`${routeFile.relativePath}:${lineOf(loaderProperty)}: loader preloads query key ${identityToString(loaderKey)} that the route's own components never pass to useQuery — a loader must be a subset of the route's own query keys (#851/#1552)`,
			);
		}
	}

	return violations;
};

const scanAllRoutes = async (): Promise<{
	violations: string[];
	routesWithLoaders: number;
	routesWithLoaderKeys: number;
}> => {
	const violations: string[] = [];
	let routesWithLoaders = 0;
	let routesWithLoaderKeys = 0;
	const files = await collectFiles(routesDir);

	for (const absolutePath of files) {
		const source = await readSource(absolutePath);
		// Cheap pre-filter: only route files declare `createFileRoute`.
		if (!source.includes('createFileRoute')) {
			continue;
		}

		let routeFile: ParsedFile;
		try {
			routeFile = await parseFile(absolutePath);
		} catch (error) {
			violations.push(
				`${path.relative(srcDir, absolutePath).split(path.sep).join('/')}: guard could not parse the route: ${error instanceof Error ? error.message : String(error)}`,
			);
			continue;
		}

		const routeCall = findCreateFileRouteCall(routeFile.sourceFile);
		if (!routeCall) {
			continue;
		}
		const loaderProperty = findLoaderProperty(routeCall);
		if (!loaderProperty) {
			continue;
		}

		routesWithLoaders += 1;

		const resolved = await resolveLoader(
			routeFile,
			loaderProperty.initializer,
			2,
		);
		if (!('error' in resolved)) {
			const keys = collectLoaderKeySites(
				resolved.body,
				resolved.definitionFile,
			);
			if (keys.identities.length > 0) {
				routesWithLoaderKeys += 1;
			}
		}

		violations.push(...(await checkRouteLoader(routeFile, loaderProperty)));
	}

	return { violations, routesWithLoaders, routesWithLoaderKeys };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('route-loader query-key subset guard', () => {
	// The guard itself: asserts the REAL route modules under src/routes/.
	// A route whose loader preloads a query key its own components never pass
	// to useQuery fails here with the route named — the convention stop being
	// prose-only.
	test("every route loader preloads only query keys the route's own components pass to useQuery (route-loader query-key subset guard)", async () => {
		const { violations, routesWithLoaderKeys } = await scanAllRoutes();
		expect(
			routesWithLoaderKeys,
			'the guard must have statically resolved at least one route with loader query keys — a scan that finds none is a vacuous pass (a blind finder must never read as conformant)',
		).toBeGreaterThanOrEqual(1);
		expect(violations, 'route loader query-key violations').toEqual([]);
	});

	// Mechanism canaries — pure helper behaviour pinned so a refactor of the
	// extractor can never silently stop seeing the shapes it is built for.
	// These are supplementary: the assertion above walks the real tree and is
	// the guard that matters.

	test('extractIdentity recognises a factory receiver as the query identity', () => {
		const { identity, error } = extractIdentity(
			parseExpression(
				'staffTenantDetailsQueryOptions.queryKey({ tenantId: "t1" })',
			),
			new Map([
				[
					'staffTenantDetailsQueryOptions',
					{
						module: 'lib/query/staff-tenants',
						exportedName: 'staffTenantDetailsQueryOptions',
					},
				],
			]),
			3,
		);
		expect(error).toBeUndefined();
		expect(identity).toEqual({
			kind: 'factory',
			module: 'lib/query/staff-tenants',
			name: 'staffTenantDetailsQueryOptions',
		});
	});

	test('extractIdentity recognises static array literals and string literals', () => {
		const array = extractIdentity(
			parseExpression("['staff', 'tenants', 'details']"),
			new Map(),
			1,
		);
		expect(array.identity).toEqual({
			kind: 'literal',
			value: JSON.stringify(['staff', 'tenants', 'details']),
		});

		const stringLiteral = extractIdentity(
			parseExpression("'staff-tenants'"),
			new Map(),
			1,
		);
		expect(stringLiteral.identity).toEqual({
			kind: 'literal',
			value: '"staff-tenants"',
		});
	});

	test('extractIdentity fails loud on a dynamic queryKey expression (function call)', () => {
		const extracted = extractIdentity(
			parseExpression('buildQueryKey(params)'),
			new Map(),
			7,
		);
		expect(extracted.identity).toBeUndefined();
		expect(extracted.error).toContain('cannot be statically resolved');
		expect(extracted.error).toContain('line 7');
	});

	test('collectLoaderKeySites reads keys from queryClient.query/ensureQueryData/prefetchQuery calls, nested included', () => {
		const sourceFile = createParsedSourceFile(
			'canary-loader.tsx',
			[
				'const loader = async ({ context }) => {',
				'  const fetchDetails = () =>',
				'    context.queryClient.query({',
				"      queryKey: ['staff', 'tenants', 'details'],",
				'      queryFn: () => null,',
				'    });',
				'  await fetchDetails();',
				'  await context.queryClient.ensureQueryData({',
				'    queryKey: detailsQueryOptions.queryKey({ tenantId: "t1" }),',
				'    queryFn: () => null,',
				'  });',
				'};',
			].join('\n'),
			'route-loader query-key guard canary',
		);
		let loaderNode: ts.ArrowFunction | undefined;
		const visit = (node: ts.Node): void => {
			// The OUTER loader arrow, not the inner `queryFn: () => null` arrows:
			// anchor on the `const loader = ...` declaration.
			if (
				loaderNode === undefined &&
				ts.isVariableDeclaration(node) &&
				ts.isIdentifier(node.name) &&
				node.name.text === 'loader' &&
				node.initializer &&
				ts.isArrowFunction(node.initializer)
			) {
				loaderNode = node.initializer;
			}
			ts.forEachChild(node, visit);
		};
		visit(sourceFile);

		const file: ParsedFile = {
			absolutePath: '/canary/loader.tsx',
			relativePath: 'routes/canary/loader.tsx',
			sourceFile,
			bindings: new Map([
				[
					'detailsQueryOptions',
					{
						module: 'lib/query/staff-tenants',
						exportedName: 'detailsQueryOptions',
					},
				],
			]),
		};

		if (!loaderNode) {
			throw new Error('canary fixture must contain an arrow function');
		}

		const { identities, errors } = collectLoaderKeySites(loaderNode.body, file);
		expect(errors).toEqual([]);
		expect(identities.map(identityKey).sort()).toEqual(
			[
				'literal:["staff","tenants","details"]',
				'factory:lib/query/staff-tenants#detailsQueryOptions',
			].sort(),
		);
	});
});

const parseExpression = (source: string): ts.Expression => {
	const sourceFile = createParsedSourceFile(
		'canary-expression.ts',
		`const expression = ${source};`,
		'route-loader query-key guard canary',
	);
	let expression: ts.Expression | undefined;
	const visit = (node: ts.Node): void => {
		if (ts.isVariableDeclaration(node) && node.initializer) {
			expression = node.initializer;
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	if (!expression) {
		throw new Error('canary fixture must contain a variable initializer');
	}
	return expression;
};
