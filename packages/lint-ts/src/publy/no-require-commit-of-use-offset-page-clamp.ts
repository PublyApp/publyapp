import type { Context, Visitor } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

/**
 * `publy/require-commit-of-use-offset-page-clamp` — require that the return value
 * of `useOffsetPageClamp` is committed to the caller's state.
 *
 * Rationale (issue #1660): `useOffsetPageClamp` is a pure derivation — it
 * RETURNS the page to display but never writes into the caller's state. The
 * "return to page 0 after a resetKeys change" only takes effect if the caller
 * COMMITS the returned value (the adjust-state-while-rendering pattern
 * `if (clamped !== pageIndex) setPageIndex(clamped)`). A caller that ignores the
 * return silently loses the reset: the hook returns 0 on the reset render, but
 * since the caller never feeds that back into its pageIndex state, on the next
 * render resetKeys is already changed and the hook clamps from the still-stale
 * pageIndex — stranding the reader on a non-zero page.
 *
 * Detection strategy:
 * - Visit `CallExpression` nodes looking for calls to `useOffsetPageClamp`
 *   (identifier name `useOffsetPageClamp`, or a member expression whose property
 *   is `useOffsetPageClamp`).
 * - Case 1 — DIRECT commitment: the call's parent is a `CallExpression` whose
 *   callee is a setter (identifier starting with `set`). E.g.
 *   `setPageIndex(useOffsetPageClamp({...}))`. Not reported.
 * - Case 2 — VARIABLE commitment: the call's parent is a `VariableDeclarator`
 *   with a plain identifier id. Track the variable name, then scan the enclosing
 *   function body for any CallExpression that passes that variable as an
 *   argument to a setter. If found, not reported; otherwise reported.
 * - Case 3 — BARE statement: the call is in an `ExpressionStatement` (the
 *   return is discarded). Reported.
 * - The enclosing function is found by walking the `parent` chain (oxlint
 *   ESTree nodes carry a `parent` link). We scan the function's BlockStatement
 *   body for setter calls referencing the variable.
 *
 * Scope: test/spec files are excluded — the negligent caller in
 * `offset-pagination.test.ts` is an intentional fixture, not a real caller.
 */

const HOOK_NAME = 'useOffsetPageClamp';

/** True when the identifier name looks like a React state setter (startsWith "set"). */
const isSetterName = (name: string): boolean => name.startsWith('set');

/** True when the filename is a test/spec file (excluded from checking). */
const isTestFile = (filename: string): boolean =>
	/(?:^|\/)[^/]+\.(?:test|spec)\.(?:ts|tsx|jsx|mjs|js)$/.test(filename);

const getContextFilename = (context: Context): string => {
	if (typeof context.filename === 'string') {
		return context.filename;
	}
	return '';
};

/**
 * Extracts the callee name from a CallExpression's callee.
 * - Identifier → the name
 * - MemberExpression (non-computed) → the property name
 * - Otherwise null.
 */
const getCalleeName = (callee: ESTree.Expression): string | null => {
	if (callee.type === 'Identifier') {
		return callee.name;
	}
	if (
		callee.type === 'MemberExpression' &&
		!callee.computed &&
		callee.property.type === 'Identifier'
	) {
		return callee.property.name;
	}
	return null;
};

interface SetterArgMatch {
	node: ESTree.CallExpression;
	varName: string;
}

/**
 * Scans a subtree for CallExpressions that pass `varName` as an argument to a
 * setter. Returns the first match found (or null). Uses a WeakSet to avoid
 * re-visiting nodes (handles shared subtrees).
 */
const findSetterCallWithVar = (
	node: ESTree.Node | null | undefined,
	varName: string,
	visited: WeakSet<ESTree.Node>,
): SetterArgMatch | null => {
	if (!node || visited.has(node)) {
		return null;
	}
	visited.add(node);

	if (node.type === 'CallExpression') {
		const calleeName = getCalleeName(node.callee);
		if (calleeName !== null && isSetterName(calleeName)) {
			for (const arg of node.arguments) {
				if (arg.type === 'Identifier' && arg.name === varName) {
					return { node, varName };
				}
			}
		}
	}

	for (const key of Object.keys(node)) {
		if (key === 'parent') continue;
		const value: unknown = (node as Record<string, unknown>)[key];
		if (Array.isArray(value)) {
			for (const child of value) {
				if (child && typeof child === 'object' && 'type' in child) {
					const found = findSetterCallWithVar(
						child as ESTree.Node,
						varName,
						visited,
					);
					if (found) return found;
				}
			}
		} else if (value && typeof value === 'object' && 'type' in value) {
			const found = findSetterCallWithVar(
				value as ESTree.Node,
				varName,
				visited,
			);
			if (found) return found;
		}
	}

	return null;
};

/**
 * Walks the `parent` chain to find the enclosing function body node.
 * Returns null if the call is not inside a function (module scope, etc.).
 */
const findEnclosingFunctionBody = (
	startNode: ESTree.Node,
): ESTree.BlockStatement | null => {
	let current: ESTree.Node | null = startNode.parent ?? null;
	while (current) {
		if (
			current.type === 'FunctionDeclaration' ||
			current.type === 'FunctionExpression' ||
			current.type === 'ArrowFunctionExpression'
		) {
			const body = current.body;
			if (body && body.type === 'BlockStatement') {
				return body;
			}
			// Arrow with expression body — there is no BlockStatement, so there
			// is no place a setter call could commit the variable. Treat as
			// un-trackable (report).
			return null;
		}
		current = current.parent ?? null;
	}
	return null;
};

export const noRequireCommitOfUseOffsetPageClamp = {
	meta: {
		type: 'problem' as const,
		docs: {
			description:
				'Require that useOffsetPageClamp return value is committed to state (never silently discarded).',
			recommended: false,
		},
		schema: [],
		messages: {
			notCommitted:
				'`useOffsetPageClamp` returns the page the caller should hold, but it never writes into the caller state. MUST commit the return value, e.g. `setPageIndex(clamped)`. Ignoring it silently loses the reset-to-0 after a resetKeys change (issue #1660).',
		},
	},
	create(context: Context): Visitor {
		if (isTestFile(getContextFilename(context))) {
			return {};
		}

		return {
			CallExpression(node: ESTree.CallExpression) {
				const calleeName = getCalleeName(node.callee);
				if (calleeName !== HOOK_NAME) {
					return;
				}

				const parent = node.parent;

				// Case 1: DIRECT commitment — the call is an argument to a setter.
				//   setPageIndex(useOffsetPageClamp({...}))
				if (parent && parent.type === 'CallExpression') {
					const parentCalleeName = getCalleeName(parent.callee);
					if (parentCalleeName !== null && isSetterName(parentCalleeName)) {
						return; // committed directly — OK
					}
				}

				// Case 3: BARE statement — return value discarded.
				//   useOffsetPageClamp({...});
				if (parent && parent.type === 'ExpressionStatement') {
					context.report({ node, messageId: 'notCommitted' });
					return;
				}

				// Case 2: VARIABLE commitment — result assigned to a variable.
				if (
					parent &&
					parent.type === 'VariableDeclarator' &&
					parent.id.type === 'Identifier'
				) {
					const varName = parent.id.name;

					const funcBody = findEnclosingFunctionBody(node);
					if (!funcBody) {
						// Can't find enclosing function — can't prove commitment.
						context.report({ node, messageId: 'notCommitted' });
						return;
					}

					const visited = new WeakSet<ESTree.Node>();
					const match = findSetterCallWithVar(funcBody, varName, visited);

					if (!match) {
						context.report({
							node: parent,
							messageId: 'notCommitted',
						});
					}
					return;
				}

				// Any other parent shape — we can't confirm commitment. Report
				// conservatively (the call result is not provably committed).
				context.report({ node, messageId: 'notCommitted' });
			},
		};
	},
};
