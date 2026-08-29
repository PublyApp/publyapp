import type { Context, Visitor } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

import {
	isFrontComponentTsxFile,
	normalizeFilename,
	getSourceRelativePath,
} from './path-scopes.ts';

/**
 * `publy/prefer-query-display` — require that a component rendering the
 * loading / error / empty / data states of a TanStack Query use the shared
 * `QueryDisplay` component instead of hand-rolling a conditional render on the
 * query's `isPending` / `isLoading` / `isError` / `isSuccess` / `status` /
 * `error` fields.
 *
 * Rationale (AGENTS.md → "Frontend Coding Standards" → Query state rendering):
 *   "QueryDisplay is mandatory for any component that renders
 *    loading/error/empty/data from a TanStack query."
 *
 * Scope:
 *   - Only front component `.tsx` files.
 *   - Excludes the implementation itself (`components/query-display.tsx`), the
 *     three DataTable screens pinned in `EXCLUDED_DATATABLE_RELATIVE_PATHS`
 *     (`data-table.tsx`, `floating-selection-bar.tsx`, `row-actions.tsx`) and the query-definition
 *     modules (`lib/query/**`) — those own their own list-state mechanism or
 *     merely call the hooks. The three allow-listed auth/routing state-machine
 *     route files are also excluded by path.
 *   - `useMutation` results are ignored (mutations are out of scope).
 *
 * Detection: a component binds a variable to a `use*Query` hook
 * (`useQuery` / `useSuspenseQuery` / `useInfiniteQuery` / any `use*Query`
 * name) — either as a whole binding (`const q = useQuery()`) or via
 * destructuring (`const { isError } = useQuery()`) — and then reads one of the
 * flagged fields from that binding inside a conditional render (ternary, `&&`
 * / `||`, early return, `if`/`for`/`while` guard). Binding tracking follows
 * simple data flow: renamed destructuring (`const { isPending: loading } =
 * useQuery()` tracks `loading`), rest elements (`const { data, ...rest } =
 * useQuery()` tracks `rest` as a whole binding), whole-binding aliasing
 * (`const r = useQuery(); const q = r;`) and destructuring from an already
 * tracked whole binding (`const { isPending } = q;`). Callback bodies
 * (effects, handlers, `useMemo`) are not render context and are skipped,
 * except JSX-returning render-prop callbacks (see below).
 *
 * Render props: an arrow/function expression that **returns JSX** and sits in
 * a JSX value position (a `JSXAttribute` value such as
 * `<Controller render={(…) => …}>`, or a JSX child expression such as
 * `<Select>{() => …}</Select>`) is render context, not an event handler, so
 * flagged-field reads inside it are detected. Event handlers (`onClick`,
 * `onSubmit`, effects, `useMemo`) do not return JSX and stay skipped.
 *
 * Hoisted render props: the same callback declared first and passed by
 * reference (`<Controller render={renderX}>`, `<Select>{renderItems}</Select>`,
 * `<Controller children={renderX}>`) or via a member expression
 * (`render={slots.render}`) executes during render exactly like its inline
 * equivalent, so locally-declared JSX-returning callbacks are resolved from
 * their reference and scanned too. References to functions declared outside
 * the component (module-level components/renderers) are not resolvable and
 * stay unscanned.
 */

const QUERY_FLAG_FIELDS: ReadonlySet<string> = new Set([
	'isPending',
	'isLoading',
	'isError',
	'isSuccess',
	'status',
	'error',
]);

const isHookLikeName = (name: string): boolean => /^use[A-Z]/.test(name);
const isQueryHookName = (name: string): boolean =>
	/^use[A-Z].*Query$/.test(name) || name === 'useQuery';
const isMutationHookName = (name: string): boolean =>
	name === 'useMutation' || /^use[A-Z].*Mutation$/.test(name);

/** Allow-listed implementation + state-machine + DataTable + query-def paths. */
export const EXCLUDED_RELATIVE_PREFIXES: readonly string[] = [
	'components/query-display',
	'lib/query/',
];

/**
 * Exempt DataTable screens: they own their own list-state mechanism.
 *
 * #1323: this list is PINNED by
 * `prefer-query-display.exemption.test.ts` and must never widen. It is an
 * explicit file list on purpose — the pre-#1323 broad `components/table/`
 * directory prefix silently exempted every future screen added to that
 * directory. When QueryDisplay PR 3 lands (DataTable delegating to
 * `resolveTableBodyState` via the `no-match` slot), this list shrinks and
 * the pin updates in the same PR.
 */
export const EXCLUDED_DATATABLE_RELATIVE_PATHS: readonly string[] = [
	'components/table/data-table.tsx',
	'components/table/floating-selection-bar.tsx',
	'components/table/row-actions.tsx',
];

export const ALLOWLISTED_RELATIVE_PATHS: readonly string[] = [
	'routes/__root.tsx',
	'routes/authed/layout.tsx',
	'routes/accept-invitation.tsx',
];

const isExcludedFile = (relativePath: string): boolean => {
	if (ALLOWLISTED_RELATIVE_PATHS.includes(relativePath)) {
		return true;
	}
	if (EXCLUDED_DATATABLE_RELATIVE_PATHS.includes(relativePath)) {
		return true;
	}
	return EXCLUDED_RELATIVE_PREFIXES.some((prefix) =>
		relativePath.startsWith(prefix),
	);
};

/** Locally-declared JSX-returning callback node (a hoisted render prop). */
type HoistedFn = ESTree.Function | ESTree.ArrowFunctionExpression;

interface TrackedBindings {
	/** Whole binding names: `const q = useQuery()` → "q" (member access q.flag). */
	whole: Set<string>;
	/** Destructured flag names: `const { isError } = useQuery()` → "isError". */
	flagged: Set<string>;
	/**
	 * Locally-declared JSX-returning callbacks: `const renderX = () => <jsx/>`
	 * → the function node. Referenced from a JSX attribute/child, they execute
	 * during render (hoisted render props).
	 */
	hoistedJsxCallbacks: Map<string, HoistedFn>;
	/** Object-literal initializers: `const slots = { render: … }` → the node. */
	objectLiterals: Map<string, ESTree.ObjectExpression>;
}

const getHookName = (init: ESTree.CallExpression): string | null => {
	const callee = init.callee;
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

/** Collect names bound to a `use*Query` hook (skipping `useMutation`). */
const collectTrackedBindings = (
	body: ESTree.BlockStatement,
): TrackedBindings => {
	const tracked: TrackedBindings = {
		whole: new Set(),
		flagged: new Set(),
		hoistedJsxCallbacks: new Map(),
		objectLiterals: new Map(),
	};

	// Aliasing can chain (`r = useQuery(); q = r; { isPending } = q`), so the
	// walk repeats until the tracked sets stop growing.
	const MAX_PASSES = 10;

	/** Track what a destructuring pattern binds from a query result object. */
	const trackPattern = (id: ESTree.ObjectPattern): boolean => {
		let changed = false;
		for (const prop of id.properties) {
			if (prop.type === 'Property') {
				if (
					prop.key.type === 'Identifier' &&
					prop.value.type === 'Identifier' &&
					QUERY_FLAG_FIELDS.has(prop.key.name) &&
					!tracked.flagged.has(prop.value.name)
				) {
					// Renamed destructuring: `const { isPending: loading }`.
					tracked.flagged.add(prop.value.name);
					changed = true;
				}
			} else if (
				prop.type === 'RestElement' &&
				prop.argument.type === 'Identifier' &&
				!tracked.whole.has(prop.argument.name)
			) {
				// Rest aliasing: `const { data, ...rest }` keeps a whole result.
				tracked.whole.add(prop.argument.name);
				changed = true;
			}
		}
		return changed;
	};

	const runPass = (): boolean => {
		let changed = false;
		const visited = new WeakSet<ESTree.Node>();

		const isQueryInit = (init: ESTree.Expression | null): boolean => {
			if (!init || init.type !== 'CallExpression') {
				return false;
			}
			const hookName = getHookName(init);
			return (
				hookName !== null &&
				isHookLikeName(hookName) &&
				isQueryHookName(hookName) &&
				!isMutationHookName(hookName)
			);
		};

		/** Is this initializer a reference to a tracked whole binding? */
		const isWholeBindingRef = (init: ESTree.Expression | null): boolean =>
			init !== null &&
			init.type === 'Identifier' &&
			tracked.whole.has(init.name);

		const visit = (node: ESTree.Node | null | undefined): void => {
			if (!node || visited.has(node)) {
				return;
			}
			visited.add(node);
			if (
				node.type === 'FunctionDeclaration' ||
				node.type === 'FunctionExpression' ||
				node.type === 'ArrowFunctionExpression'
			) {
				// Skip nested callback bodies (effects, handlers, useMemo).
				return;
			}
			if (node.type === 'VariableDeclaration') {
				for (const decl of node.declarations) {
					const id = decl.id;
					const init = decl.init;
					const fromQuery = isQueryInit(init);
					const fromTrackedWhole = isWholeBindingRef(init);
					if (id.type === 'Identifier') {
						if (
							(fromQuery || fromTrackedWhole) &&
							!tracked.whole.has(id.name)
						) {
							// Whole binding from the hook, or an alias of one:
							// `const q = useQuery(); const alias = q;`.
							tracked.whole.add(id.name);
							changed = true;
						}
						if (
							(init?.type === 'ArrowFunctionExpression' ||
								init?.type === 'FunctionExpression') &&
							directlyReturnsJsx(init) &&
							!tracked.hoistedJsxCallbacks.has(id.name)
						) {
							// Locally-declared JSX-returning callback: a hoisted
							// render prop when referenced from a JSX slot.
							tracked.hoistedJsxCallbacks.set(id.name, init);
						}
						if (init?.type === 'ObjectExpression') {
							// Remember object literals so `render={slots.render}`
							// can resolve to the stored callback.
							tracked.objectLiterals.set(id.name, init);
						}
					} else if (
						id.type === 'ObjectPattern' &&
						(fromQuery || fromTrackedWhole)
					) {
						if (trackPattern(id)) {
							changed = true;
						}
					}
				}
			}
			for (const value of Object.values(node)) {
				if (Array.isArray(value)) {
					for (const child of value) {
						if (child && typeof child === 'object' && 'type' in child) {
							visit(child as ESTree.Node);
						}
					}
				} else if (value && typeof value === 'object' && 'type' in value) {
					visit(value as ESTree.Node);
				}
			}
		};

		visit(body);
		return changed;
	};

	for (let pass = 0; pass < MAX_PASSES; pass += 1) {
		if (!runPass()) {
			break;
		}
	}

	return tracked;
};

/** Is this node a reference to a flagged query field? Returns the field name. */
const queryFieldRef = (
	node: ESTree.Node | null | undefined,
	tracked: TrackedBindings,
): string | null => {
	if (!node) {
		return null;
	}
	if (node.type === 'MemberExpression' && !node.computed) {
		const object = node.object;
		const property = node.property;
		if (
			object.type === 'Identifier' &&
			property.type === 'Identifier' &&
			tracked.whole.has(object.name) &&
			QUERY_FLAG_FIELDS.has(property.name)
		) {
			return property.name;
		}
		return null;
	}
	if (node.type === 'Identifier' && tracked.flagged.has(node.name)) {
		return node.name;
	}
	return null;
};

const isConditionalExpr = (node: ESTree.Node | null | undefined): boolean =>
	node !== null &&
	node !== undefined &&
	(node.type === 'ConditionalExpression' || node.type === 'LogicalExpression');

/**
 * Resolve a hoisted render-prop reference — `render={renderX}` or
 * `render={obj.render}` — to the locally-declared function value it names.
 * Returns `null` for anything not resolvable to a local declaration.
 */
const resolveHoistedCallback = (
	tracked: TrackedBindings,
	expr: ESTree.Node | null | undefined,
): HoistedFn | null => {
	if (!expr) {
		return null;
	}
	if (expr.type === 'Identifier') {
		return tracked.hoistedJsxCallbacks.get(expr.name) ?? null;
	}
	if (
		expr.type === 'MemberExpression' &&
		!expr.computed &&
		expr.object.type === 'Identifier' &&
		expr.property.type === 'Identifier'
	) {
		const literal = tracked.objectLiterals.get(expr.object.name);
		if (!literal) {
			return null;
		}
		for (const prop of literal.properties) {
			if (
				prop.type === 'Property' &&
				prop.key.type === 'Identifier' &&
				prop.key.name === expr.property.name &&
				(prop.value.type === 'ArrowFunctionExpression' ||
					prop.value.type === 'FunctionExpression')
			) {
				return prop.value as HoistedFn;
			}
		}
	}
	return null;
};

/**
 * Does this arrow/function expression itself produce JSX? Unlike
 * `containsJsx`, this stops at nested function boundaries: a handler whose
 * body calls something JSX-returning is not a render function, and a
 * render-prop callback containing an inline event handler stays a render
 * prop only because of its own expression. Covers concise bodies too
 * (`(…) => (cond ? <A/> : <B/>)`, `(…) => <A/>`).
 *
 * Type note: @oxlint/plugins@1.x models declaration+expression functions as
 * one exported `Function` type (there is no `FunctionDeclaration` /
 * `FunctionExpression` pair in its ESTree namespace).
 */
const directlyReturnsJsx = (
	fn: ESTree.Function | ESTree.ArrowFunctionExpression,
): boolean => {
	const body = fn.body;
	if (!body) {
		return false;
	}

	const visited = new WeakSet<ESTree.Node>();
	let found = false;
	const walk = (node: ESTree.Node | null | undefined): void => {
		if (found || !node || typeof node !== 'object' || !('type' in node)) {
			return;
		}
		if (visited.has(node)) {
			return;
		}
		visited.add(node);
		if (
			node.type === 'ArrowFunctionExpression' ||
			node.type === 'FunctionExpression' ||
			node.type === 'FunctionDeclaration'
		) {
			// Nested callbacks own their own expressions.
			return;
		}
		if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
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
	walk(body);
	return found;
};

/** Walk a component body for conditional renders reading a flagged field. */
const scan = (
	node: ESTree.Node | null | undefined,
	conditional: boolean,
	tracked: TrackedBindings,
	onField: (field: string) => void,
): void => {
	const visited = new WeakSet<ESTree.Node>();
	const scanInner = (
		node: ESTree.Node | null | undefined,
		conditional: boolean,
		jsxValuePosition: boolean,
	): void => {
		if (!node || typeof node !== 'object' || !('type' in node)) {
			return;
		}
		if (visited.has(node)) {
			return;
		}
		visited.add(node);

		if (
			node.type === 'ArrowFunctionExpression' ||
			node.type === 'FunctionExpression'
		) {
			// Render-prop exception: a JSX-returning callback sitting directly
			// in a JSX attribute value (`<Controller render={(…) => …}>`) or a
			// JSX child expression (`children={() => …}`) executes during
			// render — its body is render context, so descend into it. The
			// callback's own conditionals establish context from there.
			// Event handlers (`onClick`, `onSubmit`) and effect/memo callbacks
			// do not return JSX and stay skipped.
			if (jsxValuePosition && directlyReturnsJsx(node)) {
				scanInner(node.body, false, false);
			}
			return;
		}
		if (node.type === 'FunctionDeclaration') {
			// Never render context in an expression walk.
			return;
		}
		if (conditional) {
			const field = queryFieldRef(node, tracked);
			if (field !== null) {
				onField(field);
			}
		}

		switch (node.type) {
			case 'ConditionalExpression':
				scanInner(node.test, true, false);
				scanInner(node.consequent, true, false);
				scanInner(node.alternate, true, false);
				return;
			case 'LogicalExpression':
				scanInner(node.left, true, false);
				scanInner(node.right, true, false);
				return;
			case 'IfStatement':
				scanInner(node.test, true, false);
				scanInner(node.consequent, conditional, false);
				if (node.alternate) {
					scanInner(node.alternate, conditional, false);
				}
				return;
			case 'ReturnStatement':
				if (isConditionalExpr(node.argument)) {
					scanInner(node.argument, true, false);
				} else {
					scanInner(node.argument, conditional, false);
				}
				return;
			case 'ForStatement':
			case 'WhileStatement':
			case 'DoWhileStatement': {
				if ('test' in node && node.test) {
					scanInner(node.test, true, false);
				}
				if ('init' in node && node.init) {
					scanInner(node.init, conditional, false);
				}
				if ('update' in node && node.update) {
					scanInner(node.update, conditional, false);
				}
				scanInner(node.body, conditional, false);
				return;
			}
			case 'SwitchStatement': {
				// The discriminant is a value read, so it is render context.
				// Case bodies are walked too: a hand-rolled state ladder inside
				// `switch` is as much a conditional render as an `if` chain.
				scanInner(node.discriminant, true, false);
				for (const caseClause of node.cases) {
					for (const statement of caseClause.consequent) {
						scanInner(statement, conditional, false);
					}
				}
				return;
			}
			case 'JSXElement':
			case 'JSXFragment': {
				// Opening elements carry the attributes (render props live there).
				const edges =
					'openingElement' in node
						? [node.openingElement, node.closingElement]
						: [node.openingFragment, node.closingFragment];
				for (const edge of edges) {
					if (edge) {
						scanInner(edge as ESTree.Node, conditional, false);
					}
				}
				for (const child of node.children) {
					// Children sit in a JSX value position: an inline function
					// expression child is a render prop candidate.
					scanInner(child as ESTree.Node, conditional, true);
				}
				return;
			}
			case 'JSXExpressionContainer': {
				const expr = node.expression;
				if (expr.type === 'Identifier' || expr.type === 'MemberExpression') {
					// Hoisted render-prop child: `<Select>{renderItems}</Select>`.
					const hoistedFn = resolveHoistedCallback(tracked, expr);
					if (hoistedFn && directlyReturnsJsx(hoistedFn)) {
						scanInner(hoistedFn.body, false, false);
					}
					return;
				}
				scanInner(expr, conditional, true);
				return;
			}
			case 'JSXAttribute': {
				scanInner(node.name, conditional, false);
				const value = node.value;
				if (!value) {
					return;
				}
				if (value.type === 'JSXExpressionContainer') {
					// Only a function value is a render-prop candidate
					// (`<Controller render={(…) => …}>`). Any other expression
					// computes a prop (`disabled={q.isPending}`,
					// `title={q.isPending ? … : undefined}`) — it does not render
					// a query state, so it is not a hand-rolled ladder.
					const expr = value.expression;
					if (
						expr.type === 'ArrowFunctionExpression' ||
						expr.type === 'FunctionExpression'
					) {
						scanInner(expr, conditional, true);
						return;
					}
					// Hoisted render-prop reference: `render={renderX}` /
					// `render={obj.render}` / `children={renderX}` executes during
					// render exactly like its inline equivalent — resolve the local
					// declaration and scan it (r2-review bypass fix).
					const hoistedFn = resolveHoistedCallback(tracked, expr);
					if (hoistedFn && directlyReturnsJsx(hoistedFn)) {
						scanInner(hoistedFn.body, false, false);
					}
					return;
				}
				if (value.type === 'JSXElement' || value.type === 'JSXFragment') {
					scanInner(value, conditional, false);
				}
				return;
			}
			default: {
				for (const value of Object.values(node)) {
					if (Array.isArray(value)) {
						for (const child of value) {
							if (child && typeof child === 'object' && 'type' in child) {
								scanInner(child as ESTree.Node, conditional, false);
							}
						}
					} else if (value && typeof value === 'object' && 'type' in value) {
						scanInner(value as ESTree.Node, conditional, false);
					}
				}
			}
		}
	};
	scanInner(node, conditional, false);
};

/** Does a function body contain any JSX (i.e. is it a render function)? */
const containsJsx = (
	fn: ESTree.Function | ESTree.ArrowFunctionExpression,
): boolean => {
	const body = fn.body;
	if (!body) {
		return false;
	}

	if (body.type === 'JSXElement' || body.type === 'JSXFragment') {
		return true;
	}
	if (body.type !== 'BlockStatement') {
		return false;
	}

	const visited = new WeakSet<ESTree.Node>();
	let found = false;
	const walk = (node: ESTree.Node | null | undefined): void => {
		if (found || !node || typeof node !== 'object' || !('type' in node)) {
			return;
		}
		if (visited.has(node)) {
			return;
		}
		visited.add(node);
		if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
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
	walk(body);
	return found;
};

export const preferQueryDisplay = {
	meta: {
		type: 'suggestion' as const,
		docs: {
			description:
				'Require QueryDisplay for components rendering TanStack Query loading/error/empty/data states instead of hand-rolled conditional ladders.',
			recommended: false,
		},
		schema: [],
		messages: {
			preferQueryDisplay:
				'Render this TanStack Query state with the shared `QueryDisplay` component (loading / error / empty / data slots) rather than a hand-rolled conditional on `{{field}}`.',
		},
	},
	create(context: Context): Visitor {
		const rawFilename = normalizeFilename(
			typeof context.filename === 'string' ? context.filename : '',
		);

		if (!isFrontComponentTsxFile(rawFilename)) {
			return {};
		}

		const relativePath = getSourceRelativePath(rawFilename);

		if (isExcludedFile(relativePath)) {
			return {};
		}

		const reportedFields = new Set<string>();

		return {
			'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(
				node: ESTree.Function | ESTree.ArrowFunctionExpression,
			) {
				if (!containsJsx(node)) {
					return;
				}
				const body = node.body;
				if (!body || body.type !== 'BlockStatement') {
					return;
				}

				const tracked = collectTrackedBindings(body);
				if (tracked.whole.size === 0 && tracked.flagged.size === 0) {
					return;
				}

				scan(body, false, tracked, (field) => {
					if (reportedFields.has(field)) {
						return;
					}
					reportedFields.add(field);
					context.report({
						node,
						messageId: 'preferQueryDisplay',
						data: { field },
					});
				});
			},
		};
	},
};
