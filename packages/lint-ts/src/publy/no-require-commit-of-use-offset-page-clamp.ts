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
 *   callee is a bare Identifier setter (startsWith "set") and the hook call IS
 *   that setter's first argument. E.g. `setPageIndex(useOffsetPageClamp({...}))`.
 *   Not reported. This rejects false negatives like `setTimeout(() => {}, clamped)`
 *   (the callback, not the clamped value, is the first argument) and
 *   `obj.set(clamped)` (callee is a member expression, not a bare identifier).
 * - Case 2 — VARIABLE commitment: the call's parent is a `VariableDeclarator`
 *   with a plain identifier id. Resolve the variable via the scope manager, then
 *   check whether any reference is passed as the FIRST argument to a bare-
 *   Identifier setter call. If found, not reported; otherwise reported. Same
 *   first-argument + bare-identifier safeguards apply here.
 * - Case 3 — BARE statement: the call is in an `ExpressionStatement` (the
 *   return is discarded). Reported.
 * - Case 4 — Any other parent shape: conservatively reported.
 *
 * Scope: test/spec files are excluded — the negligent caller in
 * `offset-pagination.test.ts` is an intentional fixture, not a real caller.
 */

const HOOK_NAME = 'useOffsetPageClamp';

/**
 * True when the callee is a bare `Identifier` whose name looks like a React state
 * setter (startsWith "set"). Member expressions (`obj.set(...)`) are rejected — a React
 * state setter returned by `useState` is always a bare identifier, never a member
 * expression. This excludes false negatives like `obj.set(clamped)` or `setCookie(clamped)`
 * invoked as a method on an arbitrary object.
 */
const isSetterCallee = (callee: ESTree.Expression): boolean => {
	if (callee.type !== 'Identifier') {
		return false;
	}
	return callee.name.startsWith('set');
};

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

/**
 * Uses the oxlint scope manager to walk variable references within the
 * enclosing scope. For each reference to `varName`, checks whether it appears
 * as the FIRST argument of a setter CallExpression.
 *
 * This avoids the type-assertion / Reflect.get patterns that anti-slop rules
 * forbid in linted code — scope references are properly typed by the
 * @oxlint/plugins typings.
 */
const isVariableCommittedViaScope = (
	context: Context,
	node: ESTree.Node,
	varName: string,
): boolean => {
	const sourceCode = context.sourceCode;
	// Walk up the scope chain to find the variable declaration. The hook call
	// may be inside a nested block, so the variable might live in a parent
	// scope.
	let scope = sourceCode.getScope(node);
	let variable = scope.set.get(varName);
	while (!variable && scope.upper) {
		scope = scope.upper;
		variable = scope.set.get(varName);
	}
	if (!variable) return false;

	for (const reference of variable.references) {
		const refNode = reference.identifier;
		const parent = refNode.parent;
		if (!parent || parent.type !== 'CallExpression') continue;
		if (!isSetterCallee(parent.callee)) continue;
		const firstArg = parent.arguments[0];
		if (
			firstArg &&
			firstArg.type === 'Identifier' &&
			firstArg.name === varName
		) {
			return true;
		}
	}
	return false;
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

				// Case 1: DIRECT commitment — the hook call IS the first argument to
				// a setter whose callee is a bare Identifier (not a member
				// expression like `obj.set`).
				//   setPageIndex(useOffsetPageClamp({...}))
				//   NOT: setTimeout(() => {}, clamped) — callback is first arg
				//   NOT: obj.set(clamped) — member expression, not a setter
				if (parent && parent.type === 'CallExpression') {
					if (isSetterCallee(parent.callee)) {
						const firstArg = parent.arguments[0];
						if (firstArg === node) {
							return; // committed directly — OK
						}
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

					// Use the scope manager to check whether the variable is
					// committed as the first arg of a setter call.
					const committed = isVariableCommittedViaScope(context, node, varName);

					if (!committed) {
						context.report({
							node: parent,
							messageId: 'notCommitted',
						});
					}
					return;
				}

				// Case 4: Any other parent shape — we can't confirm commitment.
				// Report conservatively (the call result is not provably committed).
				context.report({ node, messageId: 'notCommitted' });
			},
		};
	},
};
