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
 *     that returns a JSX element or JSX fragment.
 *
 * What it allows:
 *   - Arrow function components (`const Foo = () => <div/>`)
 *   - PascalCase helper functions that never return JSX
 *   - camelCase / lowercase function declarations (hooks, utilities)
 *   - Generator functions (always excluded — `function*`)
 *   - Class declarations
 *
 * Fix strategy: no autofix. Converting a function declaration to an arrow
 * component requires understanding hoisting, export form, and surrounding
 * code, so the rule reports with guidance only.
 */

const isPascalCase = (name) => /^[A-Z]/.test(name);

/**
 * Walk a function body and return `true` if any `ReturnStatement` returns a
 * JSX element or JSX fragment (directly or wrapped in a parenthesised
 * expression).
 *
 * We walk only one level of function nesting — nested function declarations
 * inside the body are skipped so we don't accidentally classify a PascalCase
 * helper-factory as a component because it contains an inline render helper.
 */
const bodyReturnsJsx = (body) => {
	if (!body || body.type !== 'BlockStatement') {
		return false;
	}

	const isJsxNode = (node) =>
		node !== null &&
		node !== undefined &&
		(node.type === 'JSXElement' || node.type === 'JSXFragment');

	const unwrap = (node) => {
		if (!node) {
			return null;
		}

		if (node.type === 'ParenthesizedExpression') {
			return unwrap(node.expression);
		}

		return node;
	};

	/**
	 * Recursively scan statement nodes for a `return <JSX>` pattern.
	 * Stops descending into nested function declarations so that an
	 * inner `function Render() { return <div/> }` does not cause the
	 * outer helper to be flagged.
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

			if (stmt.type === 'ReturnStatement') {
				if (isJsxNode(unwrap(stmt.argument))) {
					return true;
				}

				continue;
			}

			// Recurse into control-flow children.
			if (stmt.type === 'IfStatement') {
				if (
					scanStatements([stmt.consequent]) ||
					scanStatements([stmt.alternate])
				) {
					return true;
				}

				continue;
			}

			if (stmt.type === 'BlockStatement' && scanStatements(stmt.body)) {
				return true;
			}

			if (
				(stmt.type === 'WhileStatement' ||
					stmt.type === 'DoWhileStatement' ||
					stmt.type === 'ForStatement' ||
					stmt.type === 'ForInStatement' ||
					stmt.type === 'ForOfStatement') &&
				scanStatements([stmt.body])
			) {
				return true;
			}

			if (stmt.type === 'SwitchStatement' && stmt.cases) {
				for (const switchCase of stmt.cases) {
					if (scanStatements(switchCase.consequent)) {
						return true;
					}
				}
			}

			if (stmt.type === 'TryStatement') {
				if (scanStatements(stmt.block?.body ?? [])) {
					return true;
				}

				if (stmt.handler && scanStatements(stmt.handler.body?.body ?? [])) {
					return true;
				}

				if (stmt.finalizer && scanStatements(stmt.finalizer.body ?? [])) {
					return true;
				}
			}
		}

		return false;
	};

	return scanStatements(body.body);
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
		},
	},
	create(context) {
		return {
			FunctionDeclaration(node) {
				// Generators are categorically excluded.
				if (node.generator) {
					return;
				}

				const name = node.id?.name;

				if (!name || !isPascalCase(name)) {
					return;
				}

				if (!bodyReturnsJsx(node.body)) {
					return;
				}

				context.report({
					node,
					messageId: 'useArrowFunction',
					data: { name },
				});
			},
		};
	},
};
