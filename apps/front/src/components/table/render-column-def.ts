import type { ReactNode } from 'react';

/**
 * Renders a column def's `cell` / `header` template by calling it as a plain
 * function.
 *
 * TanStack's `flexRender` treats any function as a React COMPONENT type. Our
 * renderers are fresh closures on every table render, so each render swapped
 * the component type and remounted the cell (closing an open row menu and
 * dropping its state, #2418; same root cause as #2268 in the list table).
 *
 * Contract: a column renderer must not call React hooks. It runs inside the
 * table row's render, not as its own component. Need state or hooks in a cell?
 * Return an element of a real component (`cell: ({ row }) => <RowMenu ... />`).
 */
export const renderColumnDef = <Ctx>(
	def: ((ctx: Ctx) => ReactNode) | ReactNode | undefined,
	ctx: Ctx,
): ReactNode => (typeof def === 'function' ? def(ctx) : def);
