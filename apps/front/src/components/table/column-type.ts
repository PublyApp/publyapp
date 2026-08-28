// Single chokepoint for the legacy ColumnDef import. The rest of the codebase
// (route column defs, tests) imports `ColumnDef` from here — keeping the
// `@tanstack/react-table/legacy` deprecation confined to one file under
// `components/table/**`, where `typescript/no-deprecated` is off (.oxlintrc.json).
//
// A mapped type (not a bare alias) so the type checker sees a NEW type without
// the `@deprecated` JSDoc tag — `typescript/no-deprecated` follows aliases back
// to the deprecated source, so `export type { LegacyColumnDef as ColumnDef }`
// would not confine anything.
import type { LegacyColumnDef } from '@tanstack/react-table/legacy';

// v9 moved RowData to table-core; this alias keeps the constraint local.
type RowData = Record<string, unknown>;

// Homomorphic mapped type over an identity conditional: maps over each union
// member separately so all properties are preserved. A plain `keyof` on a
// union returns only common keys, dropping accessorKey/accessorFn/etc. that
// live on specific members.
type Identity<T> = T extends infer U ? U : never;
type Prettify<T> = { [K in keyof T]: T[K] };
type Distribute<T> = Identity<T> extends infer U ? Prettify<U> : never;

export type ColumnDef<TData extends RowData, TValue = unknown> = Distribute<
	LegacyColumnDef<TData, TValue>
>;
