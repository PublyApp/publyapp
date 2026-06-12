/**
 * `publy/arrow-function-components` — report React components defined as
 * function declarations rather than arrow function expressions.
 *
 * Rationale (AGENTS.md -> "Frontend Coding Standards"):
 *   "Arrow function components only — never `function` declarations for
 *    components."
 *
 * What it flags:
 *   - A `FunctionDeclaration` (or exported `FunctionDeclaration`) whose name
 *     is PascalCase AND whose body contains at least one `return` statement
 *     that returns a JSX element, JSX fragment, or an expression that
 *     *contains* JSX (conditional, logical, TS-cast, or parenthesised wrappers).
 *   - A PascalCase `FunctionDeclaration` that returns only `null`/JSX IF its
 *     body calls at least one React hook (identifier matching /^use[A-Z]/).
 *     Rationale: a `<ProgressBar />` rendered by another component is still a
 *     component even when it conditionally short-circuits to `null`.
 *     Limitation: pure null-returning functions with no hooks are NOT flagged —
 *     they are indistinguishable from PascalCase utility functions without
 *     file-path heuristics, which this rule deliberately avoids.
 *   - A component-shaped `FunctionExpression` that is a direct argument of
 *     `memo(...)` / `forwardRef(...)` (including `React.memo` / `React.forwardRef`).
 *   - An anonymous `export default function () {...}` whose body satisfies the
 *     same component-shape check (JSX return, or hook + null-only return).
 *
 * What it allows:
 *   - Arrow function components (`const Foo = () => <div/>`)
 *   - PascalCase helper functions that never return JSX and call no React hooks
 *   - camelCase / lowercase function declarations (hooks, utilities)
 *   - Generator functions (always excluded — `function*`)
 *   - Class declarations
 *   - `memo(() => <Foo/>)` / `forwardRef(() => <Foo/>)` — already arrow form
 *
 * Hook-call classification (binding-aware, round-2; alias-aware, round-3):
 *   A call is counted as a hook signal when:
 *     (a) callee is `React.use*` / `<reactNamespace>.use*` member call; OR
 *     (b) callee is a bare identifier that is a react named import whose IMPORTED
 *         name is hook-like (e.g. `import { useState as s }` → `s()` is a hook); OR
 *     (c) callee is a bare `use*` identifier that is NOT locally declared in the
 *         file as a plain function/variable — imported names (from any module)
 *         and ambient names both count.  When a `use*` callee IS declared
 *         locally in the same file, it counts only if that local function's own
 *         body contains a hook signal (one level of recursion, cycle-guarded).
 *
 * Wrapper-call classification (binding-aware, round-2; alias-aware, round-3):
 *   `memo(...)` / `forwardRef(...)` counts only when the local name's IMPORTED name
 *   (from 'react') is exactly `memo` or `forwardRef` — OR it is a `React.memo` /
 *   `React.forwardRef` member form via the tracked react namespace/default.
 *   - `import { memo as m } from 'react'; m(fn)` → detected (imported name is 'memo').
 *   - `import { useMemo as memo } from 'react'; memo(fn)` → NOT a wrapper (imported
 *     name is 'useMemo', not 'memo').
 *   - A locally-defined `function memo(fn) {...}` does NOT trigger wrapper detection.
 *
 * Local function map (round-3 fix):
 *   Top-level arrow-function and function-expression variable declarators
 *   (including exported ones) are now included in the local-function map used
 *   for "is locally declared" checks and one-level hook-body recursion.
 *   This prevents `const useThing = () => 42` from being mis-classified as an
 *   ambient hook when called inside a PascalCase function.
 *
 * Control-flow test scanning (round-2 fix):
 *   The hook scanner now also walks `if (...)` conditions, `while`/`do-while`
 *   test expressions, `for` init/test, and `switch` discriminants — so a hook
 *   call like `if (useFeatureFlag()) { return null; }` is correctly detected.
 */

const isPascalCase = (name) => /^[A-Z]/.test(name);
const isHookLike = (name) => /^use[A-Z]/.test(name);
const WRAPPER_FNS = new Set(['memo', 'forwardRef']);

/**
 * Return `true` if `node` is a JSX element or JSX fragment.
 */
const isJsxNode = (node) =>
	node !== null &&
	node !== undefined &&
	(node.type === 'JSXElement' || node.type === 'JSXFragment');

/**
 * Recursively unwrap an expression node, stripping:
 *   - ParenthesizedExpression
 *   - TSAsExpression / TSTypeAssertion / TSSatisfiesExpression / TSNonNullExpression
 *   - ConditionalExpression (either branch may be JSX)
 *   - LogicalExpression (either operand may be JSX)
 *
 * Returns `true` if any reachable leaf is a JSX element or fragment,
 * or if the node itself is JSX.
 */
const expressionContainsJsx = (node) => {
	if (!node) {
		return false;
	}

	if (isJsxNode(node)) {
		return true;
	}

	// Parenthesised: (  <Foo />  )
	if (node.type === 'ParenthesizedExpression') {
		return expressionContainsJsx(node.expression);
	}

	// TypeScript wrappers: x as JSX.Element, <JSX.Element>x, x satisfies T, x!
	if (
		node.type === 'TSAsExpression' ||
		node.type === 'TSTypeAssertion' ||
		node.type === 'TSSatisfiesExpression' ||
		node.type === 'TSNonNullExpression'
	) {
		return expressionContainsJsx(node.expression);
	}

	// Ternary: ok ? <Foo /> : null   →  either branch may be JSX
	if (node.type === 'ConditionalExpression') {
		return (
			expressionContainsJsx(node.consequent) ||
			expressionContainsJsx(node.alternate)
		);
	}

	// Logical: condition && <Foo />   or   value ?? <Foo />
	if (node.type === 'LogicalExpression') {
		return (
			expressionContainsJsx(node.left) || expressionContainsJsx(node.right)
		);
	}

	return false;
};

/**
 * Build an import-tracking map from a Program node.
 *
 * Returns an object with:
 *   - `reactNamespaces: Set<string>` — local names bound to the React namespace.
 *     Includes default imports (`import React from 'react'`) and namespace imports
 *     (`import * as R from 'react'`).
 *   - `reactImportedNames: Set<string>` — local names that are named imports from
 *     'react' whose IMPORTED name is exactly 'memo' or 'forwardRef' — i.e. the
 *     genuine React wrappers, regardless of the local alias used.
 *     Example: `import { memo as m } from 'react'` → 'm' is in the set.
 *     Example: `import { useMemo as memo } from 'react'` → 'memo' is NOT in the set
 *     (imported name is 'useMemo', not 'memo').
 *   - `reactImportedNameToImported: Map<string, string>` — maps each react named-import
 *     LOCAL name to its IMPORTED (original) name. Used for alias-aware hook detection.
 *   - `importedNames: Set<string>` — ALL imported local binding names from any module.
 *     Used to distinguish imported `use*` names from locally-declared ones.
 *   - `localFunctionDecls: Map<string, node>` — top-level function-like nodes keyed by
 *     their binding name. Includes FunctionDeclarations AND top-level VariableDeclarator
 *     bindings whose init is an ArrowFunctionExpression or FunctionExpression (including
 *     exported variants). Used for "is locally declared" checks and one-level hook-body
 *     recursion so that `const useThing = () => 42` is not mistaken for an ambient hook.
 */
const buildImportInfo = (programNode) => {
	const reactNamespaces = new Set();
	// Local names of react named-imports whose IMPORTED name is 'memo' or 'forwardRef'.
	const reactImportedNames = new Set();
	// Local → imported name map for all react named imports (alias-aware hook detection).
	const reactImportedNameToImported = new Map();
	const importedNames = new Set();
	const localFunctionDecls = new Map();

	/**
	 * Register a top-level function-like node (FunctionDeclaration, ArrowFunctionExpression,
	 * or FunctionExpression) under `name` in the localFunctionDecls map so that the
	 * hook-body recursion can correctly classify locally-declared `use*` identifiers.
	 */
	const registerLocalFn = (name, fnNode) => {
		if (name) {
			localFunctionDecls.set(name, fnNode);
		}
	};

	/**
	 * Walk a VariableDeclaration and register any declarator whose init is a function-like
	 * node. Handles both plain `const useThing = () => ...` and exported variants handled
	 * via ExportNamedDeclaration containing a VariableDeclaration.
	 */
	const collectVarDeclarators = (varDecl) => {
		for (const decl of varDecl.declarations ?? []) {
			const name = decl.id?.name;
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

	for (const node of programNode.body ?? []) {
		if (node.type === 'ImportDeclaration') {
			const source = node.source?.value ?? '';
			const isReact = source === 'react';

			for (const specifier of node.specifiers ?? []) {
				if (
					specifier.type === 'ImportDefaultSpecifier' ||
					specifier.type === 'ImportNamespaceSpecifier'
				) {
					// import React from 'react'  /  import * as React from 'react'
					// import R from 'some-lib'   /  import * as R from 'some-lib'
					const localName = specifier.local?.name;

					if (localName) {
						importedNames.add(localName);

						if (isReact) {
							reactNamespaces.add(localName);
						}
					}
				} else if (specifier.type === 'ImportSpecifier') {
					// import { memo, forwardRef, useRef as ref } from 'react'
					// import { useSomething } from '#app/hooks'
					// import { memo as m } from 'react'  → localName='m', importedName='memo'
					// import { useMemo as memo } from 'react' → localName='memo', importedName='useMemo'
					const localName = specifier.local?.name;
					// The imported (original) name: for `{ foo as bar }` this is 'foo'.
					// For `{ foo }` (no alias) oxlint uses the same node for both local/imported.
					const importedName =
						specifier.imported?.name ?? specifier.local?.name;

					if (localName) {
						importedNames.add(localName);

						if (isReact) {
							reactImportedNameToImported.set(localName, importedName);

							// Only register as a React wrapper binding when the IMPORTED
							// name is exactly 'memo' or 'forwardRef', not the local alias.
							if (WRAPPER_FNS.has(importedName)) {
								reactImportedNames.add(localName);
							}
						}
					}
				}
			}
		} else {
			// Collect top-level function declarations for one-level hook recursion.
			let fn = null;

			if (node.type === 'FunctionDeclaration') {
				fn = node;
			} else if (
				node.type === 'ExportDefaultDeclaration' &&
				node.declaration?.type === 'FunctionDeclaration'
			) {
				fn = node.declaration;
			} else if (node.type === 'ExportNamedDeclaration') {
				if (node.declaration?.type === 'FunctionDeclaration') {
					fn = node.declaration;
				} else if (node.declaration?.type === 'VariableDeclaration') {
					collectVarDeclarators(node.declaration);
				}
			} else if (node.type === 'VariableDeclaration') {
				collectVarDeclarators(node);
			}

			if (fn?.id?.name) {
				registerLocalFn(fn.id.name, fn);
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

/**
 * Walk a function body and return information about what it returns and uses.
 *
 * Parameters:
 *   - `body`: the BlockStatement node of the function, OR an expression node
 *     for expression-bodied arrows (e.g. `() => useRef(null)`)
 *   - `importInfo`: the result of `buildImportInfo` for the Program node
 *   - `recursingFor`: Set of function names currently being analysed (cycle guard)
 *
 * Returns `{ returnsJsx, returnsOnlyNullOrJsx, callsHook }` where:
 *   - `returnsJsx`: at least one return statement contains/is JSX.
 *   - `returnsOnlyNullOrJsx`: every non-void return is null or JSX (no plain
 *     values, strings, object literals, etc.).
 *   - `callsHook`: at least one genuine React hook call is present.
 *
 * We walk only one level of function nesting — nested function declarations
 * inside the body are skipped so we don't accidentally classify a PascalCase
 * helper-factory as a component because it contains an inline render helper.
 *
 * Hook-call classification (binding-aware):
 *   A call `foo(...)` is a hook when:
 *     (a) `foo` is a member-expression like `React.useRef` where the object is
 *         a tracked react namespace.
 *     (b) `foo` matches /^use[A-Z]/ AND is NOT locally declared in the same
 *         file as a plain function — either it is imported (from any module)
 *         or it is ambient.  When `foo` IS locally declared, we recurse one
 *         level into that declaration's body to see if it itself calls hooks.
 */
const analyseBody = (body, importInfo, recursingFor = new Set()) => {
	const result = {
		returnsJsx: false,
		returnsOnlyNullOrJsx: true,
		callsHook: false,
	};

	if (!body) {
		return result;
	}

	const {
		reactNamespaces,
		reactImportedNameToImported,
		importedNames,
		localFunctionDecls,
	} = importInfo;

	/**
	 * Determine whether a CallExpression callee node represents a React hook.
	 * Binding-aware: avoids flagging locally-defined non-hook `use*` utilities.
	 *
	 * Alias-aware (round-3 fix): a react named import whose IMPORTED name is
	 * hook-like counts as a hook even when the local alias is not hook-shaped.
	 * E.g. `import { useState as s } from 'react'; s()` → s is a hook call.
	 * Conversely, `import { useMemo as memo }` → memo's imported name 'useMemo'
	 * is hook-like, so `memo()` is a hook call (not a wrapper call).
	 */
	const isHookCallee = (callee) => {
		if (!callee) {
			return false;
		}

		// React.useXxx / <namespace>.useXxx  (member form — always hook when namespace is react)
		if (
			callee.type === 'MemberExpression' &&
			callee.object?.type === 'Identifier' &&
			reactNamespaces.has(callee.object.name) &&
			callee.property?.type === 'Identifier' &&
			isHookLike(callee.property.name)
		) {
			return true;
		}

		// Bare identifier: binding-aware hook detection
		if (callee.type === 'Identifier') {
			const name = callee.name;

			// Alias-aware react hook: an aliased react named import counts as a hook
			// when its IMPORTED name is hook-like, regardless of the local alias name.
			// E.g. `import { useState as s }` → reactImportedNameToImported.get('s') === 'useState'
			//      → isHookLike('useState') → true → s() is a hook call.
			if (reactImportedNameToImported.has(name)) {
				const importedName = reactImportedNameToImported.get(name);

				if (isHookLike(importedName)) {
					return true;
				}
			}

			// Only proceed with the hook-name check when the local name itself is hook-like.
			if (!isHookLike(name)) {
				return false;
			}

			// Imported from any module → definitely a hook (custom hook or React hook)
			if (importedNames.has(name)) {
				return true;
			}

			// Locally declared as a function → one-level recursion to check if it IS a hook
			if (localFunctionDecls.has(name)) {
				if (recursingFor.has(name)) {
					// Cycle guard: treat as non-hook to be conservative
					return false;
				}

				const localFn = localFunctionDecls.get(name);
				const nextRecursingFor = new Set(recursingFor).add(name);
				const localAnalysis = analyseBody(
					localFn.body,
					importInfo,
					nextRecursingFor,
				);

				return localAnalysis.callsHook;
			}

			// Not locally declared and not imported → ambient (global shim, etc.) → count as hook
			return true;
		}

		return false;
	};

	/**
	 * Walk an expression looking for hook calls.
	 */
	const walkExprForHooks = (expr) => {
		if (!expr) {
			return;
		}

		if (expr.type === 'CallExpression') {
			const callee = expr.callee;

			if (isHookCallee(callee)) {
				result.callsHook = true;
			}

			// Walk arguments too (hooks may be called inside other calls).
			for (const arg of expr.arguments ?? []) {
				walkExprForHooks(arg);
			}

			// Walk the callee itself for unusual chained member-expression hooks.
			if (callee.type === 'MemberExpression') {
				walkExprForHooks(callee.object);
			}
		}

		if (expr.type === 'MemberExpression') {
			walkExprForHooks(expr.object);
		}
	};

	/**
	 * Recursively scan statement nodes.
	 * Stops descending into nested function bodies so that an inner
	 * `function Render() { return <div/> }` does not cause the outer
	 * helper to be flagged.
	 *
	 * Round-2 fix: also scans control-flow test/condition/discriminant expressions
	 * for hook calls (e.g. `if (useFeatureFlag()) { return null; }`).
	 */
	const scanStatements = (statements) => {
		for (const stmt of statements) {
			if (!stmt) {
				continue;
			}

			if (
				stmt.type === 'FunctionDeclaration' ||
				stmt.type === 'FunctionExpression' ||
				stmt.type === 'ArrowFunctionExpression'
			) {
				// Do not descend into nested function bodies.
				continue;
			}

			// Scan expressions in variable declarations / expression statements for hooks.
			if (stmt.type === 'VariableDeclaration') {
				for (const decl of stmt.declarations ?? []) {
					walkExprForHooks(decl.init);
				}

				continue;
			}

			if (stmt.type === 'ExpressionStatement') {
				walkExprForHooks(stmt.expression);
				continue;
			}

			if (stmt.type === 'ReturnStatement') {
				const arg = stmt.argument;

				if (arg === null || arg === undefined) {
					// bare `return;` — treat as returning null/undefined (non-JSX).
					// Does NOT set returnsOnlyNullOrJsx to false.
					continue;
				}

				if (expressionContainsJsx(arg)) {
					result.returnsJsx = true;
				} else {
					// Check if it's a null/undefined literal.
					const isNullLike =
						(arg.type === 'Literal' && arg.value === null) ||
						(arg.type === 'Identifier' && arg.name === 'undefined');

					if (!isNullLike) {
						result.returnsOnlyNullOrJsx = false;
					}
				}

				continue;
			}

			// Recurse into control-flow children.
			// Round-2 fix: scan the condition/test/discriminant expression for hook calls.
			if (stmt.type === 'IfStatement') {
				// Scan the `if (condition)` expression for hook calls.
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
				// Scan the loop condition for hook calls.
				walkExprForHooks(stmt.test);
				scanStatements([stmt.body]);
				continue;
			}

			if (stmt.type === 'ForStatement') {
				// Scan the `for (init; test; update)` — test may contain hooks.
				walkExprForHooks(stmt.test);
				scanStatements([stmt.body]);
				continue;
			}

			if (stmt.type === 'ForInStatement' || stmt.type === 'ForOfStatement') {
				scanStatements([stmt.body]);
				continue;
			}

			if (stmt.type === 'SwitchStatement') {
				// Scan the switch discriminant expression for hook calls.
				walkExprForHooks(stmt.discriminant);

				if (stmt.cases) {
					for (const switchCase of stmt.cases) {
						scanStatements(switchCase.consequent);
					}
				}

				continue;
			}

			if (stmt.type === 'TryStatement') {
				scanStatements(stmt.block?.body ?? []);

				if (stmt.handler) {
					scanStatements(stmt.handler.body?.body ?? []);
				}

				if (stmt.finalizer) {
					scanStatements(stmt.finalizer.body ?? []);
				}
			}
		}
	};

	// Expression-bodied arrow function (e.g. `() => useRef(null)`):
	// body is the expression itself, not a BlockStatement.
	// Walk it directly for hook calls so one-level recursion in isHookCallee
	// correctly propagates hook-ness from local arrow hooks to their callers.
	if (body.type !== 'BlockStatement') {
		walkExprForHooks(body);
		return result;
	}

	scanStatements(body.body);

	return result;
};

/**
 * Decide whether a function body looks like a React component body.
 * Returns true when:
 *   1. The body contains a return that is/contains JSX, OR
 *   2. The body calls at least one React hook AND returns only null/JSX
 *      (no other value types), which covers the null-short-circuit pattern
 *      where a PascalCase component always returns null at a given phase.
 */
const bodyLooksLikeComponent = (body, importInfo) => {
	const { returnsJsx, returnsOnlyNullOrJsx, callsHook } = analyseBody(
		body,
		importInfo,
	);

	if (returnsJsx) {
		return true;
	}

	// Null-only + hooks heuristic.
	if (callsHook && returnsOnlyNullOrJsx) {
		return true;
	}

	return false;
};

/**
 * Return `true` if `node` is a call to `memo(...)` or `forwardRef(...)`
 * that is genuinely React's memo/forwardRef (binding-aware, round-2 fix).
 *
 * Counts as a React wrapper when:
 *   - The callee is a member-expression whose object is a tracked react
 *     namespace: `React.memo(...)`, `R.forwardRef(...)`.
 *   - The callee is a bare identifier whose local name was imported from
 *     'react' as a named import (possibly aliased).
 *
 * Does NOT count when:
 *   - The bare identifier was declared locally in the same file (e.g. a
 *     custom `function memo(fn) { ... }` utility).
 *   - The bare identifier is imported from a module OTHER than 'react'.
 */
const isWrapperCall = (node, importInfo) => {
	if (!node || node.type !== 'CallExpression') {
		return false;
	}

	const { reactNamespaces, reactImportedNames } = importInfo;
	const callee = node.callee;

	// React.memo / React.forwardRef / <namespace>.memo etc.
	if (
		callee.type === 'MemberExpression' &&
		callee.object?.type === 'Identifier' &&
		reactNamespaces.has(callee.object.name) &&
		callee.property?.type === 'Identifier'
	) {
		return WRAPPER_FNS.has(callee.property.name);
	}

	// Bare identifier — only count when explicitly imported from 'react' as a
	// genuine wrapper (memo/forwardRef by imported name, regardless of local alias).
	// `reactImportedNames` already encodes that the imported name is in WRAPPER_FNS.
	if (callee.type === 'Identifier') {
		return reactImportedNames.has(callee.name);
	}

	return false;
};

export const arrowFunctionComponents = {
	meta: {
		type: 'suggestion',
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
	create(context) {
		// Import info collected in the Program visitor (populated before any
		// function declaration visitors fire, since Program fires first).
		let importInfo = null;

		return {
			Program(node) {
				importInfo = buildImportInfo(node);
			},

			// Named FunctionDeclaration components, plus anonymous
			// `export default function() {...}` which Oxlint parses as a
			// FunctionDeclaration with no id and an ExportDefaultDeclaration parent.
			FunctionDeclaration(node) {
				// Generators are categorically excluded.
				if (node.generator) {
					return;
				}

				// importInfo is always set by the time FunctionDeclaration fires
				// (Program fires first in the traversal order).
				const info = importInfo ?? buildImportInfo({ body: [] });
				const name = node.id?.name;
				const parent = node.parent;

				// Case A: anonymous export default function() {...}
				// Oxlint parses this as FunctionDeclaration (no id) whose parent is
				// ExportDefaultDeclaration — handle it before the PascalCase guard.
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

				// Case B: named PascalCase function declarations.
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

			// FunctionExpression inside memo(...) / forwardRef(...).
			FunctionExpression(node) {
				if (node.generator) {
					return;
				}

				const parent = node.parent;

				if (!parent) {
					return;
				}

				const info = importInfo ?? buildImportInfo({ body: [] });

				// memo(function Foo() {...}) / forwardRef(function Foo() {...})
				// The function may be named or anonymous — both are flagged when
				// the wrapper call is detected.
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
