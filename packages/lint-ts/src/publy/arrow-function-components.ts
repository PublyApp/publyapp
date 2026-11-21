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

const isFunctionValue = (node: ESTree.Node): node is FunctionNode =>
	node.type === 'ArrowFunctionExpression' ||
	node.type === 'FunctionExpression' ||
	node.type === 'FunctionDeclaration';

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
	for (const prop of objExpr.properties) {
		if (prop.type === 'SpreadElement') {
			into.clear();
			return;
		}
		if (
			prop.type === 'Property' &&
			prop.kind === 'init' &&
			prop.key.type === 'Identifier' &&
			isFunctionValue(prop.value)
		) {
			into.set(prop.key.name, prop.value);
		}
	}
};

const collectVarDeclarators = (
	info: ImportInfo,
	varDecl: ESTree.VariableDeclaration,
): void => {
	for (const decl of varDecl.declarations) {
		const name = decl.id.type === 'Identifier' ? decl.id.name : undefined;
		const init = decl.init;
		if (!name || !init) {
			continue;
		}
		if (
			init.type === 'ArrowFunctionExpression' ||
			init.type === 'FunctionExpression'
		) {
			info.localFunctionDecls.set(name, init);
		} else if (init.type === 'ObjectExpression') {
			let members = info.localObjectMembers.get(name);
			if (!members) {
				members = new Map<string, FunctionNode>();
				info.localObjectMembers.set(name, members);
			}
			collectObjectMembers(init, members);
		}
	}
};

const registerImportSpecifier = (
	info: ImportInfo,
	isReact: boolean,
	specifier: ESTree.ImportDeclaration['specifiers'][number],
): void => {
	const localName = specifier.local.name;
	if (!localName) {
		return;
	}
	info.importedNames.add(localName);
	if (specifier.type !== 'ImportSpecifier') {
		if (isReact) {
			info.reactNamespaces.add(localName);
		}
		return;
	}
	const importedName =
		specifier.imported.type === 'Identifier'
			? specifier.imported.name
			: specifier.imported.value;
	if (isReact && importedName) {
		info.reactImportedNameToImported.set(localName, importedName);
		if (WRAPPER_FNS.has(importedName)) {
			info.reactImportedNames.add(localName);
		}
	}
};

/** The function declaration a top-level statement declares directly, if any. */
const declaredFunction = (node: ESTree.Node): ESTree.Function | null => {
	if (node.type === 'FunctionDeclaration') {
		return node;
	}
	if (
		node.type === 'ExportDefaultDeclaration' &&
		node.declaration.type === 'FunctionDeclaration'
	) {
		return node.declaration;
	}
	if (
		node.type === 'ExportNamedDeclaration' &&
		node.declaration?.type === 'FunctionDeclaration'
	) {
		return node.declaration;
	}
	return null;
};

const registerStatement = (info: ImportInfo, node: ESTree.Node): void => {
	if (node.type === 'ImportDeclaration') {
		const isReact = node.source.value === 'react';
		for (const specifier of node.specifiers) {
			registerImportSpecifier(info, isReact, specifier);
		}
		return;
	}
	const fn = declaredFunction(node);
	if (fn?.id) {
		info.localFunctionDecls.set(fn.id.name, fn);
		return;
	}
	if (node.type === 'VariableDeclaration') {
		collectVarDeclarators(info, node);
	} else if (
		node.type === 'ExportNamedDeclaration' &&
		node.declaration?.type === 'VariableDeclaration'
	) {
		collectVarDeclarators(info, node.declaration);
	}
};

const buildImportInfo = (programNode: ESTree.Program): ImportInfo => {
	const info: ImportInfo = {
		reactNamespaces: new Set<string>(),
		reactImportedNames: new Set<string>(),
		reactImportedNameToImported: new Map<string, string>(),
		importedNames: new Set<string>(),
		localFunctionDecls: new Map<string, FunctionNode>(),
		localObjectMembers: new Map<string, Map<string, FunctionNode>>(),
	};
	for (const node of programNode.body) {
		registerStatement(info, node);
	}
	return info;
};

// State of one `analyseBody` call. `result` is mutated as statements are
// scanned; `localJsxVars` (#1293) holds the names of local variables whose
// initializer carries JSX in THIS function body (fresh per call).
interface BodyScan {
	result: BodyAnalysis;
	localJsxVars: Set<string>;
	importInfo: ImportInfo;
	recursingFor: Set<string>;
	visiting: Set<string>;
}

/**
 * Whether a CallExpression callee is a known renderer function
 * (useRender, createElement, jsx, jsxs) — bare identifier or React
 * namespace member expression.
 */
const isKnownRendererCallee = (
	scan: BodyScan,
	callee: ESTree.Expression | undefined,
): boolean => {
	if (!callee) {
		return false;
	}

	if (callee.type === 'Identifier') {
		return KNOWN_RENDERERS.has(callee.name);
	}

	return (
		callee.type === 'MemberExpression' &&
		callee.object.type === 'Identifier' &&
		scan.importInfo.reactNamespaces.has(callee.object.name) &&
		callee.property.type === 'Identifier' &&
		KNOWN_RENDERERS.has(callee.property.name)
	);
};

// A hook-like identifier call resolved through a local function declaration:
// analyse the declaration's body (block) or walk it (concise arrow).
const isLocalHookCall = (scan: BodyScan, name: string): boolean => {
	if (scan.recursingFor.has(name)) {
		return false;
	}
	const fnBody = scan.importInfo.localFunctionDecls.get(name)?.body;
	if (!fnBody) {
		return false;
	}
	if (fnBody.type === 'BlockStatement') {
		const next = new Set(scan.recursingFor).add(name);
		return analyseBody(fnBody, scan.importInfo, next).callsHook;
	}
	// Arrow function expression body — check the expression directly
	walkExprForHooks(scan, fnBody);
	return scan.result.callsHook;
};

const isHookIdentifierCall = (scan: BodyScan, name: string): boolean => {
	const { reactImportedNameToImported, importedNames, localFunctionDecls } =
		scan.importInfo;
	const importedName = reactImportedNameToImported.get(name);
	if (importedName && isHookLike(importedName)) {
		return true;
	}
	if (!isHookLike(name)) {
		return false;
	}
	if (importedNames.has(name)) {
		return true;
	}
	if (localFunctionDecls.has(name)) {
		return isLocalHookCall(scan, name);
	}
	return true;
};

const isHookCallee = (
	scan: BodyScan,
	callee: ESTree.Expression | undefined,
): boolean => {
	if (!callee) {
		return false;
	}

	if (
		callee.type === 'MemberExpression' &&
		callee.object.type === 'Identifier' &&
		scan.importInfo.reactNamespaces.has(callee.object.name) &&
		callee.property.type === 'Identifier' &&
		isHookLike(callee.property.name)
	) {
		return true;
	}

	return (
		callee.type === 'Identifier' && isHookIdentifierCall(scan, callee.name)
	);
};

const walkExprForHooks = (
	scan: BodyScan,
	expr: ESTree.Expression | null | undefined,
): void => {
	if (!expr) {
		return;
	}
	if (expr.type === 'CallExpression') {
		const callee = expr.callee;
		if (isHookCallee(scan, callee)) {
			scan.result.callsHook = true;
		}
		for (const arg of expr.arguments) {
			if (arg.type !== 'SpreadElement') {
				walkExprForHooks(scan, arg);
			}
		}
		if (callee.type === 'MemberExpression') {
			walkExprForHooks(scan, callee.object);
		}
	}
	if (expr.type === 'MemberExpression') {
		walkExprForHooks(scan, expr.object);
	}
};

const scanVariableDeclaration = (
	scan: BodyScan,
	stmt: ESTree.VariableDeclaration,
): void => {
	for (const decl of stmt.declarations) {
		walkExprForHooks(scan, decl.init);
		// #1293: remember JSX-carrying local variables so a later
		// `return el;` counts as a JSX return.
		if (
			decl.id.type === 'Identifier' &&
			decl.init &&
			expressionContainsJsx(decl.init)
		) {
			scan.localJsxVars.add(decl.id.name);
		}
	}
};

const scanExpressionStatement = (
	scan: BodyScan,
	stmt: ESTree.ExpressionStatement,
): void => {
	walkExprForHooks(scan, stmt.expression);
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
		scan.localJsxVars.add(expr.left.name);
	}
};

// Whether a `return <call>(...)` delegates to a local helper / local object
// member whose own body yields JSX (#1283, #1293).
const isLocalDelegateCall = (
	scan: BodyScan,
	arg: ESTree.CallExpression,
): boolean => {
	const { callee } = arg;
	const { importInfo, visiting } = scan;
	if (callee.type === 'Identifier') {
		// #1283: `return someLocalHelper(...)` where the helper's own body
		// yields JSX (directly, through further such helpers, or through a
		// known renderer). The declaration shape is the signal, so a
		// non-allowlisted render wrapper cannot hide the component.
		return isLocalRenderDelegate(callee.name, importInfo, visiting);
	}
	// #1293: `return someLocalObject.member(...)` where the member is a
	// function on a top-level LOCAL object literal and its own body
	// yields JSX the same way.
	return (
		callee.type === 'MemberExpression' &&
		callee.property.type === 'Identifier' &&
		isLocalMemberRenderDelegate(
			callee.object,
			callee.property,
			importInfo,
			visiting,
		)
	);
};

const scanReturnArgument = (scan: BodyScan, arg: ESTree.Expression): void => {
	const { result } = scan;
	if (expressionContainsJsx(arg)) {
		result.returnsJsx = true;
	} else if (
		arg.type === 'CallExpression' &&
		(isKnownRendererCallee(scan, arg.callee) || isLocalDelegateCall(scan, arg))
	) {
		// PascalCase function returning useRender(...), createElement(...),
		// jsx(...), or jsxs(...) — component even without direct JSX.
		result.returnsRendererCall = true;
	} else if (arg.type === 'Identifier' && scan.localJsxVars.has(arg.name)) {
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
};

const scanTryStatement = (scan: BodyScan, stmt: ESTree.TryStatement): void => {
	scanStatements(scan, stmt.block.body);
	if (stmt.handler) {
		scanStatements(scan, stmt.handler.body.body);
	}
	if (stmt.finalizer) {
		scanStatements(scan, stmt.finalizer.body);
	}
};

const scanStatement = (scan: BodyScan, stmt: ESTree.Statement): void => {
	switch (stmt.type) {
		case 'VariableDeclaration':
			scanVariableDeclaration(scan, stmt);
			break;
		case 'ExpressionStatement':
			scanExpressionStatement(scan, stmt);
			break;
		case 'ReturnStatement':
			if (stmt.argument !== null && stmt.argument !== undefined) {
				scanReturnArgument(scan, stmt.argument);
			}
			break;
		case 'IfStatement':
			walkExprForHooks(scan, stmt.test);
			scanStatements(scan, [stmt.consequent]);
			if (stmt.alternate) {
				scanStatements(scan, [stmt.alternate]);
			}
			break;
		case 'BlockStatement':
			scanStatements(scan, stmt.body);
			break;
		case 'WhileStatement':
		case 'DoWhileStatement':
		case 'ForStatement':
			walkExprForHooks(scan, stmt.test);
			scanStatements(scan, [stmt.body]);
			break;
		case 'ForInStatement':
		case 'ForOfStatement':
			scanStatements(scan, [stmt.body]);
			break;
		case 'SwitchStatement':
			walkExprForHooks(scan, stmt.discriminant);
			for (const c of stmt.cases) {
				scanStatements(scan, c.consequent);
			}
			break;
		case 'TryStatement':
			scanTryStatement(scan, stmt);
			break;
		default:
			break;
	}
};

const scanStatements = (
	scan: BodyScan,
	statements: ESTree.Statement[],
): void => {
	for (const stmt of statements) {
		if (stmt) {
			scanStatement(scan, stmt);
		}
	}
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
	scanStatements(
		{
			result,
			localJsxVars: new Set(),
			importInfo,
			recursingFor,
			visiting,
		},
		body.body,
	);
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
