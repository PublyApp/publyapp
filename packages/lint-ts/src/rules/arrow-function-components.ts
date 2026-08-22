import type { Context, Visitor } from '@oxlint/plugins';

/**
 * `publy/arrow-function-components` — report React components defined as
 * function declarations rather than arrow function expressions.
 *
 * Rationale (AGENTS.md -> "Frontend Coding Standards"):
 *   "Arrow function components only — never `function` declarations for
 *    components."
 */

interface ImportInfo {
	reactNamespaces: Set<string>;
	reactImportedNames: Set<string>;
	reactImportedNameToImported: Map<string, string>;
	importedNames: Set<string>;
	localFunctionDecls: Map<string, { body: unknown; id?: { name?: string } }>;
}

interface BodyAnalysis {
	returnsJsx: boolean;
	returnsOnlyNullOrJsx: boolean;
	callsHook: boolean;
}

// Minimal node shape — oxlint adds parent at runtime, we access via cast
interface LcNode {
	type: string;
	body?: unknown;
	id?: { name?: string };
	generator?: boolean;
	parent?: LcNode;
	[key: string]: unknown;
}

const isPascalCase = (name: string): boolean => /^[A-Z]/.test(name);
const isHookLike = (name: string): boolean => /^use[A-Z]/.test(name);
const WRAPPER_FNS: ReadonlySet<string> = new Set(['memo', 'forwardRef']);

const isJsxNode = (node: LcNode | null | undefined): boolean =>
	node !== null &&
	node !== undefined &&
	(node.type === 'JSXElement' || node.type === 'JSXFragment');

const expressionContainsJsx = (node: LcNode | null | undefined): boolean => {
	if (!node) return false;
	if (isJsxNode(node)) return true;

	if (node.type === 'ParenthesizedExpression') {
		return expressionContainsJsx(node.expression as LcNode);
	}

	if (
		node.type === 'TSAsExpression' ||
		node.type === 'TSTypeAssertion' ||
		node.type === 'TSSatisfiesExpression' ||
		node.type === 'TSNonNullExpression'
	) {
		return expressionContainsJsx(node.expression as LcNode);
	}

	if (node.type === 'ConditionalExpression') {
		return (
			expressionContainsJsx(node.consequent as LcNode) ||
			expressionContainsJsx(node.alternate as LcNode)
		);
	}

	if (node.type === 'LogicalExpression') {
		return (
			expressionContainsJsx(node.left as LcNode) ||
			expressionContainsJsx(node.right as LcNode)
		);
	}

	return false;
};

const buildImportInfo = (programNode: LcNode): ImportInfo => {
	const reactNamespaces = new Set<string>();
	const reactImportedNames = new Set<string>();
	const reactImportedNameToImported = new Map<string, string>();
	const importedNames = new Set<string>();
	const localFunctionDecls = new Map<
		string,
		{ body: unknown; id?: { name?: string } }
	>();

	const registerLocalFn = (
		name: string,
		fnNode: { body: unknown; id?: { name?: string } },
	): void => {
		if (name) localFunctionDecls.set(name, fnNode);
	};

	const collectVarDeclarators = (varDecl: LcNode): void => {
		for (const decl of (varDecl.declarations as LcNode[]) ?? []) {
			const name = (decl.id as { name?: string } | undefined)?.name;
			const init = decl.init as LcNode | undefined;
			if (
				name &&
				init &&
				(init.type === 'ArrowFunctionExpression' ||
					init.type === 'FunctionExpression')
			) {
				registerLocalFn(
					name,
					init as unknown as { body: unknown; id?: { name?: string } },
				);
			}
		}
	};

	for (const node of (programNode.body as LcNode[]) ?? []) {
		if (node.type === 'ImportDeclaration') {
			const source = String((node.source as LcNode | undefined)?.value ?? '');
			const isReact = source === 'react';

			for (const specifier of (node.specifiers as LcNode[]) ?? []) {
				if (
					specifier.type === 'ImportDefaultSpecifier' ||
					specifier.type === 'ImportNamespaceSpecifier'
				) {
					const localName = (specifier.local as LcNode | undefined)?.name as
						| string
						| undefined;
					if (localName) {
						importedNames.add(localName);
						if (isReact) reactNamespaces.add(localName);
					}
				} else if (specifier.type === 'ImportSpecifier') {
					const local = specifier.local as LcNode | undefined;
					const imported = specifier.imported as LcNode | undefined;
					const localName = local?.name as string | undefined;
					const importedName = (imported?.name ?? local?.name) as
						| string
						| undefined;
					if (localName) {
						importedNames.add(localName);
						if (isReact && importedName) {
							reactImportedNameToImported.set(localName, importedName);
							if (WRAPPER_FNS.has(importedName)) {
								reactImportedNames.add(localName);
							}
						}
					}
				}
			}
		} else {
			let fn: LcNode | null = null;

			if (node.type === 'FunctionDeclaration') {
				fn = node;
			} else if (
				node.type === 'ExportDefaultDeclaration' &&
				(node.declaration as LcNode | undefined)?.type === 'FunctionDeclaration'
			) {
				fn = node.declaration as LcNode;
			} else if (node.type === 'ExportNamedDeclaration') {
				const decl = node.declaration as LcNode | undefined;
				if (decl?.type === 'FunctionDeclaration') {
					fn = decl;
				} else if (decl?.type === 'VariableDeclaration') {
					collectVarDeclarators(decl);
				}
			} else if (node.type === 'VariableDeclaration') {
				collectVarDeclarators(node);
			}

			if (fn) {
				const id = fn.id as { name?: string } | undefined;
				if (id?.name)
					registerLocalFn(
						id.name,
						fn as unknown as { body: unknown; id?: { name?: string } },
					);
			}
		}
	}

	return {
		reactNamespaces,
		reactImportedNames,
		reactImportedNameToImported,
		importedNames,
		localFunctionDecls,
	};
};

const analyseBody = (
	body: LcNode | null | undefined,
	importInfo: ImportInfo,
	recursingFor: Set<string> = new Set(),
): BodyAnalysis => {
	const result: BodyAnalysis = {
		returnsJsx: false,
		returnsOnlyNullOrJsx: true,
		callsHook: false,
	};
	if (!body) return result;

	const {
		reactNamespaces,
		reactImportedNameToImported,
		importedNames,
		localFunctionDecls,
	} = importInfo;

	const isHookCallee = (callee: LcNode | undefined): boolean => {
		if (!callee) return false;

		if (
			callee.type === 'MemberExpression' &&
			(callee.object as LcNode | undefined)?.type === 'Identifier' &&
			reactNamespaces.has((callee.object as LcNode).name as string) &&
			(callee.property as LcNode | undefined)?.type === 'Identifier' &&
			isHookLike((callee.property as LcNode).name as string)
		) {
			return true;
		}

		if (callee.type === 'Identifier') {
			const name = callee.name as string;
			if (reactImportedNameToImported.has(name)) {
				const importedName = reactImportedNameToImported.get(name);
				if (importedName && isHookLike(importedName)) return true;
			}
			if (!isHookLike(name)) return false;
			if (importedNames.has(name)) return true;
			if (localFunctionDecls.has(name)) {
				if (recursingFor.has(name)) return false;
				const localFn = localFunctionDecls.get(name);
				const next = new Set(recursingFor).add(name);
				return analyseBody(localFn?.body as LcNode, importInfo, next).callsHook;
			}
			return true;
		}
		return false;
	};

	const walkExprForHooks = (expr: LcNode | null | undefined): void => {
		if (!expr) return;
		if (expr.type === 'CallExpression') {
			const callee = expr.callee as LcNode | undefined;
			if (isHookCallee(callee)) result.callsHook = true;
			for (const arg of (expr.arguments as LcNode[]) ?? [])
				walkExprForHooks(arg);
			if (callee?.type === 'MemberExpression')
				walkExprForHooks(callee.object as LcNode);
		}
		if (expr.type === 'MemberExpression')
			walkExprForHooks(expr.object as LcNode);
	};

	const scanStatements = (statements: LcNode[]): void => {
		for (const stmt of statements) {
			if (!stmt) continue;
			if (
				stmt.type === 'FunctionDeclaration' ||
				stmt.type === 'FunctionExpression' ||
				stmt.type === 'ArrowFunctionExpression'
			)
				continue;

			if (stmt.type === 'VariableDeclaration') {
				for (const decl of (stmt.declarations as LcNode[]) ?? [])
					walkExprForHooks(decl.init as LcNode);
				continue;
			}
			if (stmt.type === 'ExpressionStatement') {
				walkExprForHooks(stmt.expression as LcNode);
				continue;
			}
			if (stmt.type === 'ReturnStatement') {
				const arg = stmt.argument as LcNode | undefined;
				if (arg === null || arg === undefined) continue;
				if (expressionContainsJsx(arg)) {
					result.returnsJsx = true;
				} else {
					const isNullLike =
						(arg.type === 'Literal' && arg.value === null) ||
						(arg.type === 'Identifier' && arg.name === 'undefined');
					if (!isNullLike) result.returnsOnlyNullOrJsx = false;
				}
				continue;
			}
			if (stmt.type === 'IfStatement') {
				walkExprForHooks(stmt.test as LcNode);
				scanStatements([stmt.consequent as LcNode]);
				if (stmt.alternate) scanStatements([stmt.alternate as LcNode]);
				continue;
			}
			if (stmt.type === 'BlockStatement') {
				scanStatements(stmt.body as LcNode[]);
				continue;
			}
			if (stmt.type === 'WhileStatement' || stmt.type === 'DoWhileStatement') {
				walkExprForHooks(stmt.test as LcNode);
				scanStatements([stmt.body as LcNode]);
				continue;
			}
			if (stmt.type === 'ForStatement') {
				walkExprForHooks(stmt.test as LcNode);
				scanStatements([stmt.body as LcNode]);
				continue;
			}
			if (stmt.type === 'ForInStatement' || stmt.type === 'ForOfStatement') {
				scanStatements([stmt.body as LcNode]);
				continue;
			}
			if (stmt.type === 'SwitchStatement') {
				walkExprForHooks(stmt.discriminant as LcNode);
				for (const c of (stmt.cases as LcNode[]) ?? [])
					scanStatements(c.consequent as LcNode[]);
				continue;
			}
			if (stmt.type === 'TryStatement') {
				scanStatements(
					((stmt.block as LcNode | undefined)?.body as LcNode[]) ?? [],
				);
				const handler = stmt.handler as LcNode | undefined;
				if (handler)
					scanStatements(
						((handler.body as LcNode | undefined)?.body as LcNode[]) ?? [],
					);
				const finalizer = stmt.finalizer as LcNode | undefined;
				if (finalizer) scanStatements((finalizer.body as LcNode[]) ?? []);
			}
		}
	};

	if (body.type !== 'BlockStatement') {
		walkExprForHooks(body);
		return result;
	}

	scanStatements(body.body as LcNode[]);
	return result;
};

const bodyLooksLikeComponent = (
	body: LcNode | null | undefined,
	importInfo: ImportInfo,
): boolean => {
	const { returnsJsx, returnsOnlyNullOrJsx, callsHook } = analyseBody(
		body,
		importInfo,
	);
	if (returnsJsx) return true;
	if (callsHook && returnsOnlyNullOrJsx) return true;
	return false;
};

const isWrapperCall = (
	node: LcNode | null | undefined,
	importInfo: ImportInfo,
): boolean => {
	if (!node || node.type !== 'CallExpression') return false;

	const { reactNamespaces, reactImportedNames } = importInfo;
	const callee = node.callee as LcNode | undefined;

	if (
		callee?.type === 'MemberExpression' &&
		(callee.object as LcNode | undefined)?.type === 'Identifier' &&
		reactNamespaces.has((callee.object as LcNode).name as string) &&
		(callee.property as LcNode | undefined)?.type === 'Identifier'
	) {
		return WRAPPER_FNS.has((callee.property as LcNode).name as string);
	}

	if (callee?.type === 'Identifier') {
		return reactImportedNames.has(callee.name as string);
	}

	return false;
};

export const arrowFunctionComponents = {
	meta: {
		type: 'suggestion' as const,
		docs: {
			description:
				'Require React components to be defined as arrow functions, not function declarations.',
			recommended: false,
		},
		schema: [],
		messages: {
			useArrowFunction:
				'React components must be defined as arrow function expressions (const {{name}} = () => ...), not function declarations.',
			useArrowFunctionAnonymous:
				'React components must be defined as arrow function expressions, not anonymous function declarations.',
		},
	},
	create(context: Context): Visitor {
		let importInfo: ImportInfo | null = null;

		return {
			Program(node) {
				importInfo = buildImportInfo(node as unknown as LcNode);
			},
			FunctionDeclaration(node) {
				if (node.generator) return;
				const info =
					importInfo ?? buildImportInfo({ type: 'Program', body: [] });
				const name = node.id?.name;
				const parent = (node as unknown as LcNode).parent;

				if (!node.id && parent?.type === 'ExportDefaultDeclaration') {
					if (!bodyLooksLikeComponent(node.body as unknown as LcNode, info))
						return;
					context.report({
						node,
						messageId: 'useArrowFunctionAnonymous',
						data: { name: 'default' },
					});
					return;
				}

				if (!name || !isPascalCase(name)) return;
				if (!bodyLooksLikeComponent(node.body as unknown as LcNode, info))
					return;
				context.report({ node, messageId: 'useArrowFunction', data: { name } });
			},
			FunctionExpression(node) {
				if (node.generator) return;
				const parent = (node as unknown as LcNode).parent;
				if (!parent) return;
				const info =
					importInfo ?? buildImportInfo({ type: 'Program', body: [] });

				if (
					parent.type === 'CallExpression' &&
					isWrapperCall(parent, info) &&
					(parent.arguments as LcNode[])[0] === (node as unknown as LcNode)
				) {
					if (!bodyLooksLikeComponent(node.body as unknown as LcNode, info))
						return;
					const name = node.id?.name ?? 'Component';
					context.report({
						node,
						messageId: 'useArrowFunction',
						data: { name },
					});
				}
			},
		};
	},
};
