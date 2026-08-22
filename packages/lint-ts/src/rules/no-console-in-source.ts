import type { Context, Fix, Fixer, Visitor } from '@oxlint/plugins';

import { isFrontSourceFile, normalizeFilename } from './path-scopes.js';

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

const isLoggerImport = (node: {
	type: string;
	source?: { value?: unknown };
}): boolean =>
	node.type === 'ImportDeclaration' &&
	node.source?.value === LOGGER_IMPORT_SOURCE;

const hasLoggerSpecifier = (node: {
	type: string;
	specifiers?: Array<{
		type: string;
		imported?: { name?: string };
		local?: { name?: string };
	}>;
}): boolean =>
	(node.specifiers ?? []).some(
		(s) =>
			s.type === 'ImportSpecifier' &&
			s.imported?.name === 'logger' &&
			s.local?.name === 'logger',
	);

const isConsoleIdentifier = (
	node: { type: string; name?: string } | null | undefined,
): boolean => node?.type === 'Identifier' && node.name === 'console';

const hasConsoleImportSpecifier = (node: {
	type: string;
	specifiers?: Array<{ local?: { type: string; name?: string } }>;
}): boolean =>
	node.type === 'ImportDeclaration' &&
	(node.specifiers ?? []).some((s) =>
		isConsoleIdentifier(s.local as { type: string; name?: string } | undefined),
	);

const hasConsoleParam = (node: {
	type: string;
	params?: unknown[];
}): boolean => {
	if (
		node.type !== 'FunctionDeclaration' &&
		node.type !== 'FunctionExpression' &&
		node.type !== 'ArrowFunctionExpression'
	) {
		return false;
	}
	return (node.params ?? []).some((p) =>
		isConsoleIdentifier(p as { type: string; name?: string } | undefined),
	);
};

const hasConsoleVariableDeclarator = (node: {
	type: string;
	id?: { type: string; name?: string };
}): boolean =>
	node.type === 'VariableDeclarator' &&
	isConsoleIdentifier(node.id as { type: string; name?: string } | undefined);

// oxlint AST nodes have [key: string]: unknown at runtime
interface AstNode {
	type: string;
	[key: string]: unknown;
}

const nodeHasConsoleShadow = (
	node: AstNode,
	visited: WeakSet<AstNode> = new WeakSet(),
): boolean => {
	if (visited.has(node)) {
		return false;
	}
	visited.add(node);

	if (
		hasConsoleImportSpecifier(
			node as unknown as {
				type: string;
				specifiers?: { local?: { type: string; name?: string } }[];
			},
		) ||
		hasConsoleParam(node as unknown as { type: string; params?: unknown[] }) ||
		hasConsoleVariableDeclarator(
			node as unknown as { type: string; id?: { type: string; name?: string } },
		)
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
					nodeHasConsoleShadow(child as AstNode, visited)
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
			nodeHasConsoleShadow(value as AstNode, visited)
		) {
			return true;
		}
	}

	return false;
};

const getConsoleMethod = (callee: {
	type: string;
	object?: { type: string; name?: string };
	property?: { type: string; name?: string };
	computed?: boolean;
}): string | null => {
	if (callee.type !== 'MemberExpression' || callee.computed) {
		return null;
	}

	if (
		callee.object?.type !== 'Identifier' ||
		callee.object.name !== 'console'
	) {
		return null;
	}

	if (callee.property?.type !== 'Identifier') {
		return null;
	}

	const method = callee.property.name;
	return method !== undefined && CONSOLE_METHODS.has(method) ? method : null;
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

		let program: AstNode | null = null;
		let hasLoggerImport = false;
		let hasConsoleShadow = false;

		return {
			Program(node) {
				program = node as unknown as AstNode;
				hasLoggerImport = (node.body as unknown as AstNode[]).some(
					(statement: AstNode) =>
						isLoggerImport(
							statement as unknown as {
								type: string;
								source?: { value?: unknown };
							},
						) &&
						hasLoggerSpecifier(
							statement as unknown as {
								type: string;
								specifiers?: {
									type: string;
									imported?: { name?: string };
									local?: { name?: string };
								}[];
							},
						),
				);
				hasConsoleShadow = nodeHasConsoleShadow(program);
			},
			CallExpression(n) {
				const callee = n.callee as unknown as {
					type: string;
					object?: { type: string; name?: string };
					property?: { type: string; name?: string };
					computed?: boolean;
				};
				const method = getConsoleMethod(callee);
				if (method === null) return;

				if (hasConsoleShadow) return;

				context.report({
					node: n,
					messageId: 'unexpected',
					data: { method },
					fix(fixer: Fixer): Fix[] {
						const fixes: Fix[] = [];

						fixes.push(
							fixer.replaceText(
								callee as unknown as {
									range: [number, number];
									type: string;
									[key: string]: unknown;
								},
								`logger.${method}`,
							),
						);

						if (!hasLoggerImport && program) {
							fixes.push(
								fixer.insertTextBefore(
									program as unknown as {
										range: [number, number];
										type: string;
										[key: string]: unknown;
									},
									LOGGER_IMPORT,
								),
							);
						}

						return fixes;
					},
				});
			},
		};
	},
};
