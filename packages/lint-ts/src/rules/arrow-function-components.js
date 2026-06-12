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
 */

const isPascalCase = (name) => /^[A-Z]/.test(name);
const isHookCall = (name) => /^use[A-Z]/.test(name);
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
 * Walk a function body and return information about what it returns and uses.
 *
 * Returns `{ returnsJsx, returnsOnlyNullOrJsx, callsHook }` where:
 *   - `returnsJsx`: at least one return statement contains/is JSX.
 *   - `returnsOnlyNullOrJsx`: every non-void return is null or JSX (no plain
 *     values, strings, object literals, etc.).
 *   - `callsHook`: at least one call to a `use*` identifier is present.
 *
 * We walk only one level of function nesting — nested function declarations
 * inside the body are skipped so we don't accidentally classify a PascalCase
 * helper-factory as a component because it contains an inline render helper.
 */
const analyseBody = (body) => {
	const result = {
		returnsJsx: false,
		returnsOnlyNullOrJsx: true,
		callsHook: false,
	};

	if (!body || body.type !== 'BlockStatement') {
		return result;
	}

	/**
	 * Walk an expression looking for hook calls (identifiers matching
	 * /^use[A-Z]/ used as the callee of a CallExpression).
	 */
	const walkExprForHooks = (expr) => {
		if (!expr) {
			return;
		}

		if (expr.type === 'CallExpression') {
			const callee = expr.callee;

			if (callee.type === 'Identifier' && isHookCall(callee.name)) {
				result.callsHook = true;
			}

			// Walk arguments too (hooks may be called inside other calls).
			for (const arg of expr.arguments ?? []) {
				walkExprForHooks(arg);
			}

			// Walk the callee itself for member-expression hooks (unusual but possible).
			walkExprForHooks(callee);
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
			if (stmt.type === 'IfStatement') {
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

			if (
				stmt.type === 'WhileStatement' ||
				stmt.type === 'DoWhileStatement' ||
				stmt.type === 'ForStatement' ||
				stmt.type === 'ForInStatement' ||
				stmt.type === 'ForOfStatement'
			) {
				scanStatements([stmt.body]);
				continue;
			}

			if (stmt.type === 'SwitchStatement' && stmt.cases) {
				for (const switchCase of stmt.cases) {
					scanStatements(switchCase.consequent);
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
const bodyLooksLikeComponent = (body) => {
	const { returnsJsx, returnsOnlyNullOrJsx, callsHook } = analyseBody(body);

	if (returnsJsx) {
		return true;
	}

	// Null-only + hooks heuristic (finding #2).
	if (callsHook && returnsOnlyNullOrJsx) {
		return true;
	}

	return false;
};

/**
 * Return `true` if `node` is a call to `memo(...)` or `forwardRef(...)`
 * (including `React.memo` / `React.forwardRef`).
 */
const isWrapperCall = (node) => {
	if (!node || node.type !== 'CallExpression') {
		return false;
	}

	const callee = node.callee;

	if (callee.type === 'Identifier') {
		return WRAPPER_FNS.has(callee.name);
	}

	if (
		callee.type === 'MemberExpression' &&
		callee.object?.type === 'Identifier' &&
		callee.object.name === 'React' &&
		callee.property?.type === 'Identifier'
	) {
		return WRAPPER_FNS.has(callee.property.name);
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
		return {
			// Finding #1 + #2 (original) + Finding #3 (anonymous export default):
			// Named FunctionDeclaration components, plus anonymous
			// `export default function() {...}` which Oxlint parses as a
			// FunctionDeclaration with no id and an ExportDefaultDeclaration parent.
			FunctionDeclaration(node) {
				// Generators are categorically excluded.
				if (node.generator) {
					return;
				}

				const name = node.id?.name;
				const parent = node.parent;

				// Case A: anonymous export default function() {...}
				// Oxlint parses this as FunctionDeclaration (no id) whose parent is
				// ExportDefaultDeclaration — handle it before the PascalCase guard.
				if (!node.id && parent?.type === 'ExportDefaultDeclaration') {
					if (!bodyLooksLikeComponent(node.body)) {
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

				if (!bodyLooksLikeComponent(node.body)) {
					return;
				}

				context.report({
					node,
					messageId: 'useArrowFunction',
					data: { name },
				});
			},

			// Finding #3: FunctionExpression inside memo(...) / forwardRef(...).
			FunctionExpression(node) {
				if (node.generator) {
					return;
				}

				const parent = node.parent;

				if (!parent) {
					return;
				}

				// memo(function Foo() {...}) / forwardRef(function Foo() {...})
				// The function may be named or anonymous — both are flagged when
				// the wrapper call is detected.
				if (
					parent.type === 'CallExpression' &&
					isWrapperCall(parent) &&
					parent.arguments[0] === node
				) {
					if (!bodyLooksLikeComponent(node.body)) {
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
