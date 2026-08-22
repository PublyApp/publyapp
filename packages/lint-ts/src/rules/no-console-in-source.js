/**
 * `publy/no-console-in-source` - rewrite source `console.<method>(...)` calls to
 * the repo logger.
 *
 * The rule is intentionally scoped to application/source package files and is
 * enabled in `.oxlintrc.json` at error level. It does not report test files,
 * scripts, or obvious Node CLI entrypoints.
 *
 * Known phase-one limitation: `globalThis.console.<method>(...)` is not
 * reported; only direct global `console.<method>(...)` calls are rewritten.
 */
import { isFrontSourceFile, normalizeFilename } from './path-scopes.js';

const LOGGER_IMPORT_SOURCE = '@org/shared-ts/lib/logger/iso-logger';
const LOGGER_IMPORT = `import { logger } from '${LOGGER_IMPORT_SOURCE}';\n`;
const CONSOLE_METHODS = new Set([
	'log',
	'warn',
	'error',
	'info',
	'debug',
	'trace',
]);

const getContextFilename = (context) => {
	if (typeof context.filename === 'string') {
		return context.filename;
	}

	if (typeof context.getFilename === 'function') {
		return context.getFilename();
	}

	return '';
};

const exportedName = (node) =>
	node.type === 'Literal' ? node.value : node.name;

const isTestFile = (filename) =>
	/(?:^|\/)[^/]+\.(?:test|spec)\.(?:ts|tsx|jsx|mjs|js)$/.test(filename);

const isSharedSourceFile = (filename) =>
	filename.startsWith('packages/shared-ts/src/') ||
	filename.includes('/packages/shared-ts/src/');

const isSharedScriptFile = (filename) =>
	filename.startsWith('packages/shared-ts/src/scripts/') ||
	filename.includes('/packages/shared-ts/src/scripts/');

const isNodeCliFile = (filename) =>
	/(?:^|\/)(?:bin|cli)\//.test(filename) ||
	/(?:^|\/)[^/]+\.cli\.(?:ts|tsx|mjs|js)$/.test(filename);

const hasNodeShebang = (context) =>
	context.sourceCode?.text?.startsWith('#!') === true;

const shouldCheckFile = (rawFilename) => {
	const filename = normalizeFilename(rawFilename);

	if (
		isTestFile(filename) ||
		isSharedScriptFile(filename) ||
		isNodeCliFile(filename)
	) {
		return false;
	}

	return isFrontSourceFile(filename) || isSharedSourceFile(filename);
};

const isLoggerImport = (node) =>
	node.type === 'ImportDeclaration' &&
	node.source.value === LOGGER_IMPORT_SOURCE;

const hasLoggerSpecifier = (node) =>
	node.specifiers.some(
		(specifier) =>
			specifier.type === 'ImportSpecifier' &&
			exportedName(specifier.imported) === 'logger' &&
			specifier.local.name === 'logger',
	);

const isConsoleIdentifier = (node) =>
	node?.type === 'Identifier' && node.name === 'console';

const hasConsoleImportSpecifier = (node) =>
	node.type === 'ImportDeclaration' &&
	node.specifiers.some((specifier) => isConsoleIdentifier(specifier.local));

const hasConsoleParam = (node) => {
	if (
		node.type !== 'FunctionDeclaration' &&
		node.type !== 'FunctionExpression' &&
		node.type !== 'ArrowFunctionExpression'
	) {
		return false;
	}

	return node.params.some((param) => isConsoleIdentifier(param));
};

const hasConsoleVariableDeclarator = (node) =>
	node.type === 'VariableDeclarator' && isConsoleIdentifier(node.id);

const nodeHasConsoleShadow = (node, visited = new WeakSet()) => {
	if (visited.has(node)) {
		return false;
	}

	visited.add(node);

	if (
		hasConsoleImportSpecifier(node) ||
		hasConsoleParam(node) ||
		hasConsoleVariableDeclarator(node)
	) {
		return true;
	}

	for (const value of Object.values(node)) {
		if (Array.isArray(value)) {
			for (const child of value) {
				if (child?.type && nodeHasConsoleShadow(child, visited)) {
					return true;
				}
			}

			continue;
		}

		if (value?.type && nodeHasConsoleShadow(value, visited)) {
			return true;
		}
	}

	return false;
};

const getConsoleMethod = (callee) => {
	if (callee.type !== 'MemberExpression' || callee.computed) {
		return null;
	}

	if (callee.object.type !== 'Identifier' || callee.object.name !== 'console') {
		return null;
	}

	if (callee.property.type !== 'Identifier') {
		return null;
	}

	const method = callee.property.name;

	return CONSOLE_METHODS.has(method) ? method : null;
};

export const noConsoleInSource = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow console calls in PublyApp source files; use the shared logger instead.',
			recommended: false,
		},
		fixable: 'code',
		schema: [],
		messages: {
			unexpected:
				'Use `logger.{{method}}(...)` instead of `console.{{method}}(...)` in source files.',
		},
	},
	create(context) {
		if (
			!shouldCheckFile(getContextFilename(context)) ||
			hasNodeShebang(context)
		) {
			return {};
		}

		let program = null;
		let hasLoggerImport = false;
		let hasScheduledLoggerImport = false;
		let hasConsoleShadow = false;

		return {
			Program(node) {
				program = node;
				hasLoggerImport = node.body.some(
					(statement) =>
						isLoggerImport(statement) && hasLoggerSpecifier(statement),
				);
				hasConsoleShadow = nodeHasConsoleShadow(node);
			},
			CallExpression(node) {
				if (hasConsoleShadow) {
					return;
				}

				const method = getConsoleMethod(node.callee);

				if (method === null) {
					return;
				}

				context.report({
					node: node.callee,
					messageId: 'unexpected',
					data: { method },
					fix(fixer) {
						const fixes = [fixer.replaceText(node.callee.object, 'logger')];

						if (
							!hasLoggerImport &&
							!hasScheduledLoggerImport &&
							program?.body[0]
						) {
							hasScheduledLoggerImport = true;
							fixes.push(
								fixer.insertTextBefore(program.body[0], LOGGER_IMPORT),
							);
						}

						return fixes;
					},
				});
			},
		};
	},
};
