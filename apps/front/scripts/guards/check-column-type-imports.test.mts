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
	SCANNED_EXTENSIONS,
	NON_CODE_EXTENSIONS,
	assertNoOverlap,
	assertAllJustified,
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
// Bypass coverage: the three false negatives from r1 must now be caught.
// ---------------------------------------------------------------------------

void test('ADVERSE: catches namespace import (import * as ReactTable from)', () => {
	// `import * as ReactTable from '@tanstack/react-table'` gives access to
	// ALL exports including the banned types. The alias is NOT one of the
	// banned names, so the old guard missed it. The new guard flags any
	// namespace import from a banned specifier.
	const root = makeSandbox({
		'src/routes/authed/staff/profiles.tsx':
			`import * as ReactTable from '@tanstack/react-table';\n` +
			`export const x = null as ReactTable.ColumnDef<any>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1, 'expected exactly one finding');
	assert.equal(findings[0].specifier, '@tanstack/react-table');
	assert.ok(findings[0].bindings.includes('(namespace import)'));
});

void test('ADVERSE: catches require() call', () => {
	// `const ReactTable = require('@tanstack/react-table')` is a CommonJS
	// module load that brings the same root types into scope. The guard
	// must flag require calls whose first argument is a banned specifier.
	const root = makeSandbox({
		'src/routes/authed/staff/profiles.tsx':
			`const ReactTable = require('@tanstack/react-table');\n` +
			`export const x = null as ReactTable.ColumnDef<any>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1, 'expected exactly one finding');
	assert.equal(findings[0].specifier, '@tanstack/react-table');
	assert.ok(findings[0].bindings.includes('(require call)'));
});

void test('ADVERSE: catches wildcard re-export (export * from)', () => {
	// `export * from '@tanstack/react-table'` re-exports ALL exports,
	// including the banned types. The old guard only entered the flagged
	// branch when exportClause was a NamedExports; a wildcard has no
	// exportClause and was silently skipped.
	const root = makeSandbox({
		'src/lib/table-types.ts': `export * from '@tanstack/react-table';\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1, 'expected exactly one finding');
	assert.equal(findings[0].specifier, '@tanstack/react-table');
	assert.ok(findings[0].bindings.includes('(wildcard re-export)'));
});

	void test('ADVERSE: catches import = require() (ImportEqualsDeclaration)', () => {
		// `import ReactTable = require('@tanstack/react-table')` is the
		// CommonJS-style import assignment. The right-hand side is an
		// ExternalModuleReference whose expression is a StringLiteral (not
		// a CallExpression), so neither the import-declaration handler nor
		// the require-call handler fires. The guard must flag this form.
		const root = makeSandbox({
			'src/routes/authed/staff/profiles.tsx':
				`import ReactTable = require('@tanstack/react-table');\n` +
				`export const x = null as ReactTable.ColumnDef<any>;\n`,
		});
		const findings = scanFrontSrcForBannedImports(root);
		assert.equal(findings.length, 1, 'expected exactly one finding');
		assert.equal(findings[0].specifier, '@tanstack/react-table');
		assert.ok(findings[0].bindings.includes('(import = require)'));
	});

	// ---------------------------------------------------------------------------
	// R4: reversed burden of proof — unrecognized extensions fail loudly.
	// ---------------------------------------------------------------------------

	void test('R4 RED: .cts file importing banned type is caught (extension now scanned)', () => {
		// R3 defect: .cts was not scanned by the regex /\.(ts|tsx|mts)$/ and
		// sailed through with [OK]. Now .cts is in SCANNED_EXTENSIONS, so
		// the guard parses it and flags the banned import.
		const root = makeSandbox({
			'src/routes/authed/tenant/posts/probe.cts':
				`import { ColumnDef } from '@tanstack/react-table';\n` +
				`export const x = null as ColumnDef<any>;\n`,
		});
		const findings = scanFrontSrcForBannedImports(root);
		assert.equal(findings.length, 1, 'expected exactly one finding');
		assert.equal(findings[0].specifier, '@tanstack/react-table');
		assert.ok(findings[0].bindings.includes('ColumnDef'));
	});

	void test('R4 RED: .cjs file with require() importing banned type is caught', () => {
		const root = makeSandbox({
			'src/routes/authed/tenant/posts/probe.cjs':
				`const { ColumnDef } = require('@tanstack/react-table');\n` +
				`module.exports = { ColumnDef };\n`,
		});
		const findings = scanFrontSrcForBannedImports(root);
		assert.equal(findings.length, 1, 'expected exactly one finding');
		assert.equal(findings[0].specifier, '@tanstack/react-table');
		assert.ok(findings[0].bindings.includes('(require call)'));
	});

	void test('R4 RED: .mjs file importing banned type is caught', () => {
		const root = makeSandbox({
			'src/routes/authed/tenant/posts/probe.mjs':
				`import { ColumnDef } from '@tanstack/react-table';\n` +
				`export const x = null as ColumnDef<any>;\n`,
		});
		const findings = scanFrontSrcForBannedImports(root);
		assert.equal(findings.length, 1, 'expected exactly one finding');
		assert.equal(findings[0].specifier, '@tanstack/react-table');
		assert.ok(findings[0].bindings.includes('ColumnDef'));
	});

	void test('R4 RED: .ctsx file importing banned type is caught', () => {
		const root = makeSandbox({
			'src/routes/authed/tenant/posts/probe.ctsx':
				`import { ColumnDef } from '@tanstack/react-table';\n` +
				`export const x = null as ColumnDef<any>;\n`,
		});
		const findings = scanFrontSrcForBannedImports(root);
		assert.equal(findings.length, 1, 'expected exactly one finding');
		assert.equal(findings[0].specifier, '@tanstack/react-table');
		assert.ok(findings[0].bindings.includes('ColumnDef'));
	});

	void test('R4 RED: two-step workaround (.ts re-exporting from .ctsx) is caught', () => {
		// A .ts file re-exports from a .ctsx file which imports the banned type.
		// Both files are now scanned (both extensions are in SCANNED_EXTENSIONS).
		const root = makeSandbox({
			'src/routes/authed/tenant/posts/reexport.ctsx':
				`import { ColumnDef } from '@tanstack/react-table';\n` +
				`export const x = null as ColumnDef<any>;\n`,
			'src/routes/authed/tenant/posts/consumer.ts':
				`export { x } from './reexport.ctsx';\n`,
		});
		const findings = scanFrontSrcForBannedImports(root);
		// The .ctsx file is flagged for the banned import.
		const ctsxFinding = findings.find((f) => f.file.includes('reexport.ctsx'));
		assert.ok(ctsxFinding, 'expected the .ctsx file to be flagged');
		assert.ok(ctsxFinding!.bindings.includes('ColumnDef'));
	});

	void test('R4 RED: unknown extension .cjsx fails loudly naming the extension', () => {
		// A .cjsx file is NOT in SCANNED_EXTENSIONS and NOT in NON_CODE_EXTENSIONS.
		// The guard must fail loudly naming the extension, not silently pass.
		const root = makeSandbox({
			'src/routes/authed/tenant/posts/legit.ts':
				`import type { SortingState } from '@tanstack/react-table';\n` +
				`export const x: SortingState = [];\n`,
			'src/routes/authed/tenant/posts/probe.cjsx':
				`import { ColumnDef } from '@tanstack/react-table';\n` +
				`export const x = null as ColumnDef<any>;\n`,
		});
		assert.throws(
			() => scanFrontSrcForBannedImports(root),
			/Guard #1769: found file\(s\) with unrecognized extension\(s\) \.cjsx/,
			'expected the guard to fail loudly naming .cjsx',
		);
	});

	void test('R4 GREEN: declared non-code extension (.json) does not fail', () => {
		// .json is declared non-code — the guard must NOT fail on it.
		const root = makeSandbox({
			'src/routes/authed/tenant/posts/legit.ts':
				`import type { SortingState } from '@tanstack/react-table';\n` +
				`export const x: SortingState = [];\n`,
			'src/translations/en.json': `{"key": "value"}\n`,
		});
		const findings = scanFrontSrcForBannedImports(root);
		assert.equal(findings.length, 0, 'expected no findings');
	});

	void test('R4: empty directory fails with specific message', () => {
		const root = makeSandbox({});
		assert.throws(
			() => scanFrontSrcForBannedImports(root),
			/empty directory/,
			'expected empty directory to fail with specific message',
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

// ---------------------------------------------------------------------------
// R5: the three holes from the brief — each must now fail loudly.
// ---------------------------------------------------------------------------

void test('R5 HOLE 1 RED: extensionless file importing banned type is caught', () => {
	// The reviewer's probe: a file with NO extension containing a banned
	// import. Before the fix, walk() skipped it entirely (neither added to
	// `extensions` nor `files`). Now extensionless files are scanned as code
	// (fail closed), so the import is flagged.
	const root = makeSandbox({
		'src/routes/authed/tenant/noext-test/probe':
			`import { ColumnDef } from '@tanstack/react-table';\n` +
			`export const x = null as ColumnDef<any>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1, 'expected exactly one finding');
	assert.equal(findings[0].specifier, '@tanstack/react-table');
	assert.ok(findings[0].bindings.includes('ColumnDef'));
});

void test('R5 HOLE 1 RED: extensionless file importing from legacy is caught', () => {
	// Legacy specifier is always flagged — even from an extensionless file.
	const root = makeSandbox({
		'src/routes/authed/tenant/noext-test/probe':
			`import { useLegacyTable } from '@tanstack/react-table/legacy';\n` +
			`export const x = useLegacyTable;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1, 'expected exactly one finding');
	assert.equal(findings[0].specifier, '@tanstack/react-table/legacy');
});

void test('R5 HOLE 2 RED: NON_CODE_EXTENSIONS overlapping SCANNED_EXTENSIONS fails', () => {
	// Moving a code extension (like `.tsx`) into NON_CODE_EXTENSIONS would
	// silently disable its analysis. The guard must fail loudly naming the
	// overlap. We test the helper directly with a synthetic overlap to prove
	// it throws naming the offending extension.
	const overlappingNonCode = new Map<string, string>([
		['.tsx', 'this would silently disable .tsx analysis']
	]);
	assert.throws(
		() => assertNoOverlap(SCANNED_EXTENSIONS, overlappingNonCode),
		/Guard #1769: NON_CODE_EXTENSIONS overlaps SCANNED_EXTENSIONS \(\.tsx\)/,
		'expected the guard to fail loudly naming .tsx',
	);
});

void test('R5 HOLE 2 RED: current sets are disjoint (invariant holds)', () => {
	// The real protection is structural: the check runs on every scan, so
	// any future overlap fails. We verify the invariant holds today.
	const overlap = [...NON_CODE_EXTENSIONS.keys()].filter((ext) =>
		SCANNED_EXTENSIONS.has(ext),
	);
	assert.equal(
		overlap.length,
		0,
		'NON_CODE_EXTENSIONS and SCANNED_EXTENSIONS must be disjoint',
	);
});

void test('R5 HOLE 3 RED: NON_CODE_EXTENSIONS entry without justification fails', () => {
	// The brief's "comment is proof" claim was false. Now the justification
	// is structural: an entry with an empty reason must fail. We test the
	// helper directly with a synthetic entry lacking justification.
	const unjustifiedNonCode = new Map<string, string>([
		['.xyz', 'legit non-code reason'],
		['.bad', '']
	]);
	assert.throws(
		() => assertAllJustified(unjustifiedNonCode),
		/Guard #1769: NON_CODE_EXTENSIONS has entry\(ies\) without justification \(\.bad\)/,
		'expected the guard to fail loudly naming .bad',
	);
});

void test('R5 HOLE 3 RED: current entries all justified (invariant holds)', () => {
	// The real protection is structural: the check runs on every scan, so
	// any future entry without justification fails. We verify the invariant
	// holds today.
	const entriesWithoutJustification = [...NON_CODE_EXTENSIONS.entries()].filter(
		([, reason]) => reason.trim().length === 0,
	);
	assert.equal(
		entriesWithoutJustification.length,
		0,
		'every NON_CODE_EXTENSIONS entry must carry a non-empty justification',
	);
});

void test('R5 ADVERSE: extensionless file with non-banned import stays GREEN', () => {
	// An extensionless file with only non-banned imports must NOT be flagged
	// — the fail-closed scan must not create false positives.
	const root = makeSandbox({
		'src/routes/authed/tenant/noext-test/probe':
			`import type { SortingState } from '@tanstack/react-table';\n` +
			`export const x: SortingState = [];\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 0, 'expected no findings for non-banned import');
});

void test('R5 NON-REGRESSION: unknown extension .cjsx still fails loudly', () => {
	// The R4 reversed-burden-of-proof must still hold: an unknown extension
	// fails loudly naming the extension.
	const root = makeSandbox({
		'src/routes/authed/tenant/posts/legit.ts':
			`import type { SortingState } from '@tanstack/react-table';\n` +
			`export const x: SortingState = [];\n`,
		'src/routes/authed/tenant/posts/probe.cjsx':
			`import { ColumnDef } from '@tanstack/react-table';\n` +
			`export const x = null as ColumnDef<any>;\n`,
	});
	assert.throws(
		() => scanFrontSrcForBannedImports(root),
		/Guard #1769: found file\(s\) with unrecognized extension\(s\) \.cjsx/,
		'expected the guard to fail loudly naming .cjsx',
	);
});

void test('R5 NON-REGRESSION: declared non-code extension (.json) still does not fail', () => {
	// A declared non-code extension must still pass — the justification
	// requirement must not break legitimate exclusions.
	const root = makeSandbox({
		'src/routes/authed/tenant/posts/legit.ts':
			`import type { SortingState } from '@tanstack/react-table';\n` +
			`export const x: SortingState = [];\n`,
		'src/translations/en.json': `{"key": "value"}\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 0, 'expected no findings');
});

void test('R5 NON-REGRESSION: .cts/.cjs/.mjs/.ctsx still scanned', () => {
	// The four extensions that the R3 regex missed must still be scanned.
	const root = makeSandbox({
		'src/routes/authed/tenant/posts/probe.cts':
			`import { ColumnDef } from '@tanstack/react-table';\n` +
			`export const x = null as ColumnDef<any>;\n`,
		'src/routes/authed/tenant/posts/probe.cjs':
			`const { ColumnDef } = require('@tanstack/react-table');\n` +
			`module.exports = { ColumnDef };\n`,
		'src/routes/authed/tenant/posts/probe.mjs':
			`import { ColumnDef } from '@tanstack/react-table';\n` +
			`export const x = null as ColumnDef<any>;\n`,
		'src/routes/authed/tenant/posts/probe.ctsx':
			`import { ColumnDef } from '@tanstack/react-table';\n` +
			`export const x = null as ColumnDef<any>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 4, 'expected four findings (one per extension)');
	const extensions = findings.map((f) => path.extname(f.file)).sort();
	assert.deepEqual(extensions, ['.cjs', '.cts', '.ctsx', '.mjs']);
});
