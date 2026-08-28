// Single chokepoint for the legacy @tanstack/react-table/legacy imports.
// All five deprecated symbols (ColumnDef, useLegacyTable, TanStackTable,
// LegacyTable, LegacyRow) flow through this file. The rest of the codebase
// imports them from here — keeping the `typescript/no-deprecated` suppression
// confined to this file + data-table.tsx (see `.oxlintrc.json`).
//
// A mapped type (not a bare alias) so the type checker sees a NEW type:
// `typescript/no-deprecated` follows type aliases back to the deprecated
// source, so `export type { LegacyColumnDef as ColumnDef }` would NOT confine
// anything — the checker would still flag every consumer.
//
// The `Distribute<T>` mapped type applies a homomorphic identity conditional to
// each union member separately, preserving ALL properties (accessorKey,
// accessorFn, etc.) rather than only the common keys. A plain `keyof` on a
// union always intersects to the shared keys — that is the language spec, not
// a flaw in the mapped type, and it is why `ColumnDef`'s member-specific
// accessors survive the round-trip but `keyof` would not surface them.
//
// `useLegacyTable` is a VALUE, not a type, so `Distribute<...>` does not apply.
// It is re-exported as a plain alias; data-table.tsx earns its own exception in
// `.oxlintrc.json` because it calls deprecated runtime values directly.

import { useLegacyTable as useLegacyTableValue } from '@tanstack/react-table/legacy';
import {
	getCoreRowModel,
	type LegacyColumnDef,
	type LegacyRow,
	type LegacyTable as LegacyTableType,
	type LegacyReactTable,
} from '@tanstack/react-table/legacy';

// Re-export non-deprecated helpers so callers never import from the legacy
// module directly.
export { getCoreRowModel };
export { useLegacyTableValue as useLegacyTable };

// v9 moved RowData to table-core; this alias keeps the constraint local.
type RowData = Record<string, unknown>;

type Identity<T> = T extends infer U ? U : never;
type Prettify<T> = { [K in keyof T]: T[K] };
type Distribute<T> = Identity<T> extends infer U ? Prettify<U> : never;

export type ColumnDef<TData extends RowData, TValue = unknown> = Distribute<
	LegacyColumnDef<TData, TValue>
>;

// TanStackTable is the full legacy table type (with deprecated getState/setState).
export type TanStackTable<TData extends RowData> = Distribute<
	LegacyReactTable<TData>
>;

// LegacyTable is the base table type without deprecated state methods.
export type LegacyTable<TData extends RowData> = Distribute<
	LegacyTableType<TData>
>;

export type Row<TData extends RowData> = Distribute<LegacyRow<TData>>;
