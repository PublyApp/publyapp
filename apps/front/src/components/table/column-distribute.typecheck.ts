/**
 * Compilation-time proof that `Distribute<T>` in `column-type.ts` really
 * distributes the legacy column-def union (follow-up #1583, ticket #1755).
 *
 * The mapped type exists so EACH union member keeps ALL of its own properties
 * (`accessorKey`, `accessorFn`, ...) instead of a bare `keyof` on the union,
 * which always intersects to the member-common keys. That claim used to rest
 * on reading the language specification; this file makes it a compiled
 * artifact. It imports the REAL `ColumnDef` from `./column-type` — no local
 * replica of the mapped type, no fixture — and pins the observable contract:
 *
 * - a value carrying the accessor-member-only `accessorKey` must be assignable
 *   to `ColumnDef` (probe 1), as must one carrying `accessorFn` (probe 2);
 * - a display column (neither accessor key nor accessor fn) must stay
 *   assignable, so the type remains a UNION and not the intersection of every
 *   member's required keys (probe 3);
 * - the negative probes pin the reason the mapped type is needed at all:
 *   `keyof` on the union does NOT surface `accessorKey` — the language fact
 *   the round-4 review argued from. These directives also catch the FLATTEN
 *   mutation (a single object that merges every member's keys): flattening
 *   makes `'accessorKey'` a `keyof` key, the `@ts-expect-error` goes unused,
 *   and the file stops compiling.
 *
 * The file is part of the main tsconfig program, so `pnpm --filter front
 * typecheck` (CI: front-ci.yml, job gate, step "Typecheck front") compiles it.
 * A regression in `Distribute<T>` that drops a member-specific property turns
 * this file into compile errors and the gate red with the property named.
 */
import type { ColumnDef } from './column-type';

type RowData = Record<string, unknown>;

// ---- Probe 1: the accessor-member key survives the mapped-type round-trip --
// `accessorKey` exists ONLY on the accessor member of the legacy union. A
// non-distributing mapped type (a plain `{ [K in keyof T]: T[K] }` over the
// union) would intersect the members into the common keys and drop it — this
// assignment would then fail as an excess property.
const _accessorKeyColumn: ColumnDef<RowData, string> = {
	accessorKey: 'id',
	id: 'member',
	header: 'Member',
};
void _accessorKeyColumn;

// ---- Probe 2: the accessor-fn member key survives as well ----------------
const _accessorFnColumn: ColumnDef<RowData, string> = {
	accessorFn: (row) => String(row.name),
	header: 'Name',
};
void _accessorFnColumn;

// ---- Probe 3: a display column (no accessor key or fn) stays assignable ----
// On the regressed INTERSECTION form, `accessorKey`/`accessorFn` would be
// required by every column and this display-only value would fail to compile.
const _displayColumn: ColumnDef<RowData, string> = {
	header: 'ID',
	id: 'id',
};
void _displayColumn;

// ---- Negative probe: keyof on the union intersects; that is why the mapped
// ---- type is used at all ---------------------------------------------------
// `keyof` on a union of the (distributed) members is the intersection of their
// keys, and `accessorKey` is not common to all members. This is the language
// fact the distribution claim rests on. If a future change FLATTENS the union
// into one object, `accessorKey` becomes a key and this directive goes unused:
// `tsc` reports error TS2578 and the gate turns red either way.
type ColumnKeys = keyof ColumnDef<RowData, string>;

// @ts-expect-error — accessorKey is not a key of the distributed union: keyof
// intersects to the member-common keys.
const _accessorKeyIsNotAKey: ColumnKeys = 'accessorKey';
void _accessorKeyIsNotAKey;
