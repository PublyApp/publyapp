import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// chore/908 (TypeScript 7): the classic Compiler API is not reachable through
// a bare `import ts from 'typescript'`; ts-morph vendors a version-pinned copy
// (same precedent as check-design-system.ts and i18n-key-coverage.test.ts).
import { ts } from 'ts-morph';

// ---------------------------------------------------------------------------
// Route-loader <-> page query guard (#851 follow-up, #1552 / #1560, #2340)
// ---------------------------------------------------------------------------
// Every authenticated route whose page renders query data warms that data
// from a client `loader` (`preloadRouteQueries(queryClient, <spec>)`), and a
// loader never warms a key its page does not use. Both directions, over the
// route's real import graph:
//
//   loaderKeys ⊆ pageKeys              (a loader is never a second fetch path)
//   pageKeys \ exemptions ⊆ loaderKeys (no page query is left cold on hover)
//
// A page query that a loader cannot warm carries
// `// preload-exempt: <reason>` above the call the page makes (a direct
// `useQuery`, a called `lib/**` binding, or a JSX element). Failure discipline
// is fail-loud: a shape the guard cannot resolve is a violation naming the
// file, never a silent pass.
//
// Identity model: a *factory* identity is `factory <module>#<name>`, the
// receiver of `.queryKey(...)` or a bare identifier, with `<module>` the
// import's resolved path under `src` (so `~/lib/query/x` and a relative
// spelling of the same file agree). A *literal* identity is the JSON text of a
// static string array.
//
// Loader keys come from the spec function's RETURNED value(s) only (for
// `.spec`, the `spec` property), never from a literal that is merely declared.
// A conditional return takes the UNION of both branches: a branch-gated entry
// is still a key the loader may warm. A loader body that calls any other
// imported binding is a violation (it could warm a key the guard cannot see).
//
// Bespoke guard admission (docs/guides/test-conventions.md): the six
// conditions are in the PR body (#2340). Retirement: when TanStack Router can
// express "preload every query a route renders", or the loaders move to a
// generated manifest.

const srcDir = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const defaultRoutesDir = path.join(srcDir, 'routes');
const repoRoot = path.resolve(srcDir, '..', '..', '..');
const sharedTsSrc = path.join(repoRoot, 'packages', 'shared-ts', 'src');

// The query-client methods that warm the cache with a query key.
const QUERY_CLIENT_WARMING_METHODS = new Set([
	'query',
	'ensureQueryData',
	'prefetchQuery',
	'fetchQuery',
]);

// The query hooks a page's own components are scanned for directly.
const DIRECT_QUERY_HOOKS = new Set([
	'useQuery',
	'useSuspenseQuery',
	'useInfiniteQuery',
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

export const createParsedSourceFile = (
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

/** An import binding. `module` is the canonical identity (the resolved path
 * under `src` when the specifier resolves, else the normalized specifier);
 * `specifier` is the normalized specifier as written, used to resolve the file. */
export interface ImportBinding {
	module: string;
	exportedName: string;
	specifier?: string;
}

export interface ParsedFile {
	absolutePath: string;
	/** Path relative to `srcDir`, posix-separated, e.g.
	 * `routes/authed/.../$roleId.tsx`. */
	relativePath: string;
	sourceFile: ts.SourceFile;
	bindings: Map<string, ImportBinding>;
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
		bindings: collectBindings(sourceFile, absolutePath),
	};
};

const collectFiles = async (dir: string): Promise<string[]> => {
	const entries = await readdir(dir, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry): Promise<string[]> => {
			const absolutePath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				return collectFiles(absolutePath);
			}
			if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
				return [absolutePath];
			}
			return [];
		}),
	);
	return nested.flat();
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

/** Import bindings local to a source file: `localName` -> `{ module, exportedName }`. */
const collectBindings = (
	sourceFile: ts.SourceFile,
	importerAbsolutePath: string,
): Map<string, ImportBinding> => {
	const bindings = new Map<string, ImportBinding>();

	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement)) {
			continue;
		}
		const clause = statement.importClause;
		if (!clause || !ts.isStringLiteral(statement.moduleSpecifier)) {
			continue;
		}
		const specifier = normalizeSpecifier(statement.moduleSpecifier.text);
		const modulePath =
			resolveModuleFile(importerAbsolutePath, specifier)?.modulePath ??
			specifier;

		if (clause.name) {
			bindings.set(clause.name.text, {
				module: modulePath,
				exportedName: 'default',
				specifier,
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
					specifier,
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
		for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
			const candidate = base + suffix;
			if (moduleFileExists(candidate)) {
				return {
					absolutePath: candidate,
					modulePath: path
						.relative(srcDir, candidate)
						.split(path.sep)
						.join('/')
						.replace(/\.tsx?$/, '')
						.replace(/\/index$/, ''),
				};
			}
		}
		return null;
	}

	if (normalized.startsWith('lib/')) {
		const base = path.join(srcDir, normalized);
		for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
			const candidate = base + suffix;
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

export type QueryKeyIdentity =
	| { kind: 'factory'; module: string; name: string }
	| { kind: 'literal'; value: string };

export const identityToString = (identity: QueryKeyIdentity): string =>
	identity.kind === 'factory'
		? `factory ${identity.module}#${identity.name}`
		: `literal ${JSON.stringify(identity.value)}`;

export const identityKey = (identity: QueryKeyIdentity): string =>
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

const unwrapParentheses = (expression: ts.Expression): ts.Expression => {
	let node = expression;
	while (ts.isParenthesizedExpression(node)) {
		node = node.expression;
	}
	return node;
};

/** Static identity of a `queryKey` expression. Returns an ERROR for shapes
 * the guard cannot resolve — a failure naming the file, never a silent pass. */
export const extractIdentity = (
	expression: ts.Expression,
	bindings: Map<string, ImportBinding>,
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

export const collectLoaderKeySites = (
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
				binding.specifier ?? binding.module,
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

// ---------------------------------------------------------------------------
// Pinned sets and route-scoped rules
// ---------------------------------------------------------------------------

const LAYOUT_ROUTE_ID = '/_authed-layout';

/** Section D of the plan: the `/_authed-layout` route has no loader and its
 * page graph is exactly these files (paths relative to `src`). They are
 * mounted through non-relative imports, so no leaf route's walk reaches them. */
const APP_SHELL_PAGE_FILES = [
	'components/app-shell/user-menu.tsx',
	'components/app-shell/app-shell.tsx',
	'components/app-shell/_needs-reconnect-banner.tsx',
	'lib/navigation/entity-crumb.tsx',
	'routes/__root.tsx',
];

/** Route-scoped rule (Task 10 note, captain 10/11): named `lib/**` bindings,
 * called in files that a route reaches only through a component mounted inside
 * a closed drawer (or a hook whose query is `enabled` only once the drawer is
 * open), are NOT page queries of that route: nothing renders them until the
 * drawer opens, and the page's own spec cannot warm them without warming data
 * the page never reads. Another route that renders the same file at mount (the
 * post edit page) is unaffected — the rule is keyed by route id, never by a
 * marker on the shared file. Only the NAMED bindings are skipped, so any other
 * `lib/**` query added to those files still counts. Each entry must be in the
 * route's page graph and its binding imported there, otherwise the rule is
 * stale and fails; every entry is listed in `GuardResult.closedDrawer`, which
 * the test pins like the markers. */
const CLOSED_DRAWER_FILES = new Map<
	string,
	readonly { file: string; bindings: readonly string[] }[]
>([
	[
		'/_authed-layout/tenant/posts/drafts',
		[
			{
				file: 'routes/authed/tenant/posts/_publish-on-block.tsx',
				bindings: ['useTenantPermissions'],
			},
			{
				file: 'routes/authed/tenant/posts/_destination-chips.tsx',
				bindings: ['useTenantPermissions'],
			},
		],
	],
	// Same rule, second instance (plan amendment): the assign drawer's
	// candidate query is `enabled: isOpen`; the members page spec does not warm
	// it (the users page spec warms it behind `?assign=1`).
	[
		'/_authed-layout/staff/tenants/$tenantId/roles/$roleId/members',
		[
			{
				file: 'routes/authed/staff/tenants/$tenantId/roles/$roleId/_assign-members-state-hook.ts',
				bindings: ['useStaffTenantUsersQuery'],
			},
		],
	],
]);

const MAX_REACH_DEPTH = 3;

// ---------------------------------------------------------------------------
// Small AST helpers
// ---------------------------------------------------------------------------

const lineOf = (file: ParsedFile, node: ts.Node): number =>
	file.sourceFile.getLineAndCharacterOfPosition(node.getStart(file.sourceFile))
		.line + 1;

/** A `lib/**` module, by its canonical identity. */
const isLibModule = (modulePath: string): boolean =>
	modulePath.startsWith('lib/') || modulePath.includes('/lib/');

const isStatementContainer = (node: ts.Node): boolean =>
	ts.isSourceFile(node) ||
	ts.isBlock(node) ||
	ts.isModuleBlock(node) ||
	ts.isCaseClause(node) ||
	ts.isDefaultClause(node);

/** The nearest ancestor (or self) that is a statement of a block / file. A
 * call nested in `const x = …` or `return …` carries no leading trivia of its
 * own; its comment sits on this statement (verified with ts-morph@28). */
const enclosingStatement = (node: ts.Node): ts.Node => {
	let current = node;
	while (current.parent && !isStatementContainer(current.parent)) {
		current = current.parent;
	}
	return current;
};

const objectProperty = (
	object: ts.ObjectLiteralExpression,
	name: string,
): ts.ObjectLiteralElementLike | undefined =>
	object.properties.find(
		(property) =>
			(ts.isPropertyAssignment(property) ||
				ts.isShorthandPropertyAssignment(property)) &&
			ts.isIdentifier(property.name) &&
			property.name.text === name,
	);

const queryKeyInitializer = (
	object: ts.ObjectLiteralExpression,
): ts.Expression | undefined => {
	const property = objectProperty(object, 'queryKey');
	if (property && ts.isPropertyAssignment(property)) {
		return property.initializer;
	}
	if (property && ts.isShorthandPropertyAssignment(property)) {
		return property.name;
	}
	return undefined;
};

interface QueryCallIdentity {
	identity?: QueryKeyIdentity;
	error?: string;
}

/** Resolves one direct `useQuery`-family call to an identity or an error. */
const identityOfQueryCall = (
	call: ts.CallExpression,
	file: ParsedFile,
	defaultModule: string,
): QueryCallIdentity => {
	const argument = call.arguments[0];
	const where = `${file.relativePath}:${lineOf(file, call)}`;
	if (argument && ts.isObjectLiteralExpression(argument)) {
		const initializer = queryKeyInitializer(argument);
		if (!initializer) {
			return {
				error: `${where}: query call has no \`queryKey\` property the guard can read — cannot verify the loader warms it`,
			};
		}
		const extracted = extractIdentity(
			initializer,
			file.bindings,
			lineOf(file, initializer),
			defaultModule,
		);
		if (extracted.identity) {
			return { identity: extracted.identity };
		}
		return { error: `${where}: ${extracted.error}` };
	}
	return {
		error: `${where}: query call has no statically resolvable queryKey — the guard cannot verify the loader warms it`,
	};
};

// ---------------------------------------------------------------------------
// Page keys, collector (b): a called `lib/**` binding that reaches a query hook
// ---------------------------------------------------------------------------

interface ReachResult {
	identities: QueryKeyIdentity[];
	errors: string[];
}

const declarationNode = (
	declaration: ts.VariableDeclaration | ts.FunctionDeclaration,
): ts.Node | undefined =>
	ts.isVariableDeclaration(declaration) ? declaration.initializer : declaration;

/** Every `useQuery` / `useInfiniteQuery` call reachable from an exported
 * declaration of a module — through same-module local calls and imported
 * `lib/**` bindings (depth-bounded, cycle-safe). */
const reachQueries = async (
	moduleFile: ParsedFile,
	declaration: ts.VariableDeclaration | ts.FunctionDeclaration,
	modulePath: string,
	depth: number,
	visited: Set<string>,
): Promise<ReachResult> => {
	const result: ReachResult = { identities: [], errors: [] };
	const root = declarationNode(declaration);
	if (!root) {
		return result;
	}
	const pending: Promise<ReachResult>[] = [];

	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
			const callee = node.expression.text;
			if (DIRECT_QUERY_HOOKS.has(callee)) {
				const resolved = identityOfQueryCall(node, moduleFile, modulePath);
				if (resolved.identity) {
					result.identities.push(resolved.identity);
				} else if (resolved.error) {
					result.errors.push(resolved.error);
				}
			} else if (depth < MAX_REACH_DEPTH) {
				const binding = moduleFile.bindings.get(callee);
				if (binding) {
					if (
						isLibModule(binding.module) &&
						binding.exportedName !== 'default'
					) {
						pending.push(reachBinding(moduleFile, binding, depth + 1, visited));
					}
				} else {
					const local = findLocalLoaderDeclaration(
						moduleFile.sourceFile,
						callee,
					);
					const key = `${moduleFile.absolutePath}#${callee}`;
					if (local && local !== declaration && !visited.has(key)) {
						visited.add(key);
						pending.push(
							reachQueries(moduleFile, local, modulePath, depth + 1, visited),
						);
					}
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(root);

	for (const nested of await Promise.all(pending)) {
		result.identities.push(...nested.identities);
		result.errors.push(...nested.errors);
	}
	return result;
};

const reachBinding = async (
	importer: ParsedFile,
	binding: ImportBinding,
	depth: number,
	visited: Set<string>,
): Promise<ReachResult> => {
	const resolved = resolveModuleFile(
		importer.absolutePath,
		binding.specifier ?? binding.module,
	);
	if (!resolved) {
		return {
			identities: [],
			errors: [
				`${importer.relativePath}: '${binding.exportedName}' is imported from '${binding.module}' which cannot be resolved to a file`,
			],
		};
	}
	const key = `${resolved.absolutePath}#${binding.exportedName}`;
	if (visited.has(key)) {
		return { identities: [], errors: [] };
	}
	visited.add(key);
	const moduleFile = await parseFile(resolved.absolutePath);
	const declaration = findExportedNamedDeclaration(
		moduleFile,
		binding.exportedName,
	);
	if (!declaration) {
		// Not every export is a function (constants, types): nothing to reach.
		return { identities: [], errors: [] };
	}
	return reachQueries(
		moduleFile,
		declaration,
		resolved.modulePath,
		depth,
		visited,
	);
};

const reachCache = new Map<string, Promise<ReachResult>>();

const reachFromPage = (
	importer: ParsedFile,
	binding: ImportBinding,
): Promise<ReachResult> => {
	const key = `${importer.absolutePath}|${binding.module}#${binding.exportedName}`;
	let cached = reachCache.get(key);
	if (!cached) {
		cached = reachBinding(importer, binding, 0, new Set());
		reachCache.set(key, cached);
	}
	return cached;
};

// ---------------------------------------------------------------------------
// Exemptions
// ---------------------------------------------------------------------------

const MARKER_FIRST_LINE = /^(?:\/\/|\/\*+)\s*preload-exempt\b:?(.*)$/;
const MARKER_LINE_START = /^[ \t]*(?:\/\/|\/\*+)[ \t]*preload-exempt\b/gm;

interface ExemptionState {
	/** Every `preload-exempt` marker in a visited page file, by `file:pos`. */
	markers: Map<string, string>;
	consumed: Set<string>;
	/** `file:line` of each consumed marker — the exemption inventory. */
	inventory: Set<string>;
	/** `<route> <file>#<binding>` of each closed-drawer skip in force. */
	closedDrawer: Set<string>;
	violations: Set<string>;
}

const recordMarkers = (file: ParsedFile, state: ExemptionState): void => {
	const { text } = file.sourceFile;
	for (const match of text.matchAll(MARKER_LINE_START)) {
		const pos = match.index + match[0].search(/\S/);
		state.markers.set(
			`${file.relativePath}:${pos}`,
			`${file.relativePath}:${file.sourceFile.getLineAndCharacterOfPosition(pos).line + 1}`,
		);
	}
};

/** Reads the marker above the call's enclosing statement. An exempt call is
 * skipped by the caller before any key resolution. */
const isExempt = (
	file: ParsedFile,
	call: ts.Node,
	state: ExemptionState,
): boolean => {
	const statement = enclosingStatement(call);
	const ranges =
		ts.getLeadingCommentRanges(
			file.sourceFile.text,
			statement.getFullStart(),
		) ?? [];
	let exempt = false;
	for (const range of ranges) {
		const text = file.sourceFile.text.slice(range.pos, range.end);
		const match = MARKER_FIRST_LINE.exec(text.split('\n')[0] ?? '');
		if (!match) {
			continue;
		}
		exempt = true;
		const key = `${file.relativePath}:${range.pos}`;
		state.consumed.add(key);
		const where = `${file.relativePath}:${file.sourceFile.getLineAndCharacterOfPosition(range.pos).line + 1}`;
		state.inventory.add(where);
		const reason = (match[1] ?? '').replace(/\*\/\s*$/, '').trim();
		if (reason === '') {
			state.violations.add(
				`${where}: « preload-exempt » has no reason — write « // preload-exempt: <why a hover cannot warm this> » (#2340)`,
			);
		}
	}
	return exempt;
};

// ---------------------------------------------------------------------------
// Page file set (import graph)
// ---------------------------------------------------------------------------

const relativeImportSpecifiers = (sourceFile: ts.SourceFile): string[] => {
	const specifiers: string[] = [];
	const visit = (node: ts.Node): void => {
		if (
			(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
			node.moduleSpecifier &&
			ts.isStringLiteral(node.moduleSpecifier) &&
			!/^(?:import|export)\s+type\b/.test(node.getText(sourceFile))
		) {
			specifiers.push(node.moduleSpecifier.text);
		} else if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments[0] &&
			ts.isStringLiteralLike(node.arguments[0])
		) {
			specifiers.push(node.arguments[0].text);
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return specifiers.filter(
		(specifier) => specifier.startsWith('./') || specifier.startsWith('../'),
	);
};

const declaresRoute = (file: ParsedFile): boolean =>
	file.sourceFile.text.includes('createFileRoute') &&
	findCreateFileRouteCall(file.sourceFile) !== undefined;

const collectPageFiles = async (
	routeFile: ParsedFile,
	routesDir: string,
	violations: Set<string>,
): Promise<ParsedFile[]> => {
	const files = new Map<string, ParsedFile>([
		[routeFile.absolutePath, routeFile],
	]);
	const queue = [routeFile];
	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) {
			break;
		}
		for (const specifier of relativeImportSpecifiers(current.sourceFile)) {
			const resolved = resolveModuleFile(current.absolutePath, specifier);
			if (
				!resolved ||
				files.has(resolved.absolutePath) ||
				path.relative(routesDir, resolved.absolutePath).startsWith('..')
			) {
				continue;
			}
			let imported: ParsedFile;
			try {
				imported = await parseFile(resolved.absolutePath);
			} catch (error) {
				violations.add(
					`${current.relativePath}: guard could not parse '${specifier}': ${error instanceof Error ? error.message : String(error)}`,
				);
				continue;
			}
			// A child route is its own route: its queries are its loader's.
			if (declaresRoute(imported)) {
				continue;
			}
			files.set(resolved.absolutePath, imported);
			queue.push(imported);
		}
	}
	return [...files.values()];
};

// ---------------------------------------------------------------------------
// Page keys (both collectors)
// ---------------------------------------------------------------------------

interface PageKey {
	identity: QueryKeyIdentity;
	where: string;
}

const collectPageKeys = async (
	pageFiles: readonly ParsedFile[],
	skipLibCalls: ReadonlyMap<string, ReadonlySet<string>>,
	pinnedModules: ReadonlySet<string>,
	state: ExemptionState,
): Promise<{ keys: PageKey[]; errors: string[] }> => {
	const keys: PageKey[] = [];
	const errors: string[] = [];

	for (const file of pageFiles) {
		const calls: { node: ts.Node; name: string }[] = [];
		const visit = (node: ts.Node): void => {
			if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
				calls.push({ node, name: node.expression.text });
			} else if (
				(ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
				ts.isIdentifier(node.tagName)
			) {
				calls.push({ node, name: node.tagName.text });
			}
			ts.forEachChild(node, visit);
		};
		visit(file.sourceFile);

		for (const { node, name } of calls) {
			const where = `${file.relativePath}:${lineOf(file, node)}`;
			if (DIRECT_QUERY_HOOKS.has(name) && ts.isCallExpression(node)) {
				if (isExempt(file, node, state)) {
					continue;
				}
				const resolved = identityOfQueryCall(node, file, 'local');
				if (resolved.identity) {
					keys.push({ identity: resolved.identity, where });
				} else if (resolved.error) {
					errors.push(resolved.error);
				}
				continue;
			}

			const binding = file.bindings.get(name);
			if (
				!binding ||
				binding.exportedName === 'default' ||
				!isLibModule(binding.module) ||
				pinnedModules.has(binding.module) ||
				skipLibCalls.get(file.relativePath)?.has(name)
			) {
				continue;
			}
			const reached = await reachFromPage(file, binding);
			if (reached.identities.length === 0 && reached.errors.length === 0) {
				// A mutation, a key helper, an invalidator: no query reached.
				continue;
			}
			if (isExempt(file, node, state)) {
				continue;
			}
			for (const identity of reached.identities) {
				keys.push({ identity, where });
			}
			errors.push(...reached.errors.map((error) => `${where}: ${error}`));
		}
	}
	return { keys, errors };
};

// ---------------------------------------------------------------------------
// Loader keys from the helper's spec argument
// ---------------------------------------------------------------------------

const findPreloadCalls = (body: ts.Node): ts.CallExpression[] => {
	const calls: ts.CallExpression[] = [];
	const visit = (node: ts.Node): void => {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'preloadRouteQueries'
		) {
			calls.push(node);
		}
		ts.forEachChild(node, visit);
	};
	visit(body);
	return calls;
};

interface SpecResult {
	identities: QueryKeyIdentity[];
	errors: string[];
}

const stripWrappers = (expression: ts.Expression): ts.Expression => {
	let node = unwrapParentheses(expression);
	while (
		ts.isAsExpression(node) ||
		ts.isSatisfiesExpression(node) ||
		ts.isNonNullExpression(node)
	) {
		node = unwrapParentheses(node.expression);
	}
	return node;
};

/** The expressions a function returns (`=> expr` or every `return expr` of its
 * own body, nested functions excluded). */
const returnedExpressions = (root: ts.Node): ts.Expression[] => {
	let fn: ts.Node | undefined = root;
	if (ts.isVariableDeclaration(fn)) {
		fn = fn.initializer;
	}
	if (
		!fn ||
		!(
			ts.isArrowFunction(fn) ||
			ts.isFunctionExpression(fn) ||
			ts.isFunctionDeclaration(fn)
		) ||
		!fn.body
	) {
		return [];
	}
	if (!ts.isBlock(fn.body)) {
		return [fn.body];
	}
	const returned: ts.Expression[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isFunctionLike(node)) {
			return;
		}
		if (ts.isReturnStatement(node) && node.expression) {
			returned.push(node.expression);
		}
		ts.forEachChild(node, visit);
	};
	visit(fn.body);
	return returned;
};

/** A `const name = …` declared inside the function (nested functions excluded). */
const localConstInitializer = (
	root: ts.Node,
	name: string,
): ts.Expression | undefined => {
	let found: ts.Expression | undefined;
	const visit = (node: ts.Node): void => {
		if (found || (ts.isFunctionLike(node) && node !== root)) {
			return;
		}
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === name &&
			node.initializer
		) {
			found = node.initializer;
			return;
		}
		ts.forEachChild(node, visit);
	};
	visit(root);
	return found;
};

/** The `{ options: <factory>, variables }` entries a spec function RETURNS —
 * resolved from its returned value(s) only (for `.spec`, the `spec` property),
 * through local consts and calls in returned-value position (same file or a
 * relative import, depth-bounded). A leftover literal that is never returned
 * is not a key the loader warms.
 *
 * Conditional returns (`cond ? a : b`) take the UNION of both branches: a
 * branch-gated entry is still a key the loader may warm, so the page must
 * read it (or carry a marker). `options` must be a bare identifier bound to a
 * `lib/**` factory; any other shape is a violation. */
const collectSpecEntries = async (
	specFile: ParsedFile,
	declaration: ts.VariableDeclaration | ts.FunctionDeclaration,
	pick: string | undefined,
	depth: number,
	visited: Set<string>,
): Promise<SpecResult> => {
	const result: SpecResult = { identities: [], errors: [] };
	const root = declarationNode(declaration);
	if (!root) {
		return result;
	}
	const at = (node: ts.Node) =>
		`${specFile.relativePath}:${lineOf(specFile, node)}`;

	const resolve = async (
		raw: ts.Expression,
		wanted: string | undefined,
		hops: number,
	): Promise<void> => {
		const node = stripWrappers(raw);
		if (ts.isConditionalExpression(node)) {
			await resolve(node.whenTrue, wanted, hops);
			await resolve(node.whenFalse, wanted, hops);
		} else if (ts.isIdentifier(node)) {
			const initializer = localConstInitializer(root, node.text);
			if (initializer && hops < MAX_REACH_DEPTH * 4) {
				await resolve(initializer, wanted, hops + 1);
			} else if (node.text !== 'undefined') {
				result.errors.push(
					`${at(node)}: spec value '${node.text}' is not a const of the spec function — the guard cannot resolve it`,
				);
			}
		} else if (ts.isObjectLiteralExpression(node)) {
			if (
				!wanted &&
				objectProperty(node, 'options') &&
				objectProperty(node, 'variables')
			) {
				collectEntry(node);
				return;
			}
			for (const property of node.properties) {
				if (ts.isShorthandPropertyAssignment(property)) {
					if (!wanted || property.name.text === wanted) {
						await resolve(property.name, undefined, hops);
					}
				} else if (ts.isPropertyAssignment(property)) {
					if (
						!wanted ||
						(ts.isIdentifier(property.name) && property.name.text === wanted)
					) {
						await resolve(property.initializer, undefined, hops);
					}
				} else if (ts.isSpreadAssignment(property) && !wanted) {
					await resolve(property.expression, undefined, hops);
				} else if (!wanted) {
					result.errors.push(
						`${at(property)}: spec object member cannot be resolved — the guard reads only plain properties`,
					);
				}
			}
		} else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
			if (depth < MAX_REACH_DEPTH) {
				const nested = await followSpecCall(
					specFile,
					node.expression.text,
					declaration,
					wanted,
					depth,
					visited,
				);
				result.identities.push(...nested.identities);
				result.errors.push(...nested.errors);
			}
		} else {
			result.errors.push(
				`${at(node)}: a returned spec value is a ${ts.SyntaxKind[node.kind]} — the guard cannot resolve it`,
			);
		}
	};

	const collectEntry = (node: ts.ObjectLiteralExpression): void => {
		const property = objectProperty(node, 'options');
		let initializer: ts.Expression | undefined;
		if (property && ts.isPropertyAssignment(property)) {
			initializer = property.initializer;
		} else if (property && ts.isShorthandPropertyAssignment(property)) {
			initializer = property.name;
		}
		if (!initializer || !ts.isIdentifier(initializer)) {
			result.errors.push(
				`${at(node)}: spec entry \`options\` must be a bare lib/query factory identifier — the guard cannot resolve it`,
			);
			return;
		}
		const binding = specFile.bindings.get(initializer.text);
		if (binding && isLibModule(binding.module)) {
			result.identities.push({
				kind: 'factory',
				module: binding.module,
				name: binding.exportedName,
			});
		} else {
			result.errors.push(
				`${at(node)}: spec entry \`options: ${initializer.text}\` is not imported from a lib/** module — a loader may only warm query-options factories`,
			);
		}
	};

	for (const returned of returnedExpressions(root)) {
		await resolve(returned, pick, 0);
	}
	return result;
};

/** A spec composed from another spec function: a same-file declaration or a
 * relative (route-local) import. Library calls are never followed. */
const followSpecCall = async (
	specFile: ParsedFile,
	callee: string,
	current: ts.Node,
	pick: string | undefined,
	depth: number,
	visited: Set<string>,
): Promise<SpecResult> => {
	const empty = { identities: [], errors: [] };
	const binding = specFile.bindings.get(callee);
	let target: ParsedFile = specFile;
	let declaration: ts.VariableDeclaration | ts.FunctionDeclaration | undefined;
	if (binding) {
		if (
			!(binding.specifier ?? '').startsWith('.') ||
			binding.exportedName === 'default'
		) {
			return empty;
		}
		const resolved = resolveModuleFile(
			specFile.absolutePath,
			binding.specifier ?? binding.module,
		);
		if (!resolved) {
			return empty;
		}
		target = await parseFile(resolved.absolutePath);
		declaration = findExportedNamedDeclaration(target, binding.exportedName);
	} else {
		declaration = findLocalLoaderDeclaration(specFile.sourceFile, callee);
	}
	if (!declaration || declaration === current) {
		return empty;
	}
	const key = `${target.absolutePath}#${callee}#${pick ?? ''}`;
	if (visited.has(key)) {
		return empty;
	}
	visited.add(key);
	return collectSpecEntries(target, declaration, pick, depth + 1, visited);
};

// Imported bindings a loader body may call: the preload helper (its spec
// argument is resolved by `collectPreloadKeys`) and pure parse/build helpers
// that hand variables to the spec without warming anything. Any other call to
// an imported binding could warm a key the guard cannot see: a violation.
const SAFE_LOADER_CALLEES = new Set<string>([
	'preloadRouteQueries',
	// Read the cache / build variables only; they never fetch or warm.
	'resolveWorkspaceTenantIdFromCache',
	'buildAuditActionCatalog',
]);
// Re-parses the validated URL search into the typed variables (pure).
const SAFE_SEARCH_PARSER = /^parse[A-Za-z0-9]*SearchParams$/;

const collectOpaqueLoaderCalls = (
	body: ts.Node,
	file: ParsedFile,
): string[] => {
	const specCalls = new Set<ts.Node>();
	for (const call of findPreloadCalls(body)) {
		let argument = call.arguments[1];
		if (argument) {
			argument = unwrapParentheses(argument);
			if (ts.isPropertyAccessExpression(argument)) {
				argument = unwrapParentheses(argument.expression);
			}
			specCalls.add(argument);
		}
	}
	const issues: string[] = [];
	const visit = (node: ts.Node): void => {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			file.bindings.has(node.expression.text) &&
			!SAFE_LOADER_CALLEES.has(node.expression.text) &&
			!SAFE_SEARCH_PARSER.test(node.expression.text) &&
			!specCalls.has(node)
		) {
			issues.push(
				`${file.relativePath}:${lineOf(file, node)}: loader body calls imported '${node.expression.text}' — an opaque helper that could warm query keys the guard cannot see; only preloadRouteQueries, queryClient warming methods and the listed pure helpers are analysable`,
			);
		}
		ts.forEachChild(node, visit);
	};
	visit(body);
	return issues;
};

const collectPreloadKeys = async (
	body: ts.Node,
	definitionFile: ParsedFile,
): Promise<{ identities: QueryKeyIdentity[]; errors: string[] }> => {
	const identities: QueryKeyIdentity[] = [];
	const errors: string[] = [];

	for (const call of findPreloadCalls(body)) {
		const at = `${definitionFile.relativePath}:${lineOf(definitionFile, call)}`;
		let argument = call.arguments[1];
		if (!argument) {
			errors.push(`${at}: preloadRouteQueries is called without a spec`);
			continue;
		}
		argument = unwrapParentheses(argument);
		// `auditLogsQueries(...).spec`: only the returned `spec` value is read.
		let pick: string | undefined;
		if (ts.isPropertyAccessExpression(argument)) {
			pick = argument.name.text;
			argument = unwrapParentheses(argument.expression);
		}
		if (
			!ts.isCallExpression(argument) ||
			!ts.isIdentifier(argument.expression)
		) {
			errors.push(
				`${at}: the spec argument of preloadRouteQueries must be a call to a named spec function — the guard cannot resolve it`,
			);
			continue;
		}
		const name = argument.expression.text;
		const binding = definitionFile.bindings.get(name);
		let specFile = definitionFile;
		let declaration:
			| ts.VariableDeclaration
			| ts.FunctionDeclaration
			| undefined;
		if (binding) {
			const resolved = resolveModuleFile(
				definitionFile.absolutePath,
				binding.specifier ?? binding.module,
			);
			if (!resolved) {
				errors.push(
					`${at}: spec function '${name}' is imported from '${binding.module}' which cannot be resolved to a file`,
				);
				continue;
			}
			specFile = await parseFile(resolved.absolutePath);
			declaration = findExportedNamedDeclaration(
				specFile,
				binding.exportedName,
			);
		} else {
			declaration = findLocalLoaderDeclaration(definitionFile.sourceFile, name);
		}
		if (!declaration) {
			errors.push(
				`${at}: spec function '${name}' has no declaration the guard can read`,
			);
			continue;
		}
		const entries = await collectSpecEntries(
			specFile,
			declaration,
			pick,
			0,
			new Set([`${specFile.absolutePath}#${name}#${pick ?? ''}`]),
		);
		identities.push(...entries.identities);
		errors.push(...entries.errors);
		if (entries.identities.length === 0 && entries.errors.length === 0) {
			errors.push(
				`${at}: spec function '${name}' declares no { options, variables } entry — a loader that warms nothing is a stale loader`,
			);
		}
	}
	return { identities, errors };
};

// ---------------------------------------------------------------------------
// Per-route check and the scan
// ---------------------------------------------------------------------------

export interface GuardResult {
	violations: string[];
	/** Authenticated routes visited. */
	routes: number;
	/** Routes whose loader resolved at least one key. */
	loaderKeys: number;
	/** `file:line` of every `preload-exempt` marker a visited call consumed. */
	exemptions: string[];
	/** The route-keyed closed-drawer skips in force (`CLOSED_DRAWER_FILES`). */
	closedDrawer: string[];
}

const routeIdOf = (routeCall: ts.CallExpression): string | undefined => {
	const first = routeCall.arguments[0];
	return first && ts.isStringLiteralLike(first) ? first.text : undefined;
};

const checkRoute = async (
	routeFile: ParsedFile,
	routeId: string,
	loaderProperty: ts.PropertyAssignment | undefined,
	routesDir: string,
	state: ExemptionState,
	visitedPageFiles: Map<string, ParsedFile>,
): Promise<{ violations: string[]; loaderKeyCount: number }> => {
	const violations: string[] = [];
	const loaderKeys: QueryKeyIdentity[] = [];

	if (loaderProperty) {
		const resolved = await resolveLoader(
			routeFile,
			loaderProperty.initializer,
			2,
		);
		if ('error' in resolved) {
			violations.push(resolved.error);
		} else {
			const legacy = collectLoaderKeySites(
				resolved.body,
				resolved.definitionFile,
			);
			const preload = await collectPreloadKeys(
				resolved.body,
				resolved.definitionFile,
			);
			loaderKeys.push(...legacy.identities, ...preload.identities);
			violations.push(
				...collectOpaqueLoaderCalls(resolved.body, resolved.definitionFile),
				...legacy.errors.map((error) => `${routeFile.relativePath}: ${error}`),
				...preload.errors,
			);
		}
	}

	const pageFiles = await collectPageFiles(
		routeFile,
		routesDir,
		state.violations,
	);
	if (routeId === LAYOUT_ROUTE_ID) {
		for (const relative of APP_SHELL_PAGE_FILES) {
			const absolute = path.join(srcDir, relative);
			if (!existsSync(absolute)) {
				violations.push(
					`${routeFile.relativePath}: pinned app-shell file '${relative}' does not exist`,
				);
				continue;
			}
			pageFiles.push(await parseFile(absolute));
		}
	}

	const pageFileByPath = new Map(
		pageFiles.map((file) => [file.relativePath, file]),
	);
	const closedDrawer = new Map<string, ReadonlySet<string>>();
	for (const { file: relative, bindings } of CLOSED_DRAWER_FILES.get(routeId) ??
		[]) {
		const pageFile = pageFileByPath.get(relative);
		const missing = pageFile
			? bindings.filter((name) => !pageFile.bindings.has(name))
			: bindings;
		if (!pageFile || missing.length > 0) {
			violations.push(
				`${routeFile.relativePath}: closed-drawer rule for '${relative}' (${missing.join(', ')}) is stale — the route's page graph no longer reaches it`,
			);
			continue;
		}
		closedDrawer.set(relative, new Set(bindings));
		for (const name of bindings) {
			state.closedDrawer.add(`${routeId} ${relative}#${name}`);
		}
	}

	for (const file of pageFiles) {
		if (!visitedPageFiles.has(file.absolutePath)) {
			visitedPageFiles.set(file.absolutePath, file);
			recordMarkers(file, state);
		}
	}

	const pinnedModules = new Set(
		APP_SHELL_PAGE_FILES.map((relative) => relative.replace(/\.tsx?$/, '')),
	);
	const { keys: pageKeys, errors } = await collectPageKeys(
		pageFiles,
		closedDrawer,
		pinnedModules,
		state,
	);
	violations.push(...errors);

	const loaderKeySet = new Set(loaderKeys.map(identityKey));
	const pageKeySet = new Set(pageKeys.map((key) => identityKey(key.identity)));
	for (const key of pageKeys) {
		if (!loaderKeySet.has(identityKey(key.identity))) {
			violations.push(
				`${key.where}: the page renders query ${identityToString(key.identity)} but the route loader (${routeFile.relativePath}) never warms it — add it to the route's query spec or mark the call with « // preload-exempt: <reason> » (#2340)`,
			);
		}
	}
	for (const key of loaderKeys) {
		if (!pageKeySet.has(identityKey(key))) {
			violations.push(
				`${routeFile.relativePath}:${loaderProperty ? lineOf(routeFile, loaderProperty) : 1}: loader preloads query ${identityToString(key)} that the route's page never renders — a loader must be a subset of the page's own query keys (#851/#1552/#2340)`,
			);
		}
	}

	return { violations, loaderKeyCount: loaderKeySet.size };
};

export const scanRoutes = async (
	options: { routesDir?: string } = {},
): Promise<GuardResult> => {
	const routesDir = options.routesDir ?? defaultRoutesDir;
	const violations = new Set<string>();
	const state: ExemptionState = {
		markers: new Map(),
		consumed: new Set(),
		inventory: new Set(),
		closedDrawer: new Set(),
		violations,
	};
	const visitedPageFiles = new Map<string, ParsedFile>();
	const allLoaderKeys = new Set<string>();
	let routes = 0;

	for (const absolutePath of (await collectFiles(routesDir)).sort()) {
		const source = await readSource(absolutePath);
		// Cheap pre-filter: only route files declare `createFileRoute`.
		if (!source.includes('createFileRoute')) {
			continue;
		}
		let routeFile: ParsedFile;
		try {
			routeFile = await parseFile(absolutePath);
		} catch (error) {
			violations.add(
				`${path.relative(srcDir, absolutePath).split(path.sep).join('/')}: guard could not parse the route: ${error instanceof Error ? error.message : String(error)}`,
			);
			continue;
		}
		const routeCall = findCreateFileRouteCall(routeFile.sourceFile);
		const routeId = routeCall ? routeIdOf(routeCall) : undefined;
		if (
			!routeCall ||
			routeId === undefined ||
			!routeId.startsWith(LAYOUT_ROUTE_ID)
		) {
			continue;
		}
		routes += 1;
		const checked = await checkRoute(
			routeFile,
			routeId,
			findLoaderProperty(routeCall),
			routesDir,
			state,
			visitedPageFiles,
		);
		for (const violation of checked.violations) {
			violations.add(violation);
		}
		if (checked.loaderKeyCount > 0) {
			allLoaderKeys.add(routeId);
		}
	}

	for (const [key, where] of state.markers) {
		if (!state.consumed.has(key)) {
			violations.add(
				`${where}: stale « preload-exempt » — no query call in this page graph is covered by it any more (#2340)`,
			);
		}
	}

	return {
		violations: [...violations].sort(),
		routes,
		loaderKeys: allLoaderKeys.size,
		exemptions: [...state.inventory].sort(),
		closedDrawer: [...state.closedDrawer].sort(),
	};
};
