/**
 * Tests for the e2e shared-constant guard.
 *
 * The one these exist for: `collectSharedTsExports` originally walked
 * `getVariableStatements()` and asked each statement `isExported()`. That form
 * only sees `export const X = …`. It is blind to `const X = …; export { X };`,
 * and blind to exported functions, classes and enums — and three real
 * `packages/shared-ts/src/**` files use the separate-`export {}` form today.
 * A name the collector cannot see is a name the guard cannot protect, so a
 * re-declaration of it in an e2e spec passed silently: the guard printed
 * "0 re-declarations [OK]" and exited 0 on a file that violated the rule.
 *
 * These tests run the REAL collector over a REAL temporary tree on disk, one
 * fixture file per export form. They fail against the old implementation for
 * every form except the first — which is the point: a test that cannot fail is
 * a claim, not evidence.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { collectSharedTsExports } from './check-e2e-shared-constants.mts';

const root = mkdtempSync(path.join(tmpdir(), 'e2e-shared-exports-'));

after(() => {
	rmSync(root, { recursive: true, force: true });
});

const write = (name: string, contents: string): void => {
	writeFileSync(path.join(root, name), contents, 'utf8');
};

write('inline.ts', "export const INLINE_NAME = 'a';\n");
write(
	'separate.ts',
	"const SEPARATE_NAME = 'b';\nexport { SEPARATE_NAME };\n",
);
write('func.ts', 'export function FUNC_NAME() {\n\treturn 1;\n}\n');
write('klass.ts', 'export class CLASS_NAME {}\n');
write('type-only.ts', 'export type TYPE_ONLY_NAME = string;\n');

const exports_ = collectSharedTsExports(root);

test('sees a name exported inline on its declaration', () => {
	assert.equal(exports_.get('INLINE_NAME'), '@org/shared-ts/inline');
});

test('sees a name exported by a separate export statement', () => {
	// The regression this whole file exists for. `export { SEPARATE_NAME }`
	// carries the export; the `const` statement itself has no modifier, so
	// asking the statement `isExported()` answers false and the name vanishes.
	assert.equal(exports_.get('SEPARATE_NAME'), '@org/shared-ts/separate');
});

test('sees exported functions and classes, not only consts', () => {
	assert.equal(exports_.get('FUNC_NAME'), '@org/shared-ts/func');
	assert.equal(exports_.get('CLASS_NAME'), '@org/shared-ts/klass');
});

test('ignores type-only exports', () => {
	// An e2e `const` that happens to share a name with an exported TYPE is not
	// a duplicated constant, so flagging it would be a false positive.
	assert.equal(exports_.get('TYPE_ONLY_NAME'), undefined);
});
