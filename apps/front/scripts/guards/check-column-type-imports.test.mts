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
import { execFileSync } from 'node:child_process';
import {
	mkdtempSync,
	rmSync,
	writeFileSync,
	mkdirSync,
	readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	scanFrontSrcForBannedImports,
	formatFinding,
	isExempt,
	walk,
	frontSrc,
	SCANNED_EXTENSIONS,
	NON_CODE_EXTENSIONS,
	CORE_EXTENSIONS,
	EXEMPT_FILES,
	assertNoOverlap,
	assertAllJustified,
	assertCoreExtensionsScanned,
	assertExemptionsPinned,
	assertNonCodeExtensionsPinned,
	assertScannedExtensionsPinned,
	assertNoShrinkVsMergeBase,
	assertIntentionalDeletions,
	countExtensionsAtRef,
	listFilesAtRef,
	resolveMergeBase,
} from './check-column-type-imports.mts';

const here = path.dirname(fileURLToPath(import.meta.url));

const sandboxes: string[] = [];

after(() => {
	for (const dir of sandboxes) {
		rmSync(dir, { recursive: true, force: true });
	}
});

/** Creates a throwaway source tree for AST and extension-policy tests. */
const makeSandbox = (files: Record<string, string>): string => {
	const dir = mkdtempSync(path.join(tmpdir(), 'column-type-guard-'));
	sandboxes.push(dir);
	for (const [relative, content] of Object.entries(files)) {
		const full = path.join(dir, relative);
		mkdirSync(path.dirname(full), { recursive: true });
		writeFileSync(full, content);
	}
	return dir;
};

const runGit = (cwd: string, args: string[]): string =>
	execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});

const commitGitTree = (cwd: string, message: string): string => {
	runGit(cwd, ['add', '--', '.']);
	runGit(cwd, ['commit', '-qm', message]);
	return runGit(cwd, ['rev-parse', 'HEAD']).trim();
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

void test('RED #1737: the exact consumer that escaped the #1583 scan — history.tsx importing ColumnDef from the banned root is now SEEN', () => {
	// #1737: at the top of PR #1583, `history.tsx` still imported
	// `ColumnDef` from `@tanstack/react-table` (the v9 root) while the PR
	// announced "26 consumers routed through the passthrough" — the 27th was
	// invisible to that scan because the scan counted passthrough consumers
	// and was structurally blind to direct imports. This test hides a
	// consumer at the EXACT spot the defect made invisible and asserts the
	// guard (which scans the banned module instead of the passthrough) sees
	// it. The defect class is closed by construction, not by an allowlist.
	const root = makeSandbox({
		'src/routes/authed/tenant/posts/history.tsx':
			`import type { ColumnDef } from '@tanstack/react-table';\n` +
			`export const columns = [] as ColumnDef<never>[];\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1, 'expected exactly one finding');
	assert.match(findings[0].file, /history\.tsx$/);
	assert.equal(findings[0].specifier, '@tanstack/react-table');
	assert.ok(
		findings[0].bindings.includes('ColumnDef'),
		`expected ColumnDef in bindings, got ${JSON.stringify(findings[0].bindings)}`,
	);
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
		'src/routes/authed/tenant/posts/consumer.ts': `export { x } from './reexport.ctsx';\n`,
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
		['.tsx', 'this would silently disable .tsx analysis'],
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

void test('R6 HOLE 3 RED: NON_CODE_EXTENSIONS entry with < 24 char justification fails', () => {
	// The bar is now 24 characters, not "non-empty". 'x' or 'todo' no
	// longer pass. We test the helper directly with a synthetic entry
	// whose justification is too short, and one that is 24+ chars
	// (which must pass the filter — boundary check).
	const unjustifiedNonCode = new Map<string, string>([
		['.xyz', 'legit non-code reason, twenty-four chars'],
		['.bad', 'x'],
	]);
	assert.throws(
		() => assertAllJustified(unjustifiedNonCode),
		/Guard #1769: NON_CODE_EXTENSIONS has entry\(ies\) with a justification shorter than 24 characters \(\.bad\)/,
		'expected the guard to fail loudly naming .bad',
	);
});

void test('R6 HOLE 3 RED: current entries all justified at 24+ chars (invariant holds)', () => {
	// The real protection is structural: the check runs on every scan, so
	// any future entry with a too-short justification fails. We verify the
	// invariant holds today.
	const entriesWithoutJustification = [...NON_CODE_EXTENSIONS.entries()].filter(
		([, reason]) => reason.trim().length < 24,
	);
	assert.equal(
		entriesWithoutJustification.length,
		0,
		'every NON_CODE_EXTENSIONS entry must carry a 24+ char justification',
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
	assert.equal(
		findings.length,
		0,
		'expected no findings for non-banned import',
	);
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
	assert.equal(
		findings.length,
		4,
		'expected four findings (one per extension)',
	);
	const extensions = findings.map((f) => path.extname(f.file)).sort();
	assert.deepEqual(extensions, ['.cjs', '.cts', '.ctsx', '.mjs']);
});

// ---------------------------------------------------------------------------
// R6: the three holes from the brief — each must now fail loudly.
// ---------------------------------------------------------------------------

void test('R6 HOLE 2 RED: assertCoreExtensionsScanned fails when a core extension is missing', () => {
	// The reviewer's mutation: removing .mts from SCANNED_EXTENSIONS. The
	// core-extension check must fail loudly naming the missing core
	// extension. We test the helper directly with a synthetic scanned set
	// that omits .mts.
	const scannedWithoutMts = new Set([
		'.ts',
		'.tsx',
		'.cts',
		'.ctsx',
		'.mjs',
		'.cjs',
	]);
	assert.throws(
		() => assertCoreExtensionsScanned(scannedWithoutMts, CORE_EXTENSIONS),
		/Guard #1769: CORE_EXTENSIONS member\(s\) \.mts are missing from SCANNED_EXTENSIONS/,
		'expected the guard to fail loudly naming .mts',
	);
});

void test('R6 HOLE 2 RED: assertCoreExtensionsScanned passes when all core extensions present', () => {
	// Boundary: all core extensions present must pass.
	assert.doesNotThrow(
		() => assertCoreExtensionsScanned(SCANNED_EXTENSIONS, CORE_EXTENSIONS),
		'expected the guard to pass when all core extensions are scanned',
	);
});

void test('R6 HOLE 2 RED: removing .tsx from SCANNED_EXTENSIONS fails core check', () => {
	// The captain's exact mutation: .tsx removed from SCANNED_EXTENSIONS.
	const scannedWithoutTsx = new Set([
		'.ts',
		'.mts',
		'.cts',
		'.ctsx',
		'.mjs',
		'.cjs',
	]);
	assert.throws(
		() => assertCoreExtensionsScanned(scannedWithoutTsx, CORE_EXTENSIONS),
		/Guard #1769: CORE_EXTENSIONS member\(s\) \.tsx are missing from SCANNED_EXTENSIONS/,
		'expected the guard to fail loudly naming .tsx',
	);
});

void test('R6 HOLE 3 RED: 23-char justification fails (boundary)', () => {
	// Boundary: 23 characters is too short. The bar is 24.
	const unjustifiedNonCode = new Map<string, string>([
		['.xyz', '12345678901234567890123'], // 23 chars — fails
	]);
	assert.throws(
		() => assertAllJustified(unjustifiedNonCode),
		/Guard #1769: NON_CODE_EXTENSIONS has entry\(ies\) with a justification shorter than 24 characters \(\.xyz\)/,
		'expected the guard to fail loudly naming .xyz',
	);
});

void test('R6 HOLE 3 RED: 24-char justification passes (boundary)', () => {
	// Boundary: exactly 24 characters must pass.
	const justifiedNonCode = new Map<string, string>([
		['.xyz', '123456789012345678901234'], // 24 chars — passes
	]);
	assert.doesNotThrow(
		() => assertAllJustified(justifiedNonCode),
		'expected the guard to pass with a 24-char justification',
	);
});

void test('R6: every CORE_EXTENSIONS member is in SCANNED_EXTENSIONS (invariant holds)', () => {
	// The real protection is structural: the check runs on every scan, so
	// any future removal of a core extension fails. We verify the invariant
	// holds today.
	const missing = [...CORE_EXTENSIONS].filter(
		(ext) => !SCANNED_EXTENSIONS.has(ext),
	);
	assert.equal(
		missing.length,
		0,
		`CORE_EXTENSIONS members missing from SCANNED_EXTENSIONS: ${missing.join(', ')}`,
	);
});

void test('R6: .mts file importing banned type is caught (dedicated .mts test)', () => {
	// The reviewer's mutation: .mts has no dedicated test. Now it does.
	const root = makeSandbox({
		'src/routes/authed/tenant/posts/probe.mts':
			`import { ColumnDef } from '@tanstack/react-table';\n` +
			`export const x = null as ColumnDef<any>;\n`,
	});
	const findings = scanFrontSrcForBannedImports(root);
	assert.equal(findings.length, 1, 'expected exactly one finding');
	assert.equal(findings[0].specifier, '@tanstack/react-table');
	assert.ok(findings[0].bindings.includes('ColumnDef'));
});

void test('R6: baseline file is valid JSON without authored floors', () => {
	// The baseline pins policy sets and exact deletion declarations, never
	// authored per-extension counts.
	const baselinePath = path.resolve(here, 'column-type-imports-baseline.json');
	const raw = readFileSync(baselinePath, 'utf8');
	let parsed: unknown;
	assert.doesNotThrow(() => {
		parsed = JSON.parse(raw);
	}, 'baseline must be valid JSON');
	const baseline = parsed as Record<string, unknown>;
	assert.equal(
		'perExtension' in baseline,
		false,
		'baseline must not carry obsolete authored perExtension floors',
	);
	assert.ok(
		Array.isArray(baseline.intentionalDeletions),
		'baseline must declare an exact-deletion list',
	);
});

void test('R6 ADVERSE: a fourth gesture — emptying SCANNED_EXTENSIONS fails core check', () => {
	// Adversarial: what if a developer empties SCANNED_EXTENSIONS entirely?
	// The core-extension check must fail loudly naming ALL missing core
	// extensions. This proves the check is not just a cosmetic bar.
	const emptyScanned = new Set<string>();
	assert.throws(
		() => assertCoreExtensionsScanned(emptyScanned, CORE_EXTENSIONS),
		/Guard #1769: CORE_EXTENSIONS member\(s\) \.cts, \.mts, \.ts, \.tsx are missing from SCANNED_EXTENSIONS/,
		'expected the guard to fail loudly naming all missing core extensions',
	);
});

void test('R6 ADVERSE: a fourth gesture — declaring .ts as non-code fails core check', () => {
	// Adversarial: what if a developer declares .ts as non-code? The
	// overlap check fires first, but even if it didn't, the core check
	// would catch the removal of .ts from SCANNED_EXTENSIONS. We test the
	// overlap check here since it's the first line of defense.
	const overlappingNonCode = new Map<string, string>([
		['.ts', 'this would silently disable .ts analysis'],
	]);
	assert.throws(
		() => assertNoOverlap(SCANNED_EXTENSIONS, overlappingNonCode),
		/Guard #1769: NON_CODE_EXTENSIONS overlaps SCANNED_EXTENSIONS \(\.ts\)/,
		'expected the guard to fail loudly naming .ts',
	);
});

// ---------------------------------------------------------------------------
// R7: pinned-set assertions — prove the three r6 bypasses are now caught.
// ---------------------------------------------------------------------------

void test('R7 HOLE 1 RED: adding a file to EXEMPT_FILES fails assertExemptionsPinned', () => {
	// The r6 reviewer's mutation: adding data-table-header-row.tsx to the
	// exempt set. The pinned baseline must catch this.
	const baselinePath = path.resolve(here, 'column-type-imports-baseline.json');
	const raw = readFileSync(baselinePath, 'utf8');
	const baseline = JSON.parse(raw) as {
		intentionalDeletions: string[];
		scannedExtensions: string[];
		nonCodeExtensions: Record<string, string>;
		exemptFiles: string[];
	};
	const expandedExempt = new Set([
		...EXEMPT_FILES,
		'components/table/data-table-header-row.tsx',
	]);
	assert.throws(
		() => assertExemptionsPinned(expandedExempt, baseline),
		/Guard #1769: EXEMPT_FILES has diverged from the pinned baseline — added: components\/table\/data-table-header-row\.tsx/,
		'expected the guard to fail loudly naming the added exempt file',
	);
});

void test('R7 HOLE 1 RED: current EXEMPT_FILES matches the pinned baseline', () => {
	const baselinePath = path.resolve(here, 'column-type-imports-baseline.json');
	const raw = readFileSync(baselinePath, 'utf8');
	const baseline = JSON.parse(raw) as {
		intentionalDeletions: string[];
		scannedExtensions: string[];
		nonCodeExtensions: Record<string, string>;
		exemptFiles: string[];
	};
	assert.doesNotThrow(
		() => assertExemptionsPinned(EXEMPT_FILES, baseline),
		'expected the guard to pass when EXEMPT_FILES matches the baseline',
	);
});

void test('R7 HOLE 2 RED: adding a non-code extension with 24-char padding fails assertNonCodeExtensionsPinned', () => {
	// The r6 reviewer's mutation: a 24-char string of 'a' passes the length
	// bar. Pinning the full map catches this.
	const baselinePath = path.resolve(here, 'column-type-imports-baseline.json');
	const raw = readFileSync(baselinePath, 'utf8');
	const baseline = JSON.parse(raw) as {
		intentionalDeletions: string[];
		scannedExtensions: string[];
		nonCodeExtensions: Record<string, string>;
		exemptFiles: string[];
	};
	const paddedNonCode = new Map(NON_CODE_EXTENSIONS);
	paddedNonCode.set('.ctsx', 'aaaaaaaaaaaaaaaaaaaaaaaa');
	assert.throws(
		() => assertNonCodeExtensionsPinned(paddedNonCode, baseline),
		/Guard #1769: NON_CODE_EXTENSIONS has diverged from the pinned baseline — added: \.ctsx/,
		'expected the guard to fail loudly naming the added non-code extension',
	);
});

void test('R7 HOLE 2 RED: changing a justification fails assertNonCodeExtensionsPinned', () => {
	const baselinePath = path.resolve(here, 'column-type-imports-baseline.json');
	const raw = readFileSync(baselinePath, 'utf8');
	const baseline = JSON.parse(raw) as {
		intentionalDeletions: string[];
		scannedExtensions: string[];
		nonCodeExtensions: Record<string, string>;
		exemptFiles: string[];
	};
	const changedNonCode = new Map(NON_CODE_EXTENSIONS);
	changedNonCode.set('.json', 'short');
	assert.throws(
		() => assertNonCodeExtensionsPinned(changedNonCode, baseline),
		/Guard #1769: NON_CODE_EXTENSIONS has diverged from the pinned baseline — justification changed: \.json/,
		'expected the guard to fail loudly naming the changed justification',
	);
});

void test('R7 HOLE 2 RED: current NON_CODE_EXTENSIONS matches the pinned baseline', () => {
	const baselinePath = path.resolve(here, 'column-type-imports-baseline.json');
	const raw = readFileSync(baselinePath, 'utf8');
	const baseline = JSON.parse(raw) as {
		intentionalDeletions: string[];
		scannedExtensions: string[];
		nonCodeExtensions: Record<string, string>;
		exemptFiles: string[];
	};
	assert.doesNotThrow(
		() => assertNonCodeExtensionsPinned(NON_CODE_EXTENSIONS, baseline),
		'expected the guard to pass when NON_CODE_EXTENSIONS matches the baseline',
	);
});

void test('R7 HOLE 3 RED: removing .ctsx from SCANNED_EXTENSIONS fails assertScannedExtensionsPinned', () => {
	// The r6 reviewer's mutation: removing .ctsx from SCANNED_EXTENSIONS and
	// adding it to NON_CODE_EXTENSIONS. The pinned baseline catches this.
	const baselinePath = path.resolve(here, 'column-type-imports-baseline.json');
	const raw = readFileSync(baselinePath, 'utf8');
	const baseline = JSON.parse(raw) as {
		intentionalDeletions: string[];
		scannedExtensions: string[];
		nonCodeExtensions: Record<string, string>;
		exemptFiles: string[];
	};
	const reducedScanned = new Set(SCANNED_EXTENSIONS);
	reducedScanned.delete('.ctsx');
	assert.throws(
		() => assertScannedExtensionsPinned(reducedScanned, baseline),
		/Guard #1769: SCANNED_EXTENSIONS has diverged from the pinned baseline — removed: \.ctsx/,
		'expected the guard to fail loudly naming the removed extension',
	);
});

void test('R7 HOLE 3 RED: current SCANNED_EXTENSIONS matches the pinned baseline', () => {
	const baselinePath = path.resolve(here, 'column-type-imports-baseline.json');
	const raw = readFileSync(baselinePath, 'utf8');
	const baseline = JSON.parse(raw) as {
		intentionalDeletions: string[];
		scannedExtensions: string[];
		nonCodeExtensions: Record<string, string>;
		exemptFiles: string[];
	};
	assert.doesNotThrow(
		() => assertScannedExtensionsPinned(SCANNED_EXTENSIONS, baseline),
		'expected the guard to pass when SCANNED_EXTENSIONS matches the baseline',
	);
});

// ---------------------------------------------------------------------------
// R8: isExempt must derive from the pinned EXEMPT_FILES set — not a hardcoded
// suffix. These tests walk the REAL apps/front/src tree and assert that no
// real file can be silently exempted. (Brief §4: a test that only inspects
// fabricated sandbox files does not measure the production artefact.)
// ---------------------------------------------------------------------------

void test('R8: isExempt returns false for every scanned-extension file in apps/front/src except the sanctioned passthrough', () => {
	// Walk the real tree and collect every scanned-extension file's
	// normalized path. #1851: the previous version only walked .ts/.tsx,
	// so a hardcoded bypass on .mts/.cts/.ctsx/.mjs/.cjs went undetected.
	const { files } = walk(frontSrc);
	const codeFiles = files.filter((f) => {
		const ext = path.extname(f).toLowerCase();
		return ext.length === 0 || SCANNED_EXTENSIONS.has(ext);
	});
	// Every exempted scanned-extension file MUST be in EXEMPT_FILES. If
	// isExempt returns true for any file not in EXEMPT_FILES, a hardcoded
	// bypass is active — fail.
	for (const f of codeFiles) {
		const normalized = path.relative(frontSrc, f).split(path.sep).join('/');
		if (isExempt(normalized)) {
			// The only files that should be exempted are those in EXEMPT_FILES.
			const normalizedExemptions = [...EXEMPT_FILES].map((e) =>
				e.split(path.sep).join('/'),
			);
			assert.ok(
				normalizedExemptions.includes(normalized) ||
					normalizedExemptions.some((e) => normalized.endsWith('/' + e)),
				`isExempt returned true for ${normalized} but it is not in EXEMPT_FILES — ` +
					`this indicates a hardcoded bypass rather than derivation from the pinned set`,
			);
		}
	}
	// Prove the sanctioned file IS exempted (so the test is not vacuously green).
	const sanctionedExempt = codeFiles.some(
		(f) =>
			isExempt(path.relative(frontSrc, f).split(path.sep).join('/')) === true &&
			f.endsWith('column-type.ts'),
	);
	assert.equal(
		sanctionedExempt,
		true,
		'expected the sanctioned passthrough (column-type.ts) to be exempted',
	);
});

void test('R8 ADVERSE: a hardcoded || clause in isExempt is caught — isExempt returns false for a non-pinned real file', () => {
	// This test proves the fix: isExempt derives from EXEMPT_FILES, so
	// isExempt must return false for any real file NOT in EXEMPT_FILES.
	// The file `data-table-header-row.tsx` is a real .tsx file under
	// apps/front/src that is NOT a banned-import file itself (it imports
	// only flexRender, which is not one of the three banned type names).
	// The proof (in preuve-1778-r8.md) adds a hardcoded `||` to exempt it
	// and shows this test + the real-tree guard go RED.
	const headerRow = 'components/table/data-table-header-row.tsx';
	assert.equal(
		isExempt(headerRow),
		false,
		'isExempt must return false for a file NOT in the pinned EXEMPT_FILES — ' +
			'a hardcoded || bypass must not work',
	);
});

void test('R9 MUTATION: guard catches a hardcoded || bypass in isExempt on the real tree', () => {
	// Brief: replay the reviewer's mutation. Add a hardcoded `||` clause
	// to exempt a real file, and show the R8 assertion catches it.
	// The bypass: `|| normalizedPath.includes('data-table-header-row.tsx')`
	// This exempts a real file not in EXEMPT_FILES.
	const isExemptWithBypass = (normalizedPath: string): boolean => {
		for (const exempt of EXEMPT_FILES) {
			const suffix = exempt.split(path.sep).join('/');
			if (normalizedPath === suffix || normalizedPath.endsWith('/' + suffix)) {
				return true;
			}
		}
		// REVIEWER'S BYPASS MUTATION
		if (normalizedPath.includes('data-table-header-row.tsx')) {
			return true;
		}
		return false;
	};

	const normalizedExemptions = [...EXEMPT_FILES].map((e) =>
		e.split(path.sep).join('/'),
	);
	const illicitExemptions: string[] = [];
	// Walk the real tree (as the R8 assertion does). #1851: iterate every
	// scanned extension, not just .ts/.tsx, so a bypass on .mts/.cts is
	// also caught.
	const { files } = walk(frontSrc);
	for (const file of files) {
		const ext = path.extname(file).toLowerCase();
		if (ext.length > 0 && !SCANNED_EXTENSIONS.has(ext)) {
			continue;
		}
		const normalized = path.relative(frontSrc, file).split(path.sep).join('/');
		if (isExemptWithBypass(normalized)) {
			const isPinned =
				normalizedExemptions.includes(normalized) ||
				normalizedExemptions.some((e) => normalized.endsWith('/' + e));
			if (!isPinned) {
				illicitExemptions.push(normalized);
			}
		}
	}
	// The bypass must catch at least one file: data-table-header-row.tsx
	assert.ok(
		illicitExemptions.length > 0,
		`expected the bypass to catch at least one illicit exemption, got none — ` +
			`the mutation was not applied correctly`,
	);
	assert.ok(
		illicitExemptions.some((f) => f.includes('data-table-header-row.tsx')),
		`expected data-table-header-row.tsx to be caught as illicit — ` +
			`got: ${JSON.stringify(illicitExemptions)}`,
	);
	// With the CORRECT isExempt (no bypass), illicitExemptions must be EMPTY.
	const illicitWithCorrect: string[] = [];
	for (const file of files) {
		const ext = path.extname(file).toLowerCase();
		if (ext.length > 0 && !SCANNED_EXTENSIONS.has(ext)) {
			continue;
		}
		const normalized = path.relative(frontSrc, file).split(path.sep).join('/');
		if (isExempt(normalized)) {
			const isPinned =
				normalizedExemptions.includes(normalized) ||
				normalizedExemptions.some((e) => normalized.endsWith('/' + e));
			if (!isPinned) {
				illicitWithCorrect.push(normalized);
			}
		}
	}
	assert.equal(
		illicitWithCorrect.length,
		0,
		`isExempt must not exempt any file outside EXEMPT_FILES — ` +
			`got illicit: ${JSON.stringify(illicitWithCorrect)}`,
	);
});

void test('R9 #1851 MUTATION: a hardcoded || bypass on a .mts real file is caught', () => {
	// #1851: the previous R8 assertion only walked .ts/.tsx. A bypass on a
	// `.mts` file (still in SCANNED_EXTENSIONS) went undetected. With the
	// fix, the assertion walks every scanned extension; this test plants a
	// `.mts` file in a sandbox and a bypass scoped to `.mts`, and proves the
	// fixed assertion catches it. The production tree has no `.mts` files
	// today, so a sandbox is required to exercise this branch — but the
	// assertion logic under test is the same one that runs in production
	// (scoped through the `files` array it walks).
	const root = makeSandbox({
		'src/components/table/probe-bypass.mts':
			`import type { ColumnDef } from '@tanstack/react-table';\n` +
			`export const x = null as ColumnDef<never>;\n`,
	});
	const isExemptWithMtsBypass = (normalizedPath: string): boolean => {
		for (const exempt of EXEMPT_FILES) {
			const suffix = exempt.split(path.sep).join('/');
			if (normalizedPath === suffix || normalizedPath.endsWith('/' + suffix)) {
				return true;
			}
		}
		// BYPASS SCOPED TO .mts: silently exempt any .mts file. The previous
		// R8 assertion ignored .mts so the bypass flew under the radar.
		if (normalizedPath.endsWith('.mts')) {
			return true;
		}
		return false;
	};

	const normalizedExemptions = [...EXEMPT_FILES].map((e) =>
		e.split(path.sep).join('/'),
	);
	const illicitExemptions: string[] = [];
	const { files } = walk(root);
	for (const file of files) {
		const ext = path.extname(file).toLowerCase();
		// Match the production guard's filter: scanned extensions only.
		if (ext.length > 0 && !SCANNED_EXTENSIONS.has(ext)) {
			continue;
		}
		const normalized = path.relative(root, file).split(path.sep).join('/');
		if (isExemptWithMtsBypass(normalized)) {
			const isPinned =
				normalizedExemptions.includes(normalized) ||
				normalizedExemptions.some((e) => normalized.endsWith('/' + e));
			if (!isPinned) {
				illicitExemptions.push(normalized);
			}
		}
	}
	// The bypass must catch the .mts probe file.
	assert.ok(
		illicitExemptions.length > 0,
		`expected the .mts bypass to catch at least one illicit exemption, got none — ` +
			`the mutation was not applied correctly`,
	);
	assert.ok(
		illicitExemptions.some((f) => f.endsWith('probe-bypass.mts')),
		`expected probe-bypass.mts to be caught as illicit — ` +
			`got: ${JSON.stringify(illicitExemptions)}`,
	);
	// With the CORRECT isExempt (no bypass), illicitExemptions must be EMPTY.
	const illicitWithCorrect: string[] = [];
	for (const file of files) {
		const ext = path.extname(file).toLowerCase();
		if (ext.length > 0 && !SCANNED_EXTENSIONS.has(ext)) {
			continue;
		}
		const normalized = path.relative(root, file).split(path.sep).join('/');
		if (isExempt(normalized)) {
			const isPinned =
				normalizedExemptions.includes(normalized) ||
				normalizedExemptions.some((e) => normalized.endsWith('/' + e));
			if (!isPinned) {
				illicitWithCorrect.push(normalized);
			}
		}
	}
	assert.equal(
		illicitWithCorrect.length,
		0,
		`isExempt must not exempt any file outside EXEMPT_FILES — ` +
			`got illicit: ${JSON.stringify(illicitWithCorrect)}`,
	);
});

// ---------------------------------------------------------------------------
// #1737 — history.tsx escaped the ColumnDef consumer scan (#1583). The
// existing guard catches the AST pattern but had no real-tree test asserting
// that no app file consumes the banned type names from the root
// @tanstack/react-table. This test walks apps/front/src and fails if any
// such file exists outside the sanctioned passthrough — same coverage the
// original brief asked for. (#1769 ships the AST guard; this test is the
// real-tree counterweight #1737 called out.)
// ---------------------------------------------------------------------------

void test('#1737: no app file under apps/front/src consumes ColumnDef/Row/TanStackTable from the root @tanstack/react-table', () => {
	// Walk the REAL tree. Brief #1737: "rouge sur le vrai arbre — pas sur
	// une fixture". The passthrough column-type.ts is the only sanctioned
	// source.
	const findings = scanFrontSrcForBannedImports(frontSrc);
	const bannedConsumerFiles = findings
		.filter((f) => !f.file.endsWith('column-type.ts'))
		.map((f) => f.file);
	assert.equal(
		bannedConsumerFiles.length,
		0,
		`expected no app file to import the banned type names from @tanstack/react-table, ` +
			`but found: ${JSON.stringify(bannedConsumerFiles)}`,
	);
	// Anti-vacuous: confirm scanFrontSrcForBannedImports actually walked a
	// non-empty surface (otherwise an empty/no-op scan would let the test
	// pass even if the guard broke). The passthrough is exempt by design
	// (line 1034: `if (isExempt(normalizedPath)) continue;`), so it will
	// never appear in `findings`; we instead assert the scan surface itself
	// is non-empty by running the same walk() the guard uses internally.
	const { files: scannedFiles } = walk(frontSrc);
	const scannedNonPassthrough = scannedFiles.filter(
		(f) => !f.endsWith('column-type.ts') && !f.endsWith('/column-type.ts'),
	);
	assert.ok(
		scannedNonPassthrough.length > 0,
		`expected the scan to visit at least one non-passthrough file under ` +
			`'${frontSrc}'; otherwise the test would be vacuously green. ` +
			`Got ${scannedNonPassthrough.length} non-passthrough file(s).`,
	);
});

void test('#2033 SCENARIO 1: a branch remains green when the integration branch advances first', () => {
	// Replay of 2026-08-31 with counts derived from the merge-base tree.
	//   mergeBase: .ts=302, .tsx=500
	//   PR A:      .ts=302, .tsx=500
	//   PR B:      .ts=304, .tsx=500
	// PR B merges first. Develop now has .ts=304, .tsx=500. PR A's tip still
	// has .ts=302, .tsx=500. Under the old equality check, A is red
	// (live=302, baseline=304 → live < baseline). Under the
	// new shrink-only check, A is green because the live count at A's tip
	// (302) is still >= the merge-base count (302) — A did not shrink the
	// surface, it just did not grow with B.
	const mergeBase = { '.ts': 302, '.tsx': 500 };
	const aLive = { '.ts': 302, '.tsx': 500 };
	const bLive = { '.ts': 304, '.tsx': 500 };
	assert.doesNotThrow(
		() => assertNoShrinkVsMergeBase(aLive, mergeBase),
		`scenario 1: PR A's tip must not fail the guard after PR B added files — ` +
			`the live count at A's tip is still >= the merge-base count. ` +
			`Live=${JSON.stringify(aLive)} vs mergeBase=${JSON.stringify(mergeBase)}.`,
	);
	assert.doesNotThrow(
		() => assertNoShrinkVsMergeBase(bLive, mergeBase),
		`scenario 1: PR B's tip must pass the guard on its own — adding files ` +
			`must be a silent grow. Live=${JSON.stringify(bLive)} vs ` +
			`mergeBase=${JSON.stringify(mergeBase)}.`,
	);
	// The merge result (.ts=304, .tsx=500) also passes — develop's push CI
	// after the merge of B sees live == mergeBase + 2 and does not fail.
	assert.doesNotThrow(
		() => assertNoShrinkVsMergeBase({ '.ts': 304, '.tsx': 500 }, mergeBase),
		`scenario 1: develop's push CI after merging B must not fail the guard — ` +
			`live (304, 500) is still >= mergeBase (302, 500).`,
	);
});

void test('#2033 SCENARIO 2: two branches adding front files need no baseline edit', () => {
	// The old contract made every front-file PR edit the same authored count.
	// The new contract reads only the merge-base tree, so both branches can
	// add files independently.
	//
	// The new contract: neither PR touches the baseline. The merge base
	// count is the only reference. Both branches' tips and the merged
	// develop tip all pass.
	const mergeBase = { '.ts': 500, '.tsx': 498 };
	const aLive = { '.ts': 501, '.tsx': 498 };
	const bLive = { '.ts': 501, '.tsx': 498 };
	const mergedDevelop = { '.ts': 502, '.tsx': 498 };
	assert.doesNotThrow(
		() => assertNoShrinkVsMergeBase(aLive, mergeBase),
		`scenario 2: PR A's tip (+1 .ts) must pass without editing the baseline.`,
	);
	assert.doesNotThrow(
		() => assertNoShrinkVsMergeBase(bLive, mergeBase),
		`scenario 2: PR B's tip (+1 .ts) must pass without editing the baseline.`,
	);
	assert.doesNotThrow(
		() => assertNoShrinkVsMergeBase(mergedDevelop, mergeBase),
		`scenario 2: develop's push CI after merging both must pass.`,
	);
});

void test('#2033 RED: assertNoShrinkVsMergeBase fails when live shrinks below the merge-base count', () => {
	// A regression that removes a .tsx file between the merge base and the
	// PR tip must be loud, naming the extension and the gap.
	const mergeBase = { '.ts': 10, '.tsx': 20 };
	const live = { '.ts': 10, '.tsx': 18 };
	assert.throws(
		() => assertNoShrinkVsMergeBase(live, mergeBase),
		/Guard #1769: scan surface has shrunk below the merge-base count.*\.tsx.*base 20.*live 18/s,
		'expected the guard to fail loudly naming the shrunk extension and the gap',
	);
});

void test('#2033 RED: assertNoShrinkVsMergeBase fails on a zero-from-nonzero shrink', () => {
	// The captain's exact mutation: a developer declares .tsx non-code and
	// walks away. The live count of .tsx drops to 0. Under the old
	// ratchet, the floor (300/498) caught this. Under the new shrink-only
	// check, the merge-base count (500) catches it instead.
	const mergeBase = { '.tsx': 500 };
	const live = { '.tsx': 0 };
	assert.throws(
		() => assertNoShrinkVsMergeBase(live, mergeBase),
		/Guard #1769: scan surface has shrunk below the merge-base count.*\.tsx/s,
	);
});

void test('#2033 GREEN: a new code extension absent from the merge base is a grow', () => {
	// A scanned extension present in the live tree but absent at the merge
	// base is a *grow*, not a shrink — it must pass. The shrink-only check
	// ignores the live set except for the merge-base set: a grow on any
	// extension is silent. This test pins the asymmetry: silent grow,
	// loud shrink.
	const mergeBase = { '.ts': 10, '.tsx': 20 };
	const live = { '.ts': 10, '.tsx': 20, '.mts': 3 };
	assert.doesNotThrow(
		() => assertNoShrinkVsMergeBase(live, mergeBase),
		`growing a new extension is a silent win, not a violation`,
	);
});

void test('#2033 GREEN: assertNoShrinkVsMergeBase passes when live equals the merge-base count exactly', () => {
	// A no-op PR (no file adds, no file removes) must pass.
	const mergeBase = { '.ts': 100, '.tsx': 200, '.cjs': 1 };
	const live = { '.ts': 100, '.tsx': 200, '.cjs': 1 };
	assert.doesNotThrow(() => assertNoShrinkVsMergeBase(live, mergeBase));
});

void test('#2033 GREEN: assertNoShrinkVsMergeBase passes when live grows above the merge-base count on every extension', () => {
	// A pure file-add PR must pass.
	const mergeBase = { '.ts': 100, '.tsx': 200 };
	const live = { '.ts': 110, '.tsx': 220 };
	assert.doesNotThrow(() => assertNoShrinkVsMergeBase(live, mergeBase));
});

void test('#2033 integration: anchored Git scans follow concurrent branches without baseline conflicts', () => {
	const repo = mkdtempSync(path.join(tmpdir(), 'column-type-git-'));
	sandboxes.push(repo);
	const sourceRoot = path.join(repo, 'apps', 'front', 'src');
	mkdirSync(sourceRoot, { recursive: true });
	writeFileSync(
		path.join(sourceRoot, 'base.ts'),
		'export const base = true;\n',
	);
	writeFileSync(
		path.join(sourceRoot, 'base.tsx'),
		'export const Base = () => null;\n',
	);
	runGit(repo, ['init', '-q', '-b', 'develop']);
	runGit(repo, ['config', 'user.email', 'column-type-guard@example.com']);
	runGit(repo, ['config', 'user.name', 'column-type-guard']);
	const base = commitGitTree(repo, 'base');

	runGit(repo, ['checkout', '-qb', 'lane/a']);
	writeFileSync(path.join(sourceRoot, 'a.ts'), 'export const a = true;\n');
	commitGitTree(repo, 'branch a');

	runGit(repo, ['checkout', 'develop']);
	runGit(repo, ['checkout', '-qb', 'lane/b']);
	writeFileSync(path.join(sourceRoot, 'b.ts'), 'export const b = true;\n');
	commitGitTree(repo, 'branch b');

	assert.deepEqual(
		runGit(repo, ['diff', '--name-only', base, 'lane/a']).trim().split('\n'),
		['apps/front/src/a.ts'],
		'branch A must not edit a shared baseline file',
	);
	assert.deepEqual(
		runGit(repo, ['diff', '--name-only', base, 'lane/b']).trim().split('\n'),
		['apps/front/src/b.ts'],
		'branch B must not edit a shared baseline file',
	);

	runGit(repo, ['checkout', 'lane/a']);
	const mergeBase = resolveMergeBase(repo, 'develop');
	assert.equal(
		mergeBase,
		base,
		'the Git scan must use the true common ancestor',
	);
	assert.deepEqual(countExtensionsAtRef(mergeBase, 'apps/front/src', repo), {
		'.ts': 1,
		'.tsx': 1,
	});
	assert.deepEqual(
		new Set(listFilesAtRef(mergeBase, 'apps/front/src', repo)),
		new Set(['apps/front/src/base.ts', 'apps/front/src/base.tsx']),
	);
	const baseline = JSON.parse(
		readFileSync(
			path.resolve(here, 'column-type-imports-baseline.json'),
			'utf8',
		),
	) as Record<string, unknown>;
	baseline.intentionalDeletions = [];
	const baselinePath = path.join(repo, 'column-type-imports-baseline.json');
	writeFileSync(baselinePath, JSON.stringify(baseline));
	assert.deepEqual(
		scanFrontSrcForBannedImports(sourceRoot, {
			gitCwd: repo,
			integrationBranch: 'develop',
			baselinePath,
		}),
		[],
		'branch A must pass while branch B is already ahead on develop',
	);

	runGit(repo, ['merge', '--no-ff', '-qm', 'merge branch b', 'lane/b']);
	assert.deepEqual(
		scanFrontSrcForBannedImports(sourceRoot, {
			gitCwd: repo,
			integrationBranch: 'develop',
			baselinePath,
		}),
		[],
		'the merged branch must pass against its anchored integration branch',
	);
});

void test('#2033: empty Git references and empty reference trees fail closed', () => {
	const repo = mkdtempSync(path.join(tmpdir(), 'column-type-empty-git-'));
	sandboxes.push(repo);
	mkdirSync(path.join(repo, 'apps', 'front', 'src'), { recursive: true });
	writeFileSync(
		path.join(repo, 'apps', 'front', 'src', 'base.ts'),
		'export const base = true;\n',
	);
	runGit(repo, ['init', '-q', '-b', 'develop']);
	runGit(repo, ['config', 'user.email', 'column-type-guard@example.com']);
	runGit(repo, ['config', 'user.name', 'column-type-guard']);
	const base = commitGitTree(repo, 'base');

	assert.throws(
		() => resolveMergeBase(repo, ''),
		/empty integration branch reference/,
	);
	assert.throws(
		() => listFilesAtRef('', 'apps/front/src', repo),
		/empty Git reference/,
	);
	assert.throws(
		() => listFilesAtRef(base, 'apps/front/missing', repo),
		/has no files under/,
	);
	assert.throws(
		() => resolveMergeBase(repo, 'missing-integration'),
		(error: unknown) =>
			error instanceof Error &&
			/cannot resolve the merge base/.test(error.message) &&
			/fatal:/.test(error.message) &&
			/missing-integration/.test(error.message),
		'Git merge-base failures must retain actionable stderr',
	);
	assert.throws(
		() => listFilesAtRef('missing-reference', 'apps/front/src', repo),
		(error: unknown) =>
			error instanceof Error &&
			/cannot list files/.test(error.message) &&
			/fatal:/.test(error.message) &&
			/missing-reference/.test(error.message),
		'Git ls-tree failures must retain actionable stderr',
	);
	runGit(repo, ['checkout', '--orphan', 'unrelated']);
	runGit(repo, ['rm', '-rf', '--', '.']);
	writeFileSync(path.join(repo, 'unrelated.txt'), 'unrelated\n');
	commitGitTree(repo, 'unrelated history');
	assert.throws(
		() => resolveMergeBase(repo, 'develop'),
		/cannot resolve the merge base/,
		'an unrelated history must not produce an empty successful reference',
	);
});

void test('#2033: Git error formatting preserves captured stderr', async () => {
	const guard = (await import('./check-column-type-imports.mts')) as {
		formatGitCommandError?: (error: unknown) => string;
	};
	assert.equal(
		typeof guard.formatGitCommandError,
		'function',
		'Git command error formatting must be an explicit production helper',
	);
	const error = Object.assign(new Error('Command failed'), {
		stderr: 'fatal: missing object',
	});
	assert.match(
		guard.formatGitCommandError?.(error) ?? '',
		/fatal: missing object/,
	);
});

void test('#2033: an exact active code-file deletion declaration is accepted', () => {
	const deleted = 'apps/front/src/retired.ts';
	assert.deepEqual(
		assertIntentionalDeletions(
			['apps/front/src/keep.ts', deleted],
			['apps/front/src/keep.ts'],
			[deleted],
			'apps/front/src',
			['apps/front/src/keep.ts', deleted],
		),
		[deleted],
	);
});

void test('#2033: an undeclared or stale deletion declaration is rejected', () => {
	const deleted = 'apps/front/src/retired.ts';
	assert.throws(
		() =>
			assertIntentionalDeletions(
				['apps/front/src/keep.ts', deleted],
				['apps/front/src/keep.ts'],
				[],
				'apps/front/src',
				['apps/front/src/keep.ts', deleted],
			),
		/undeclared: apps\/front\/src\/retired\.ts/,
	);
	assert.throws(
		() =>
			assertIntentionalDeletions(
				['apps/front/src/keep.ts', deleted],
				['apps/front/src/keep.ts'],
				['apps/front/src/other.ts'],
				'apps/front/src',
				['apps/front/src/keep.ts', deleted],
			),
		/invalid: apps\/front\/src\/other\.ts.*stale: apps\/front\/src\/other\.ts/s,
	);
});

void test('#2033: deletion declarations cannot use directories, globs, or duplicates', () => {
	const deleted = 'apps/front/src/retired.ts';
	assert.throws(
		() =>
			assertIntentionalDeletions(
				[deleted],
				[],
				['apps/front/src'],
				'apps/front/src',
				[deleted],
			),
		/invalid: apps\/front\/src/,
	);
	assert.throws(
		() =>
			assertIntentionalDeletions(
				[deleted],
				[],
				[deleted, deleted],
				'apps/front/src',
				[deleted],
			),
		/duplicate: apps\/front\/src\/retired\.ts/,
	);
});

void test('#2033: an exact deletion declaration expires after integration contains the deletion', () => {
	const deleted = 'apps/front/src/retired.ts';
	assert.throws(
		() =>
			assertIntentionalDeletions(
				['apps/front/src/keep.ts', deleted],
				['apps/front/src/keep.ts'],
				[deleted],
				'apps/front/src',
				['apps/front/src/keep.ts'],
			),
		/integration reference.*apps\/front\/src\/retired\.ts/,
		'an intentional deletion must not remain an escape after integration has the deletion',
	);
});

void test('#2033 integration: an active exact deletion declaration is honored by the Git scan', () => {
	const repo = mkdtempSync(path.join(tmpdir(), 'column-type-delete-git-'));
	sandboxes.push(repo);
	const sourceRoot = path.join(repo, 'apps', 'front', 'src');
	const deleted = 'apps/front/src/retired.ts';
	mkdirSync(sourceRoot, { recursive: true });
	writeFileSync(
		path.join(sourceRoot, 'keep.ts'),
		'export const keep = true;\n',
	);
	writeFileSync(
		path.join(sourceRoot, 'retired.ts'),
		'export const retired = true;\n',
	);
	runGit(repo, ['init', '-q', '-b', 'develop']);
	runGit(repo, ['config', 'user.email', 'column-type-guard@example.com']);
	runGit(repo, ['config', 'user.name', 'column-type-guard']);
	commitGitTree(repo, 'base');
	runGit(repo, ['checkout', '-qb', 'lane/delete']);
	runGit(repo, ['rm', '--', 'apps/front/src/retired.ts']);
	commitGitTree(repo, 'delete one code file');

	const baseline = JSON.parse(
		readFileSync(
			path.resolve(here, 'column-type-imports-baseline.json'),
			'utf8',
		),
	) as Record<string, unknown>;
	const baselinePath = path.join(repo, 'column-type-imports-baseline.json');
	baseline.intentionalDeletions = [deleted];
	writeFileSync(baselinePath, JSON.stringify(baseline));
	assert.deepEqual(
		scanFrontSrcForBannedImports(sourceRoot, {
			baselinePath,
			gitCwd: repo,
			integrationBranch: 'develop',
		}),
		[],
		'exactly declared deletion should be removed from the reference count',
	);

	runGit(repo, ['checkout', 'develop']);
	runGit(repo, ['rm', '--', 'apps/front/src/retired.ts']);
	commitGitTree(repo, 'integrate deletion');
	runGit(repo, ['checkout', 'lane/delete']);
	writeFileSync(baselinePath, JSON.stringify(baseline));
	assert.throws(
		() =>
			scanFrontSrcForBannedImports(sourceRoot, {
				baselinePath,
				gitCwd: repo,
				integrationBranch: 'develop',
			}),
		/integration reference.*apps\/front\/src\/retired\.ts/,
		'an integrated deletion must make the temporary declaration stale',
	);

	baseline.intentionalDeletions = [];
	writeFileSync(baselinePath, JSON.stringify(baseline));
	assert.throws(
		() =>
			scanFrontSrcForBannedImports(sourceRoot, {
				baselinePath,
				gitCwd: repo,
				integrationBranch: 'develop',
			}),
		/undeclared: apps\/front\/src\/retired\.ts/,
		'without the declaration the real scan must expose the deletion',
	);
});
