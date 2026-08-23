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
 *     DataTable screens (`components/table/**`) and the query-definition
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
 * / `||`, early return, `if`/`for`/`while` guard). Callback bodies
 * (effects, handlers, `useMemo`) are not render context and are skipped.
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
const EXCLUDED_RELATIVE_PREFIXES: readonly string[] = [
	'components/query-display',
	'components/table/',
	'lib/query/',
];

const ALLOWLISTED_RELATIVE_PATHS: readonly string[] = [
	'routes/__root.tsx',
	'routes/authed/layout.tsx',
	'routes/accept-invitation.tsx',
];

const isExcludedFile = (relativePath: string): boolean => {
	if (ALLOWLISTED_RELATIVE_PATHS.includes(relativePath)) {
		return true;
	}
	return EXCLUDED_RELATIVE_PREFIXES.some((prefix) =>
		relativePath.startsWith(prefix),
	);
};

interface TrackedBindings {
	/** Whole binding names: `const q = useQuery()` → "q" (member access q.flag). */
	whole: Set<string>;
	/** Destructured flag names: `const { isError } = useQuery()` → "isError". */
	flagged: Set<string>;
}

const getHookName = (init: ESTree.CallExpression): string | null => {
	const callee = init.callee;
	if (callee.type === 'Identifier') return callee.name;
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
	const tracked: TrackedBindings = { whole: new Set(), flagged: new Set() };

	const visited = new WeakSet<ESTree.Node>();
	const isQueryInit = (init: ESTree.Expression | null): boolean => {
		if (!init || init.type !== 'CallExpression') return false;
		const hookName = getHookName(init);
		return (
			hookName !== null &&
			isHookLikeName(hookName) &&
			isQueryHookName(hookName) &&
			!isMutationHookName(hookName)
		);
	};

	const visit = (node: ESTree.Node | null | undefined): void => {
		if (!node || visited.has(node)) return;
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
				if (isQueryInit(decl.init)) {
					if (id.type === 'Identifier') {
						tracked.whole.add(id.name);
					} else if (id.type === 'ObjectPattern') {
						for (const prop of id.properties) {
							if (prop.type !== 'Property') continue;
							if (
								prop.key.type === 'Identifier' &&
								QUERY_FLAG_FIELDS.has(prop.key.name)
							) {
								tracked.flagged.add(prop.key.name);
							}
						}
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
	return tracked;
};

/** Is this node a reference to a flagged query field? Returns the field name. */
const queryFieldRef = (
	node: ESTree.Node | null | undefined,
	tracked: TrackedBindings,
): string | null => {
	if (!node) return null;
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
	): void => {
		if (!node || typeof node !== 'object' || !('type' in node)) return;
		if (visited.has(node)) return;
		visited.add(node);

		if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
		) {
			// Do not descend into nested callbacks.
			return;
		}

		if (conditional) {
			const field = queryFieldRef(node, tracked);
			if (field !== null) onField(field);
		}

		switch (node.type) {
			case 'ConditionalExpression':
				scanInner(node.test, true);
				scanInner(node.consequent, true);
				scanInner(node.alternate, true);
				return;
			case 'LogicalExpression':
				scanInner(node.left, true);
				scanInner(node.right, true);
				return;
			case 'IfStatement':
				scanInner(node.test, true);
				scanInner(node.consequent, conditional);
				if (node.alternate) scanInner(node.alternate, conditional);
				return;
			case 'ReturnStatement':
				if (isConditionalExpr(node.argument)) {
					scanInner(node.argument, true);
				} else {
					scanInner(node.argument, conditional);
				}
				return;
			case 'ForStatement':
			case 'WhileStatement':
			case 'DoWhileStatement': {
				if ('test' in node && node.test) scanInner(node.test, true);
				if ('init' in node && node.init) scanInner(node.init, conditional);
				if ('update' in node && node.update)
					scanInner(node.update, conditional);
				scanInner(node.body, conditional);
				return;
			}
			case 'SwitchStatement':
				scanInner(node.discriminant, true);
				for (const c of node.cases) scanInner(c.consequent, conditional);
				return;
			case 'JSXElement':
			case 'JSXFragment':
				for (const child of node.children) {
					scanInner(child as ESTree.Node, conditional);
				}
				return;
			case 'JSXExpressionContainer':
				scanInner(node.expression, conditional);
				return;
			default: {
				for (const value of Object.values(node)) {
					if (Array.isArray(value)) {
						for (const child of value) {
							if (child && typeof child === 'object' && 'type' in child) {
								scanInner(child as ESTree.Node, conditional);
							}
						}
					} else if (value && typeof value === 'object' && 'type' in value) {
						scanInner(value as ESTree.Node, conditional);
					}
				}
			}
		}
	};
	scanInner(node, conditional);
};

/** Does a function body contain any JSX (i.e. is it a render function)? */
const containsJsx = (
	fn:
		| ESTree.FunctionDeclaration
		| ESTree.FunctionExpression
		| ESTree.ArrowFunctionExpression,
): boolean => {
	const body = fn.body;
	if (!body) return false;

	if (body.type === 'JSXElement' || body.type === 'JSXFragment') {
		return true;
	}
	if (body.type !== 'BlockStatement') return false;

	const visited = new WeakSet<ESTree.Node>();
	let found = false;
	const walk = (node: ESTree.Node | null | undefined): void => {
		if (found || !node || typeof node !== 'object' || !('type' in node)) return;
		if (visited.has(node)) return;
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
				node:
					| ESTree.FunctionDeclaration
					| ESTree.FunctionExpression
					| ESTree.ArrowFunctionExpression,
			) {
				if (!containsJsx(node)) return;
				const body = node.body;
				if (!body || body.type !== 'BlockStatement') return;

				const tracked = collectTrackedBindings(body);
				if (tracked.whole.size === 0 && tracked.flagged.size === 0) return;

				scan(body, false, tracked, (field) => {
					if (reportedFields.has(field)) return;
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
