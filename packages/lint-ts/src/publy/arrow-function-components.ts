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
 * A PascalCase `FunctionDeclaration` is a component regardless of HOW it
 * renders — the declaration shape is the signal, not the render call-site:
 *   - a body `return` of JSX (directly, ternary/logical/TS-wrapped);
 *   - a `return` of a known renderer call (`useRender`, `createElement`,
 *     `jsx`, `jsxs` — bare or React namespace member; Base UI components
 *     delegate to `useRender(...)`);
 *   - a `return` delegating to a top-level LOCAL helper whose own body
 *     yields JSX the same way (#1283) — so a `customRender(...)` wrapper
 *     invisible to the renderer list cannot hide a component;
 *   - a `return` delegating to a MEMBER of a top-level LOCAL object literal
 *     whose function member yields JSX the same way (#1293) —
 *     `kit.customRender()` cannot hide a component either;
 *   - or hook calls with only-null/JSX returns.
 *
 * JSX routed through LOCAL VARIABLES is followed too (#1293, #1322): within
 * one function body, `const el = <div/>; ...; return el;` counts as a JSX
 * return — and so does `let el = null; el = <div/>; return el;`, where the
 * JSX reaches the local only through an assignment statement (#1322) —
 * directly or inside a delegated helper/object member. Resolution is
 * statement-order based and deliberately shallow: the LAST JSX-carrying
 * initializer or assignment wins (reassignment order is not modelled), and
 * reads of a property off a JSX-valued variable (`el.type`) are not treated
 * as element returns.
 *
 * Boundaries (documented, heuristic-free by design): callees that cannot be
 * resolved locally (imports, imported namespaces) and COMPUTED member
 * accesses (`kit[name]()`) are not followed; object literals containing a
 * spread are skipped wholesale.
 */

/** Any function-like node that has a body and optional id. */
type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression;

interface ImportInfo {
	reactNamespaces: Set<string>;
	reactImportedNames: Set<string>;
	reactImportedNameToImported: Map<string, string>;
	importedNames: Set<string>;
	localFunctionDecls: Map<string, FunctionNode>;
	/** #1293: top-level local object name -> member name -> function node. */
	localObjectMembers: Map<string, Map<string, FunctionNode>>;
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
	if (!node) {
		return false;
	}
	if (isJsxNode(node)) {
		return true;
	}

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
	const localObjectMembers = new Map<string, Map<string, FunctionNode>>();

	const registerLocalFn = (name: string, fnNode: FunctionNode): void => {
		if (name) {
			localFunctionDecls.set(name, fnNode);
		}
	};

	/**
	 * Collect function-valued members of a top-level local object literal
	 * (#1293). Only static `Identifier` keys mapping to functions are kept;
	 * getters/setters and non-function members are ignored, and ANY spread
	 * makes the whole object unresolvable (its shape is no longer local).
	 */
	const collectObjectMembers = (
		objExpr: ESTree.ObjectExpression,
		into: Map<string, FunctionNode>,
	): void => {
		let resolvable = true;
		for (const prop of objExpr.properties) {
			if (prop.type === 'SpreadElement') {
				resolvable = false;
				break;
			}
			if (
				prop.type !== 'Property' ||
				prop.kind !== 'init' ||
				prop.key.type !== 'Identifier'
			) {
				continue;
			}
			const value = prop.value;
			if (
				value.type === 'ArrowFunctionExpression' ||
				value.type === 'FunctionExpression' ||
				value.type === 'FunctionDeclaration'
			) {
				into.set(prop.key.name, value);
			}
		}
		if (!resolvable) {
			into.clear();
		}
	};

	const collectVarDeclarators = (varDecl: ESTree.VariableDeclaration): void => {
		for (const decl of varDecl.declarations) {
			const id = decl.id;
			const name = id.type === 'Identifier' ? id.name : undefined;
			const init = decl.init;
			if (!name || !init) {
				continue;
			}
			if (
				init.type === 'ArrowFunctionExpression' ||
				init.type === 'FunctionExpression'
			) {
				registerLocalFn(name, init);
			} else if (init.type === 'ObjectExpression') {
				let members = localObjectMembers.get(name);
				if (!members) {
					members = new Map<string, FunctionNode>();
					localObjectMembers.set(name, members);
				}
				collectObjectMembers(init, members);
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
						if (isReact) {
							reactNamespaces.add(localName);
						}
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
				if (id) {
					registerLocalFn(id.name, fn);
				}
			}
		}
	}

	return {
		reactNamespaces,
		reactImportedNames,
		reactImportedNameToImported,
		importedNames,
		localFunctionDecls,
		localObjectMembers,
	};
};

const analyseBody = (
	body: ESTree.FunctionBody | null | undefined,
	importInfo: ImportInfo,
	recursingFor: Set<string> = new Set(),
	visiting: Set<string> = new Set(),
): BodyAnalysis => {
	const result: BodyAnalysis = {
		returnsJsx: false,
		returnsOnlyNullOrJsx: true,
		callsHook: false,
		returnsRendererCall: false,
	};
	if (!body) {
		return result;
	}

	// #1293: names of local variables whose (statement-order) initializer
	// carries JSX in THIS function body. Fresh per analyseBody call, so each
	// analysed function resolves only its own locals.
	const localJsxVars = new Set<string>();

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
		if (!callee) {
			return false;
		}

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
		if (!callee) {
			return false;
		}

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
				if (importedName && isHookLike(importedName)) {
					return true;
				}
			}
			if (!isHookLike(name)) {
				return false;
			}
			if (importedNames.has(name)) {
				return true;
			}
			if (localFunctionDecls.has(name)) {
				if (recursingFor.has(name)) {
					return false;
				}
				const localFn = localFunctionDecls.get(name);
				const fnBody = localFn?.body;
				if (!fnBody) {
					return false;
				}
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
		if (!expr) {
			return;
		}
		if (expr.type === 'CallExpression') {
			const callee = expr.callee;
			if (isHookCallee(callee)) {
				result.callsHook = true;
			}
			for (const arg of expr.arguments) {
				if (arg.type !== 'SpreadElement') {
					walkExprForHooks(arg);
				}
			}
			if (callee.type === 'MemberExpression') {
				walkExprForHooks(callee.object);
			}
		}
		if (expr.type === 'MemberExpression') {
			walkExprForHooks(expr.object);
		}
	};

	const scanStatements = (statements: ESTree.Statement[]): void => {
		for (const stmt of statements) {
			if (!stmt) {
				continue;
			}
			if (stmt.type === 'FunctionDeclaration') {
				continue;
			}

			if (stmt.type === 'VariableDeclaration') {
				for (const decl of stmt.declarations) {
					walkExprForHooks(decl.init);
					// #1293: remember JSX-carrying local variables so a later
					// `return el;` counts as a JSX return.
					if (
						decl.id.type === 'Identifier' &&
						decl.init &&
						expressionContainsJsx(decl.init)
					) {
						localJsxVars.add(decl.id.name);
					}
				}
				continue;
			}
			if (stmt.type === 'ExpressionStatement') {
				walkExprForHooks(stmt.expression);
				// #1322: an AssignmentExpression whose LHS is a plain LOCAL
				// identifier and whose RHS carries JSX marks that variable the
				// same way a JSX-carrying initializer does. Only `=` compounds
				// re-assign the variable itself; member targets are never locals.
				const expr = stmt.expression;
				if (
					expr.type === 'AssignmentExpression' &&
					expr.operator === '=' &&
					expr.left.type === 'Identifier' &&
					expressionContainsJsx(expr.right)
				) {
					localJsxVars.add(expr.left.name);
				}
				continue;
			}
			if (stmt.type === 'ReturnStatement') {
				const arg = stmt.argument;
				if (arg === null || arg === undefined) {
					continue;
				}
				if (expressionContainsJsx(arg)) {
					result.returnsJsx = true;
				} else if (
					arg.type === 'CallExpression' &&
					isKnownRendererCallee(arg.callee)
				) {
					// PascalCase function returning useRender(...), createElement(...),
					// jsx(...), or jsxs(...) — component even without direct JSX.
					result.returnsRendererCall = true;
				} else if (
					arg.type === 'CallExpression' &&
					arg.callee.type === 'Identifier' &&
					isLocalRenderDelegate(arg.callee.name, importInfo, visiting)
				) {
					// #1283: `return someLocalHelper(...)` where the helper's own body
					// yields JSX (directly, through further such helpers, or through a
					// known renderer). The declaration shape is the signal, so a
					// non-allowlisted render wrapper cannot hide the component.
					result.returnsRendererCall = true;
				} else if (
					arg.type === 'CallExpression' &&
					arg.callee.type === 'MemberExpression' &&
					arg.callee.property.type === 'Identifier' &&
					isLocalMemberRenderDelegate(
						arg.callee.object,
						arg.callee.property,
						importInfo,
						visiting,
					)
				) {
					// #1293: `return someLocalObject.member(...)` where the member is a
					// function on a top-level LOCAL object literal and its own body
					// yields JSX the same way.
					result.returnsRendererCall = true;
				} else if (arg.type === 'Identifier' && localJsxVars.has(arg.name)) {
					// #1293: `return el;` where `el` was initialized (earlier in this
					// body) with an expression carrying JSX.
					result.returnsJsx = true;
				} else {
					const isNullLike =
						(arg.type === 'Literal' && arg.value === null) ||
						(arg.type === 'Identifier' && arg.name === 'undefined');
					if (!isNullLike) {
						result.returnsOnlyNullOrJsx = false;
					}
				}
				continue;
			}
			if (stmt.type === 'IfStatement') {
				walkExprForHooks(stmt.test);
				scanStatements([stmt.consequent]);
				if (stmt.alternate) {
					scanStatements([stmt.alternate]);
				}
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
				for (const c of stmt.cases) {
					scanStatements(c.consequent);
				}
				continue;
			}
			if (stmt.type === 'TryStatement') {
				scanStatements(stmt.block.body);
				const handler = stmt.handler;
				if (handler) {
					scanStatements(handler.body.body);
				}
				const finalizer = stmt.finalizer;
				if (finalizer) {
					scanStatements(finalizer.body);
				}
			}
		}
	};

	scanStatements(body.body);
	return result;
};

/**
 * Whether a `return name(...)` call delegates rendering to a top-level LOCAL
 * helper whose own body yields JSX — directly, through further such helpers,
 * through local variables (#1293), or through a known renderer call (#1283).
 * Imported callees are not resolved. `visiting` carries the resolution stack
 * so mutually recursive helpers terminate.
 */
const isLocalRenderDelegate = (
	name: string,
	importInfo: ImportInfo,
	visiting: Set<string>,
): boolean => {
	const { importedNames, localFunctionDecls } = importInfo;
	if (importedNames.has(name)) {
		return false;
	}
	const localFn = localFunctionDecls.get(name);
	if (!localFn) {
		return false;
	}
	if (visiting.has(name)) {
		return false;
	}

	const fnBody = localFn.body;
	if (!fnBody) {
		return false;
	}
	const next = new Set(visiting).add(name);

	if (fnBody.type === 'BlockStatement') {
		const nested = analyseBody(fnBody, importInfo, next, next);
		return nested.returnsJsx || nested.returnsRendererCall;
	}

	// Concise arrow body (`const h = (props) => <div {...props} />`).
	if (expressionContainsJsx(fnBody)) {
		return true;
	}
	if (fnBody.type === 'CallExpression' && fnBody.callee.type === 'Identifier') {
		return isLocalRenderDelegate(fnBody.callee.name, importInfo, next);
	}
	if (
		fnBody.type === 'CallExpression' &&
		fnBody.callee.type === 'MemberExpression'
	) {
		return isLocalMemberRenderDelegate(
			fnBody.callee.object,
			fnBody.callee.property,
			importInfo,
			next,
		);
	}
	return false;
};

/**
 * Whether a member-expression callee (`obj.member(...)`) resolves to a
 * function-valued member of a top-level LOCAL object literal whose own body
 * yields JSX (#1293). Only static `obj.prop` access on a locally declared
 * object is resolved: imported namespaces and COMPUTED access (`obj[name]`)
 * are not followed, and objects containing a spread were never collected.
 * `visiting` carries the resolution stack so cyclic delegates terminate.
 */
const isLocalMemberRenderDelegate = (
	object: ESTree.Expression | ESTree.PrivateIdentifier,
	property: ESTree.Expression | ESTree.PrivateIdentifier,
	importInfo: ImportInfo,
	visiting: Set<string>,
): boolean => {
	if (object.type !== 'Identifier') {
		return false;
	}
	if (property.type !== 'Identifier') {
		return false;
	}
	const { importedNames, localObjectMembers } = importInfo;
	// An imported namespace is never a locally declared object literal.
	if (importedNames.has(object.name)) {
		return false;
	}
	const members = localObjectMembers.get(object.name);
	if (!members) {
		return false;
	}
	const key = `${object.name}.${property.name}` as const;
	const memberFn = members.get(property.name);
	if (!memberFn) {
		return false;
	}
	if (visiting.has(key)) {
		return false;
	}

	const fnBody = memberFn.body;
	if (!fnBody) {
		return false;
	}
	const next = new Set(visiting).add(key);

	if (fnBody.type === 'BlockStatement') {
		const nested = analyseBody(fnBody, importInfo, new Set(), next);
		return nested.returnsJsx || nested.returnsRendererCall;
	}

	// Concise arrow property (`{ customRender: (props) => <b>{props.t}</b> }`).
	if (expressionContainsJsx(fnBody)) {
		return true;
	}
	if (fnBody.type === 'CallExpression' && fnBody.callee.type === 'Identifier') {
		return isLocalRenderDelegate(fnBody.callee.name, importInfo, next);
	}
	if (
		fnBody.type === 'CallExpression' &&
		fnBody.callee.type === 'MemberExpression'
	) {
		return isLocalMemberRenderDelegate(
			fnBody.callee.object,
			fnBody.callee.property,
			importInfo,
			next,
		);
	}
	return false;
};

const bodyLooksLikeComponent = (
	body: ESTree.FunctionBody | null | undefined,
	importInfo: ImportInfo,
): boolean => {
	const { returnsJsx, returnsOnlyNullOrJsx, callsHook, returnsRendererCall } =
		analyseBody(body, importInfo);
	if (returnsJsx) {
		return true;
	}
	if (returnsRendererCall) {
		return true;
	}
	if (callsHook && returnsOnlyNullOrJsx) {
		return true;
	}
	return false;
};

const isWrapperCall = (
	node: ESTree.Expression | null | undefined,
	importInfo: ImportInfo,
): boolean => {
	if (!node || node.type !== 'CallExpression') {
		return false;
	}

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
				if (node.generator) {
					return;
				}
				const info = importInfo ?? buildImportInfo(EMPTY_PROGRAM);
				const name = node.id?.name;
				const parent = node.parent;

				if (!node.id && parent?.type === 'ExportDefaultDeclaration') {
					if (!bodyLooksLikeComponent(node.body, info)) {
						return;
					}
					context.report({
						node,
						messageId: 'useArrowFunctionAnonymous',
						data: { name: 'default' },
					});
					return;
				}

				if (!name || !isPascalCase(name)) {
					return;
				}
				if (!bodyLooksLikeComponent(node.body, info)) {
					return;
				}
				context.report({
					node,
					messageId: 'useArrowFunction',
					data: { name },
				});
			},
			FunctionExpression(node) {
				if (node.generator) {
					return;
				}
				const parent = node.parent;
				if (!parent) {
					return;
				}
				const info = importInfo ?? buildImportInfo(EMPTY_PROGRAM);

				if (
					parent.type === 'CallExpression' &&
					isWrapperCall(parent, info) &&
					parent.arguments[0] === node
				) {
					if (!bodyLooksLikeComponent(node.body, info)) {
						return;
					}
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
