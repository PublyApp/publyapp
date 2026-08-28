/**
 * Tests for guard #1769: refuse `ColumnDef`, `Row` and `TanStackTable`
 * imported from `@tanstack/react-table` or `@tanstack/react-table/legacy`.
 *
 * The guard exists to stop the third occurrence of a developer importing
 * the v9 root types instead of the passthrough at `column-type.ts`. These
 * tests recreate violating imports, run the guard, and assert it is RED;
 * then exercise the passthrough and legitimate imports and assert GREEN.
 *
 * Adversarial coverage (per the brief — prove the guard cannot be bypassed
 * while keeping tests green):
 *   - a local re-export shim (`export { ColumnDef } from '@tanstack/react-table'`);
 *   - `import type` vs `import` (both must be caught);
 *   - a relative path to the passthrough (`./column-type`) — must stay GREEN;
 *   - a dynamic `import('@tanstack/react-table')` call — must be caught.
 *
 * NOTE ON `no-floating-promises`: this file uses `node:test` (not vitest).
 * `node:test`'s runner captures test outcomes via its async-context mechanism,
 * independent of the returned Promise. The `typescript(no-floating-promises)`
 * rule flags `test()` as returning `Promise<void>` per `@types/node` 26.x, but
 * in the `node:test` execution model that Promise is fire-and-forget — the
 * runner does not depend on the caller awaiting it. We therefore prefix each
 * `test()` call with `void` (a targeted, per-call suppression) rather than
 * disabling the rule for the entire file.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	scanFrontSrcForBannedImports,
	formatFinding,
} from './check-column-type-imports.mts';

const here = path.dirname(fileURLToPath(import.meta.url));

const sandboxes: string[] = [];

after(() => {
	for (const dir of sandboxes) {
		rmSync(dir, { recursive: true, force: true });
	}
});

/**
 * Creates a throwaway front source tree, writes `files` into it, and returns
 * the root directory. The tree lives under `scripts/` so ts-morph resolves
 * the same way it does in the real guard.
 */
const makeSandbox = (files: Record<string, string>): string => {
	const dir = mkdtempSync(path.join(here, 'column-type-guard-'));
	sandboxes.push(dir);
	for (const [relative, content] of Object.entries(files)) {
		const full = path.join(dir, relative);
		mkdirSync(path.dirname(full), { recursive: true });
		writeFileSync(full, content);
	}
	return dir;
};

// ---------------------------------------------------------------------------
// RED proofs: importing the banned types from the banned specifiers fails.
// ---------------------------------------------------------------------------

void test('flags ColumnDef imported from @tanstack/react-table', () => {
	const root = makeSandbox({
		'src/routes/authed/tenant/posts/drafts.tsx':
			`import type { ColumnDef } from '@tanstack/react-table';\n` +
			`export const columns = [] as ColumnDef<never>[];\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1, 'expected exactly one finding');
	const f = findings[0];
	assert.match(f.file, /drafts\.tsx$/);
	assert.equal(f.specifier, '@tanstack/react-table');
	assert.ok(
		f.bindings.includes('ColumnDef'),
		`expected ColumnDef in bindings, got ${JSON.stringify(f.bindings)}`,
	);
	// The message must name the replacement.
	const message = formatFinding(f);
	assert.match(message, /column-type/);
	assert.match(message, /#1769/);
});

void test('flags Row imported from @tanstack/react-table', () => {
	const root = makeSandbox({
		'src/components/table/body.tsx':
			`import type { Row } from '@tanstack/react-table';\n` +
			`export const x = null as Row<never>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1);
	assert.equal(findings[0].specifier, '@tanstack/react-table');
	assert.ok(findings[0].bindings.includes('Row'));
});

void test('flags TanStackTable imported from @tanstack/react-table', () => {
	const root = makeSandbox({
		'src/components/table/grid.tsx':
			`import type { TanStackTable } from '@tanstack/react-table';\n` +
			`export const x = null as TanStackTable<never>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1);
	assert.equal(findings[0].specifier, '@tanstack/react-table');
	assert.ok(findings[0].bindings.includes('TanStackTable'));
});

void test('flags imports from @tanstack/react-table/legacy (always banned)', () => {
	const root = makeSandbox({
		'src/components/table/legacy.ts':
			`import type { LegacyColumnDef } from '@tanstack/react-table/legacy';\n` +
			`export const x = null as LegacyColumnDef;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	// Legacy specifier is always flagged, even for non-banned names.
	assert.equal(findings.length, 1);
	assert.equal(findings[0].specifier, '@tanstack/react-table/legacy');
});

void test('flags multi-name import with at least one banned name', () => {
	const root = makeSandbox({
		'src/routes/authed/staff/tenants.tsx':
			`import type { ColumnDef, SortingState } from '@tanstack/react-table';\n` +
			`export const x = null as ColumnDef<never>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1);
	assert.ok(findings[0].bindings.includes('ColumnDef'));
});

void test('flags default import aliased to a banned name', () => {
	const root = makeSandbox({
		'src/routes/authed/staff/users.tsx':
			`import ColumnDef from '@tanstack/react-table';\n` +
			`export const x = null as ColumnDef<never>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1);
	assert.ok(findings[0].bindings.includes('ColumnDef'));
});

void test('flags namespace import aliased to a banned name', () => {
	const root = makeSandbox({
		'src/routes/authed/staff/profiles.tsx':
			`import * as ColumnDef from '@tanstack/react-table';\n` +
			`export const x = null as ColumnDef<never>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1);
	assert.ok(findings[0].bindings.includes('ColumnDef'));
});

// ---------------------------------------------------------------------------
// GREEN proofs: the passthrough and legitimate imports stay clean.
// ---------------------------------------------------------------------------

void test('allows the passthrough file itself (column-type.ts)', () => {
	const root = makeSandbox({
		'src/components/table/column-type.ts':
			`import { useLegacyTable } from '@tanstack/react-table/legacy';\n` +
			`import type { LegacyColumnDef } from '@tanstack/react-table/legacy';\n` +
			`export type ColumnDef = LegacyColumnDef;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(
		findings.length,
		0,
		`expected no findings, got ${JSON.stringify(findings)}`,
	);
});

void test('flags data-table.tsx if it imports from legacy (no exemption)', () => {
	// The brief asked to verify whether data-table.tsx needs an exemption.
	// It does not import from @tanstack/react-table at all (checked against
	// the current tree), so it is NOT exempt. If it did import from the
	// legacy module, it would be flagged.
	const root = makeSandbox({
		'src/components/table/data-table.tsx':
			`import { useLegacyTable } from '@tanstack/react-table/legacy';\n` +
			`export const x = useLegacyTable;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1, 'expected the legacy import to be flagged');
	assert.equal(findings[0].specifier, '@tanstack/react-table/legacy');
});

void test('allows non-banned imports from @tanstack/react-table', () => {
	const root = makeSandbox({
		'src/components/table/sort.ts':
			`import type { SortingState } from '@tanstack/react-table';\n` +
			`import { flexRender } from '@tanstack/react-table';\n` +
			`export const x: SortingState = [];\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 0);
});

void test('allows import from the passthrough via relative path', () => {
	const root = makeSandbox({
		'src/components/table/grid.tsx':
			`import type { ColumnDef, Row, TanStackTable } from './column-type';\n` +
			`export const c = null as ColumnDef<never>;\n` +
			`export const r = null as Row<never>;\n` +
			`export const t = null as TanStackTable<never>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 0);
});

void test('allows import from the passthrough via ~/ alias', () => {
	const root = makeSandbox({
		'src/routes/authed/tenant/posts/history.tsx':
			`import type { ColumnDef } from '~/components/table/column-type';\n` +
			`export const c = null as ColumnDef<never>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 0);
});

void test('allows module augmentation (declare module)', () => {
	const root = makeSandbox({
		'src/components/table/column-display-meta.ts':
			`import type { ColumnDef } from './column-type';\n` +
			`declare module '@tanstack/react-table' {\n` +
			`  interface ColumnMeta { headerIcon?: unknown; }\n` +
			`}\n` +
			`export const x = null as ColumnDef<never>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Adversarial mutations: prove the guard cannot be bypassed.
// ---------------------------------------------------------------------------

void test('ADVERSE: catches local re-export shim (export ... from)', () => {
	const root = makeSandbox({
		'src/lib/table-types.ts': `export { ColumnDef } from '@tanstack/react-table';\n`,
		'src/routes/authed/tenant/posts/drafts.tsx':
			`import type { ColumnDef } from '../lib/table-types';\n` +
			`export const c = null as ColumnDef<never>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	// The shim itself is flagged (it imports + re-exports the banned name).
	// The consumer imports from the shim, not from the banned specifier, so
	// it is NOT flagged — but the shim is, which is the point.
	assert.ok(
		findings.length >= 1,
		`expected at least one finding, got ${JSON.stringify(findings)}`,
	);
	const shimFinding = findings.find((f) => f.file.includes('table-types'));
	assert.ok(shimFinding, 'expected the shim file to be flagged');
	assert.ok(shimFinding!.bindings.includes('ColumnDef'));
});

void test('ADVERSE: catches import type (not just value import)', () => {
	const root = makeSandbox({
		'src/routes/authed/staff/tenants.tsx':
			`import type { ColumnDef } from '@tanstack/react-table';\n` +
			`export const c = null as ColumnDef<never>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1);
	assert.ok(findings[0].bindings.includes('ColumnDef'));
});

void test('ADVERSE: catches dynamic import()', () => {
	const root = makeSandbox({
		'src/routes/authed/staff/tenants.tsx':
			`const mod = import('@tanstack/react-table');\n` +
			`export const c = mod;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1);
	assert.equal(findings[0].specifier, '@tanstack/react-table');
	assert.ok(findings[0].bindings.includes('(dynamic import)'));
});

void test('ADVERSE: catches multi-line import spanning lines', () => {
	const root = makeSandbox({
		'src/routes/authed/staff/tenants.tsx':
			`import {\n` +
			`  ColumnDef,\n` +
			`  Row,\n` +
			`} from '@tanstack/react-table';\n` +
			`export const c = null as ColumnDef<never>;\n` +
			`export const r = null as Row<never>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1);
	assert.ok(findings[0].bindings.includes('ColumnDef'));
	assert.ok(findings[0].bindings.includes('Row'));
});

void test('ADVERSE: catches aliased import (import { foo as ColumnDef })', () => {
	const root = makeSandbox({
		'src/routes/authed/staff/tenants.tsx':
			`import { SomeOtherName as ColumnDef } from '@tanstack/react-table';\n` +
			`export const c = null as ColumnDef<never>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1);
	// The local name is what the developer wrote; the banned name is the alias.
	assert.ok(
		findings[0].bindings.includes('ColumnDef') ||
			findings[0].bindings.includes('SomeOtherName'),
		`expected a binding match, got ${JSON.stringify(findings[0].bindings)}`,
	);
});

// ---------------------------------------------------------------------------
// Message quality: the message must name the replacement.
// ---------------------------------------------------------------------------

void test('message names the exact replacement', () => {
	const root = makeSandbox({
		'src/routes/authed/tenant/posts/drafts.tsx':
			`import type { ColumnDef } from '@tanstack/react-table';\n` +
			`export const c = null as ColumnDef<never>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1);
	const message = formatFinding(findings[0]);
	assert.match(message, /column-type/);
	assert.match(message, /#1769/);
	assert.match(message, /drafts\.tsx/);
});
