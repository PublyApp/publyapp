import type { Context, Visitor } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

/**
 * `publy/arrow-function-components` — report React components defined as
 * function declarations rather than arrow function expressions.
 *
 * Rationale (AGENTS.md -> "Frontend Coding Standards"):
 *   "Arrow function components only — never `function` declarations for
 *    components."
 *
 * A PascalCase `FunctionDeclaration` whose body returns a call to a known
 * renderer (`useRender`, `createElement`, `jsx`, `jsxs` — bare or as a React
 * namespace member) is also a component: Base UI components delegate to
 * `useRender(...)` instead of returning JSX directly.
 */

/** Any function-like node that has a body and optional id. */
type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression;

interface ImportInfo {
	reactNamespaces: Set<string>;
	reactImportedNames: Set<string>;
	reactImportedNameToImported: Map<string, string>;
	importedNames: Set<string>;
	localFunctionDecls: Map<string, FunctionNode>;
}

interface BodyAnalysis {
	returnsJsx: boolean;
	returnsOnlyNullOrJsx: boolean;
	callsHook: boolean;
	returnsRendererCall: boolean;
}

const isPascalCase = (name: string): boolean => /^[A-Z]/.test(name);
const isHookLike = (name: string): boolean => /^use[A-Z]/.test(name);
const WRAPPER_FNS: ReadonlySet<string> = new Set(['memo', 'forwardRef']);

// Known renderer functions whose return value indicates the function is a
// component. PascalCase functions returning useRender(...), createElement(...),
// jsx(...), or jsxs(...) are components even without a direct JSX return.
const KNOWN_RENDERERS: ReadonlySet<string> = new Set([
	'useRender',
	'createElement',
	'jsx',
	'jsxs',
]);

const isJsxNode = (node: ESTree.Node | null | undefined): boolean =>
	node !== null &&
	node !== undefined &&
	(node.type === 'JSXElement' || node.type === 'JSXFragment');

const expressionContainsJsx = (
	node: ESTree.Expression | null | undefined,
): boolean => {
	if (!node) return false;
	if (isJsxNode(node)) return true;

	if (node.type === 'ParenthesizedExpression') {
		return expressionContainsJsx(node.expression);
	}

	if (
		node.type === 'TSAsExpression' ||
		node.type === 'TSTypeAssertion' ||
		node.type === 'TSSatisfiesExpression' ||
		node.type === 'TSNonNullExpression'
	) {
		return expressionContainsJsx(node.expression);
	}

	if (node.type === 'ConditionalExpression') {
		return (
			expressionContainsJsx(node.consequent) ||
			expressionContainsJsx(node.alternate)
		);
	}

	if (node.type === 'LogicalExpression') {
		return (
			expressionContainsJsx(node.left) || expressionContainsJsx(node.right)
		);
	}

	return false;
};

const buildImportInfo = (programNode: ESTree.Program): ImportInfo => {
	const reactNamespaces = new Set<string>();
	const reactImportedNames = new Set<string>();
	const reactImportedNameToImported = new Map<string, string>();
	const importedNames = new Set<string>();
	const localFunctionDecls = new Map<string, FunctionNode>();

	const registerLocalFn = (name: string, fnNode: FunctionNode): void => {
		if (name) localFunctionDecls.set(name, fnNode);
	};

	const collectVarDeclarators = (varDecl: ESTree.VariableDeclaration): void => {
		for (const decl of varDecl.declarations) {
			const id = decl.id;
			const name = id.type === 'Identifier' ? id.name : undefined;
			const init = decl.init;
			if (
				name &&
				init &&
				(init.type === 'ArrowFunctionExpression' ||
					init.type === 'FunctionExpression')
			) {
				registerLocalFn(name, init);
			}
		}
	};

	for (const node of programNode.body) {
		if (node.type === 'ImportDeclaration') {
			const source = node.source.value;
			const isReact = source === 'react';

			for (const specifier of node.specifiers) {
				if (
					specifier.type === 'ImportDefaultSpecifier' ||
					specifier.type === 'ImportNamespaceSpecifier'
				) {
					const localName = specifier.local.name;
					if (localName) {
						importedNames.add(localName);
						if (isReact) reactNamespaces.add(localName);
					}
				} else if (specifier.type === 'ImportSpecifier') {
					const localName = specifier.local.name;
					const importedName =
						specifier.imported.type === 'Identifier'
							? specifier.imported.name
							: specifier.imported.value;
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
			let fn: ESTree.Function | null = null;

			if (node.type === 'FunctionDeclaration') {
				fn = node;
			} else if (
				node.type === 'ExportDefaultDeclaration' &&
				node.declaration.type === 'FunctionDeclaration'
			) {
				fn = node.declaration;
			} else if (node.type === 'ExportNamedDeclaration') {
				const decl = node.declaration;
				if (decl && decl.type === 'FunctionDeclaration') {
					fn = decl;
				} else if (decl && decl.type === 'VariableDeclaration') {
					collectVarDeclarators(decl);
				}
			} else if (node.type === 'VariableDeclaration') {
				collectVarDeclarators(node);
			}

			if (fn) {
				const id = fn.id;
				if (id) registerLocalFn(id.name, fn);
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
	body: ESTree.FunctionBody | null | undefined,
	importInfo: ImportInfo,
	recursingFor: Set<string> = new Set(),
): BodyAnalysis => {
	const result: BodyAnalysis = {
		returnsJsx: false,
		returnsOnlyNullOrJsx: true,
		callsHook: false,
		returnsRendererCall: false,
	};
	if (!body) return result;

	const {
		reactNamespaces,
		reactImportedNameToImported,
		importedNames,
		localFunctionDecls,
	} = importInfo;

	/**
	 * Whether a CallExpression callee is a known renderer function
	 * (useRender, createElement, jsx, jsxs) — bare identifier or React
	 * namespace member expression.
	 */
	const isKnownRendererCallee = (
		callee: ESTree.Expression | undefined,
	): boolean => {
		if (!callee) return false;

		if (callee.type === 'Identifier' && KNOWN_RENDERERS.has(callee.name)) {
			return true;
		}

		if (
			callee.type === 'MemberExpression' &&
			callee.object.type === 'Identifier' &&
			reactNamespaces.has(callee.object.name) &&
			callee.property.type === 'Identifier' &&
			KNOWN_RENDERERS.has(callee.property.name)
		) {
			return true;
		}

		return false;
	};

	const isHookCallee = (callee: ESTree.Expression | undefined): boolean => {
		if (!callee) return false;

		if (
			callee.type === 'MemberExpression' &&
			callee.object.type === 'Identifier' &&
			reactNamespaces.has(callee.object.name) &&
			callee.property.type === 'Identifier' &&
			isHookLike(callee.property.name)
		) {
			return true;
		}

		if (callee.type === 'Identifier') {
			const name = callee.name;
			if (reactImportedNameToImported.has(name)) {
				const importedName = reactImportedNameToImported.get(name);
				if (importedName && isHookLike(importedName)) return true;
			}
			if (!isHookLike(name)) return false;
			if (importedNames.has(name)) return true;
			if (localFunctionDecls.has(name)) {
				if (recursingFor.has(name)) return false;
				const localFn = localFunctionDecls.get(name);
				const fnBody = localFn?.body;
				if (!fnBody) return false;
				const next = new Set(recursingFor).add(name);
				if (fnBody.type === 'BlockStatement') {
					return analyseBody(fnBody, importInfo, next).callsHook;
				}
				// Arrow function expression body — check the expression directly
				walkExprForHooks(fnBody);
				return result.callsHook;
			}
			return true;
		}
		return false;
	};

	const walkExprForHooks = (
		expr: ESTree.Expression | null | undefined,
	): void => {
		if (!expr) return;
		if (expr.type === 'CallExpression') {
			const callee = expr.callee;
			if (isHookCallee(callee)) result.callsHook = true;
			for (const arg of expr.arguments) {
				if (arg.type !== 'SpreadElement') walkExprForHooks(arg);
			}
			if (callee.type === 'MemberExpression') walkExprForHooks(callee.object);
		}
		if (expr.type === 'MemberExpression') walkExprForHooks(expr.object);
	};

	const scanStatements = (statements: ESTree.Statement[]): void => {
		for (const stmt of statements) {
			if (!stmt) continue;
			if (stmt.type === 'FunctionDeclaration') continue;

			if (stmt.type === 'VariableDeclaration') {
				for (const decl of stmt.declarations) walkExprForHooks(decl.init);
				continue;
			}
			if (stmt.type === 'ExpressionStatement') {
				walkExprForHooks(stmt.expression);
				continue;
			}
			if (stmt.type === 'ReturnStatement') {
				const arg = stmt.argument;
				if (arg === null || arg === undefined) continue;
				if (expressionContainsJsx(arg)) {
					result.returnsJsx = true;
				} else if (
					arg.type === 'CallExpression' &&
					isKnownRendererCallee(arg.callee)
				) {
					// PascalCase function returning useRender(...), createElement(...),
					// jsx(...), or jsxs(...) — component even without direct JSX.
					result.returnsRendererCall = true;
				} else {
					const isNullLike =
						(arg.type === 'Literal' && arg.value === null) ||
						(arg.type === 'Identifier' && arg.name === 'undefined');
					if (!isNullLike) result.returnsOnlyNullOrJsx = false;
				}
				continue;
			}
			if (stmt.type === 'IfStatement') {
				walkExprForHooks(stmt.test);
				scanStatements([stmt.consequent]);
				if (stmt.alternate) scanStatements([stmt.alternate]);
				continue;
			}
			if (stmt.type === 'BlockStatement') {
				scanStatements(stmt.body);
				continue;
			}
			if (stmt.type === 'WhileStatement' || stmt.type === 'DoWhileStatement') {
				walkExprForHooks(stmt.test);
				scanStatements([stmt.body]);
				continue;
			}
			if (stmt.type === 'ForStatement') {
				walkExprForHooks(stmt.test);
				scanStatements([stmt.body]);
				continue;
			}
			if (stmt.type === 'ForInStatement' || stmt.type === 'ForOfStatement') {
				scanStatements([stmt.body]);
				continue;
			}
			if (stmt.type === 'SwitchStatement') {
				walkExprForHooks(stmt.discriminant);
				for (const c of stmt.cases) scanStatements(c.consequent);
				continue;
			}
			if (stmt.type === 'TryStatement') {
				scanStatements(stmt.block.body);
				const handler = stmt.handler;
				if (handler) scanStatements(handler.body.body);
				const finalizer = stmt.finalizer;
				if (finalizer) scanStatements(finalizer.body);
			}
		}
	};

	scanStatements(body.body);
	return result;
};

const bodyLooksLikeComponent = (
	body: ESTree.FunctionBody | null | undefined,
	importInfo: ImportInfo,
): boolean => {
	const { returnsJsx, returnsOnlyNullOrJsx, callsHook, returnsRendererCall } =
		analyseBody(body, importInfo);
	if (returnsJsx) return true;
	if (returnsRendererCall) return true;
	if (callsHook && returnsOnlyNullOrJsx) return true;
	return false;
};

const isWrapperCall = (
	node: ESTree.Expression | null | undefined,
	importInfo: ImportInfo,
): boolean => {
	if (!node || node.type !== 'CallExpression') return false;

	const { reactNamespaces, reactImportedNames } = importInfo;
	const callee = node.callee;

	if (
		callee.type === 'MemberExpression' &&
		callee.object.type === 'Identifier' &&
		reactNamespaces.has(callee.object.name) &&
		callee.property.type === 'Identifier'
	) {
		return WRAPPER_FNS.has(callee.property.name);
	}

	if (callee.type === 'Identifier') {
		return reactImportedNames.has(callee.name);
	}

	return false;
};

/** Empty program used as a fallback when the Program visitor hasn't fired yet. */
const EMPTY_PROGRAM: ESTree.Program = {
	type: 'Program',
	body: [],
	sourceType: 'module',
	comments: [],
	tokens: [],
	parent: null,
	range: [0, 0],
	start: 0,
	end: 0,
	loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
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
				importInfo = buildImportInfo(node);
			},
			FunctionDeclaration(node) {
				if (node.generator) return;
				const info = importInfo ?? buildImportInfo(EMPTY_PROGRAM);
				const name = node.id?.name;
				const parent = node.parent;

				if (!node.id && parent?.type === 'ExportDefaultDeclaration') {
					if (!bodyLooksLikeComponent(node.body, info)) return;
					context.report({
						node,
						messageId: 'useArrowFunctionAnonymous',
						data: { name: 'default' },
					});
					return;
				}

				if (!name || !isPascalCase(name)) return;
				if (!bodyLooksLikeComponent(node.body, info)) return;
				context.report({
					node,
					messageId: 'useArrowFunction',
					data: { name },
				});
			},
			FunctionExpression(node) {
				if (node.generator) return;
				const parent = node.parent;
				if (!parent) return;
				const info = importInfo ?? buildImportInfo(EMPTY_PROGRAM);

				if (
					parent.type === 'CallExpression' &&
					isWrapperCall(parent, info) &&
					parent.arguments[0] === node
				) {
					if (!bodyLooksLikeComponent(node.body, info)) return;
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
