import type { Context, Fix, Fixer, Visitor } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

import { isImportDeclaration } from '../lib/ast.ts';
import { isFrontSourceFile, normalizeFilename } from './path-scopes.ts';

/**
 * `publy/no-console-in-source` - rewrite source `console.<method>(...)` calls to
 * the repo logger.
 *
 * The rule is intentionally scoped to application/source package files and is
 * enabled in `.oxlintrc.json` at error level. It does not report test files,
 * scripts, server scripts, or obvious Node CLI entrypoints.
 */
const LOGGER_IMPORT_SOURCE = '@org/shared-ts/lib/logger/iso-logger';
const LOGGER_IMPORT = `import { logger } from '${LOGGER_IMPORT_SOURCE}';\n`;
const CONSOLE_METHODS: ReadonlySet<string> = new Set([
	'log',
	'warn',
	'error',
	'info',
	'debug',
	'trace',
]);

const getContextFilename = (context: Context): string => {
	if (typeof context.filename === 'string') {
		return context.filename;
	}
	return '';
};

const isTestFile = (filename: string): boolean =>
	/(?:^|\/)[^/]+\.(?:test|spec)\.(?:ts|tsx|jsx|mjs|js)$/.test(filename);

const isSharedSourceFile = (filename: string): boolean =>
	filename.startsWith('packages/shared-ts/src/') ||
	filename.includes('/packages/shared-ts/src/');

const isSharedScriptFile = (filename: string): boolean =>
	filename.startsWith('packages/shared-ts/src/scripts/') ||
	filename.includes('/packages/shared-ts/src/scripts/');

const isFrontServerFile = (filename: string): boolean =>
	filename.startsWith('apps/old-front/server/') ||
	filename.includes('/apps/old-front/server/');

const isNodeCliFile = (filename: string): boolean =>
	/(?:^|\/)(?:bin|cli)\//.test(filename) ||
	/(?:^|\/)[^/]+\.cli\.(?:ts|tsx|mjs|js)$/.test(filename);

const hasNodeShebang = (context: Context): boolean =>
	context.sourceCode?.text?.startsWith('#!') === true;

const shouldCheckFile = (rawFilename: string): boolean => {
	const filename = normalizeFilename(rawFilename);

	if (
		isTestFile(filename) ||
		isSharedScriptFile(filename) ||
		isFrontServerFile(filename) ||
		isNodeCliFile(filename)
	) {
		return false;
	}

	return isFrontSourceFile(filename) || isSharedSourceFile(filename);
};

const isLoggerImport = (node: ESTree.ImportDeclaration): boolean =>
	node.source.value === LOGGER_IMPORT_SOURCE;

const hasLoggerSpecifier = (node: ESTree.ImportDeclaration): boolean =>
	(node.specifiers ?? []).some(
		(s) =>
			s.type === 'ImportSpecifier' &&
			s.imported.type === 'Identifier' &&
			s.imported.name === 'logger' &&
			s.local.name === 'logger',
	);

const isConsoleIdentifier = (node: ESTree.Node | null | undefined): boolean =>
	node !== null &&
	node !== undefined &&
	node.type === 'Identifier' &&
	(node as ESTree.IdentifierName).name === 'console';

const hasConsoleImportSpecifier = (node: ESTree.ImportDeclaration): boolean =>
	node.specifiers.some((s) => isConsoleIdentifier(s.local));

const hasConsoleParam = (
	node: ESTree.Function | ESTree.ArrowFunctionExpression,
): boolean => {
	return node.params.some((p) => isConsoleIdentifier(p));
};

const hasConsoleVariableDeclarator = (
	node: ESTree.VariableDeclarator,
): boolean => isConsoleIdentifier(node.id);

/**
 * Recursively walk an AST node looking for a `console` shadow — either an
 * import of `console`, a function parameter named `console`, or a variable
 * declarator binding `console`.
 */
const nodeHasConsoleShadow = (
	node: ESTree.Node,
	visited: WeakSet<ESTree.Node> = new WeakSet(),
): boolean => {
	if (visited.has(node)) {
		return false;
	}
	visited.add(node);

	const isFunc =
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression';

	if (
		(isImportDeclaration(node) && hasConsoleImportSpecifier(node)) ||
		(isFunc &&
			hasConsoleParam(
				node as ESTree.Function | ESTree.ArrowFunctionExpression,
			)) ||
		(node.type === 'VariableDeclarator' && hasConsoleVariableDeclarator(node))
	) {
		return true;
	}

	for (const value of Object.values(node)) {
		if (Array.isArray(value)) {
			for (const child of value) {
				if (
					child !== null &&
					typeof child === 'object' &&
					'type' in child &&
					nodeHasConsoleShadow(child as ESTree.Node, visited)
				) {
					return true;
				}
			}
			continue;
		}

		if (
			value !== null &&
			typeof value === 'object' &&
			'type' in value &&
			nodeHasConsoleShadow(value as ESTree.Node, visited)
		) {
			return true;
		}
	}

	return false;
};

const getConsoleMethod = (callee: ESTree.MemberExpression): string | null => {
	if (callee.computed) {
		return null;
	}

	// StaticMemberExpression — object and property are typed
	const obj = callee.object;
	if (obj.type !== 'Identifier' || obj.name !== 'console') {
		return null;
	}

	const prop = callee.property;
	if (prop.type !== 'Identifier') {
		return null;
	}

	const method = prop.name;
	if (CONSOLE_METHODS.has(method)) {
		return method;
	}
	return null;
};

export const noConsoleInSource = {
	meta: {
		type: 'problem' as const,
		docs: {
			description:
				'Disallow console calls in PublyApp source files; use the shared logger instead.',
			recommended: false,
		},
		fixable: 'code' as const,
		schema: [],
		messages: {
			unexpected:
				'Use `logger.{{method}}(...)` instead of `console.{{method}}(...)` in source files.',
		},
	},
	create(context: Context): Visitor {
		if (
			!shouldCheckFile(getContextFilename(context)) ||
			hasNodeShebang(context)
		) {
			return {};
		}

		let program: ESTree.Program | null = null;
		let hasLoggerImport = false;
		let hasConsoleShadow = false;

		return {
			Program(node) {
				program = node;
				hasLoggerImport = node.body.some((statement) => {
					if (!isImportDeclaration(statement)) return false;
					return isLoggerImport(statement) && hasLoggerSpecifier(statement);
				});
				hasConsoleShadow = nodeHasConsoleShadow(program);
			},
			CallExpression(n) {
				const callee = n.callee;

				if (callee.type !== 'MemberExpression') {
					return;
				}

				const method = getConsoleMethod(callee);
				if (method === null) return;

				if (hasConsoleShadow) return;

				context.report({
					node: n,
					messageId: 'unexpected',
					data: { method },
					fix(fixer: Fixer): Fix[] {
						const fixes: Fix[] = [];

						fixes.push(fixer.replaceText(callee, `logger.${method}`));

						if (!hasLoggerImport && program) {
							fixes.push(fixer.insertTextBefore(program, LOGGER_IMPORT));
						}

						return fixes;
					},
				});
			},
		};
	},
};
