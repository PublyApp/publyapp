import type { Context, Visitor } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

/**
 * oxlint re-exports the ESTree types from its internal types_d_exports module.
 * There is no ESTree.Identifier — the spec splits into BindingIdentifier
 * (declarations) and IdentifierReference (usages). For our purposes we mostly
 * work with IdentifierReference (a variable usage like the callee of a call)
 * and narrow ESTree.Expression via .type === 'Identifier'.
 */

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
 * - Case 1 — DIRECT commitment: the hook call IS the first argument to a
 *   setter that traces back to a `useState`/`useReducer` destructuring.
 *   E.g. `setPageIndex(useOffsetPageClamp({...}))`.
 *   NOT: `setTimeout(clamped, 100)` — `setTimeout` is a global, not a setter
 *   declared by destructuring `useState`/`useReducer`.
 * - Case 2 — VARIABLE commitment: the call's parent is a `VariableDeclarator`
 *   with a plain identifier id. Resolve the variable via the scope manager,
 *   then check whether any reference appears inside the first argument of a
 *   setter call that traces back to `useState`/`useReducer`. The reference may
 *   be the argument itself (`setPageIndex(clamped)`), nested in a functional
 *   update (`setPageIndex(prev => clamped)`), in a nullish expression
 *   (`setPageIndex(clamped ?? 0)`), or inside a type wrapper
 *   (`setPageIndex(Number(clamped))`). If found, not reported; otherwise
 *   reported.
 * - Case 3 — BARE statement: the call is in an `ExpressionStatement` (the
 *   return is discarded). Reported.
 * - Case 4 — Any other parent shape: conservatively reported.
 *
 * Why scope tracing (approach 1) over a blocklist (approach 2): a setter's
 * name (`set*`) is a convention, not a contract — `setTimeout`, `setInterval`,
 * `setCookie`, `setDomainName`, `setImmediate` all start with `set` but are
 * globals. The only structural property that distinguishes a React state
 * setter from a global is its declaration site: a setter returned by
 * `useState`/`useReducer` is always declared by destructuring
 * `const [x, setX] = useState(...)` (or `useReducer`). Tracing the identifier
 * to its declaration via the scope manager is the only construction-correct
 * approach. A blocklist is a closed frontier that must be updated every time
 * a new global appears.
 *
 * Scope: test/spec files are excluded — the negligent caller in
 * `offset-pagination.test.ts` is an intentional fixture, not a real caller.
 */

const HOOK_NAME = 'useOffsetPageClamp';

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
 * True when the callee is a bare `Identifier` that is a valid React state
 * setter candidate: it starts with "set" (the React naming convention) AND
 * has a local declaration (not a global).
 *
 * This combines two criteria to handle all cases:
 * - `setPageIndex` (prop) → starts with "set" + local → setter ✓
 * - `setTimeout` / `setCookie` / `setInterval` (globals) → starts with "set"
 *   but no local definition → NOT a setter ✓
 * - `logPage` (local function) → local but doesn't start with "set" → NOT a
 *   setter ✓
 */
const isReactStateSetter = (
	context: Context,
	callee: ESTree.IdentifierReference,
): boolean => {
	const varName = callee.name;

	// React setters start with "set" (convention: setPageIndex, setData, etc.)
	if (!varName.startsWith('set')) {
		return false;
	}

	const sourceCode = context.sourceCode;

	// Walk up the scope chain to find the variable declaration. The setter
	// may be referenced in a nested block while declared in an outer scope.
	let scope = sourceCode.getScope(callee);
	let variable = scope.set.get(varName);
	while (!variable && scope.upper) {
		scope = scope.upper;
		variable = scope.set.get(varName);
	}
	if (!variable) return false;

	// A global has no real definition in user code. `ImplicitGlobalVariable`
	// is the scope manager's marker for an undeclared global reference.
	for (const def of variable.defs) {
		if (def.type !== 'ImplicitGlobalVariable') {
			return true;
		}
	}
	return false;
};

/**
 * True when the first argument of a setter call contains a reference to the
 * variable name anywhere in its AST subtree. This handles:
 * - Direct: `setPageIndex(clamped)`
 * - Functional update: `setPageIndex(prev => clamped)`
 * - Nullish coalescing: `setPageIndex(clamped ?? 0)`
 * - Type wrapper: `setPageIndex(Number(clamped))`
 * - Any other expression that references the variable.
 */
const firstArgContainsVar = (
	firstArg: ESTree.Expression | ESTree.SpreadElement | null,
	varName: string,
): boolean => {
	if (!firstArg) return false;
	// SpreadElement is not a valid first arg for a setter call, but
	// the AST type allows it — treat as not containing the variable.
	if (firstArg.type === 'SpreadElement') return false;
	let found = false;
	const visited = new WeakSet<ESTree.Node>();
	const walk = (node: ESTree.Node | null | undefined): void => {
		if (found || !node || typeof node !== 'object' || !('type' in node)) {
			return;
		}
		if (visited.has(node)) return;
		visited.add(node);
		if (node.type === 'Identifier' && node.name === varName) {
			found = true;
			return;
		}
		for (const value of Object.values(node)) {
			if (Array.isArray(value)) {
				for (const child of value) {
					if (child && typeof child === 'object' && 'type' in child) {
						walk(child as ESTree.Node);
					}
				}
			} else if (value && typeof value === 'object' && 'type' in value) {
				walk(value as ESTree.Node);
			}
		}
	};
	walk(firstArg);
	return found;
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
 * Uses the oxlint scope manager to walk variable references within the
 * enclosing scope. For each reference to `varName`, walks up the ancestor
 * chain to find an enclosing setter CallExpression. If the reference appears
 * inside the first argument of a setter CallExpression (whether as the
 * argument itself, nested in a functional update, nullish expression, or type
 * wrapper), considers it committed.
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
		// Walk up the ancestor chain. For `setPageIndex(prev => clamped)`,
		// the parent of `clamped` is `ArrowFunctionExpression`, whose parent
		// is the `CallExpression`. We need to walk up until we find a
		// CallExpression whose callee is a setter Identifier, then check
		// whether the reference was inside its first argument.
		let current: ESTree.Node = refNode;
		while (current.parent) {
			const parent: ESTree.Node = current.parent;
			if (
				parent.type === 'CallExpression' &&
				parent.callee.type === 'Identifier'
			) {
				const callee = parent.callee as ESTree.IdentifierReference;
				if (isReactStateSetter(context, callee)) {
					const firstArg = parent.arguments[0];
					if (firstArgContainsVar(firstArg, varName)) {
						return true;
					}
				}
				// If we reach a setter CallExpression and the variable isn't
				// in the first arg, this isn't a commitment — but keep
				// walking in case there's an outer setter (unlikely, but
				// safe).
			}
			current = parent;
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

				// Case 1: DIRECT commitment — the hook call IS the first argument
				// to a setter that traces back to useState/useReducer.
				//   setPageIndex(useOffsetPageClamp({...}))
				//   NOT: setTimeout(useOffsetPageClamp({...}), 100) — setTimeout
				//        is a global, not a React state setter.
				if (parent && parent.type === 'CallExpression') {
					if (
						parent.callee.type === 'Identifier' &&
						isReactStateSetter(context, parent.callee)
					) {
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
					// committed inside the first arg of a setter call.
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
