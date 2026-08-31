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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
	collectSharedTsConstantValues,
	collectSharedTsExports,
	findRedeclaredConstants,
	listVitestTestFiles,
} from './check-e2e-shared-constants.mts';

const root = mkdtempSync(path.join(tmpdir(), 'e2e-shared-exports-'));

after(() => {
	rmSync(root, { recursive: true, force: true });
});

const write = (name: string, contents: string): void => {
	writeFileSync(path.join(root, name), contents, 'utf8');
};

write('inline.ts', "export const INLINE_NAME = 'a';\n");
write('separate.ts', "const SEPARATE_NAME = 'b';\nexport { SEPARATE_NAME };\n");
write('func.ts', 'export function FUNC_NAME() {\n\treturn 1;\n}\n');
write('klass.ts', 'export class CLASS_NAME {}\n');
write('type-only.ts', 'export type TYPE_ONLY_NAME = string;\n');
// A barrel that re-exports a name declared elsewhere. The same name is then
// reachable through two specifiers, and only one of them is the declaring
// module — see the note in the collector about why that one wins.
write('barrel.ts', "export { SEPARATE_NAME } from './separate';\n");
write('zz-late-barrel.ts', "export { INLINE_NAME } from './inline';\n");

const exports_ = collectSharedTsExports(root);

void test('sees a name exported inline on its declaration', () => {
	assert.equal(exports_.get('INLINE_NAME'), '@org/shared-ts/inline');
});

void test('sees a name exported by a separate export statement', () => {
	// The regression this whole file exists for. `export { SEPARATE_NAME }`
	// carries the export; the `const` statement itself has no modifier, so
	// asking the statement `isExported()` answers false and the name vanishes.
	assert.equal(exports_.get('SEPARATE_NAME'), '@org/shared-ts/separate');
});

void test('sees exported functions and classes, not only consts', () => {
	assert.equal(exports_.get('FUNC_NAME'), '@org/shared-ts/func');
	assert.equal(exports_.get('CLASS_NAME'), '@org/shared-ts/klass');
});

void test('ignores type-only exports', () => {
	// An e2e `const` that happens to share a name with an exported TYPE is not
	// a duplicated constant, so flagging it would be a false positive.
	assert.equal(exports_.get('TYPE_ONLY_NAME'), undefined);
});

void test('a re-exported name is attributed to the module that DECLARES it', () => {
	// `barrel.ts` re-exports SEPARATE_NAME, and sorts BEFORE `separate.ts`, so a
	// plain overwrite would have kept the barrel. `zz-late-barrel.ts` re-exports
	// INLINE_NAME and sorts AFTER `inline.ts`, so a plain overwrite would have
	// kept the barrel there too. Both must resolve to the declaring module —
	// otherwise the suggestion depends on directory order, and the advice a
	// developer reads would change when an unrelated file is renamed.
	assert.equal(exports_.get('SEPARATE_NAME'), '@org/shared-ts/separate');
	assert.equal(exports_.get('INLINE_NAME'), '@org/shared-ts/inline');
});

void test('`default` is not collected', () => {
	// `const default = …` is a syntax error, so a spec cannot re-declare it.
	// Mapping it would only add an entry several modules overwrite in turn.
	assert.equal(exports_.get('default'), undefined);
});

// ---- #1752: the guard must see declarations at ANY depth -------------------
// The original guard only inspected module-top-level `const` statements. A
// copied constant moved one nesting level deeper — inside a `describe` callback,
// a test body, a helper function — sailed through with "0 re-declarations".
// These cases run the REAL `findRedeclaredConstants` (ts-morph AST walk) on
// REAL temp files and assert the deep declaration is found.

const e2eRoot = mkdtempSync(path.join(tmpdir(), 'e2e-shared-deep-'));

/** Builds a REAL temp shared-ts tree once and returns BOTH the real specifier
 * map and the real scalar-value map collected from it. */
const sharedFixture = () => {
	const sharedRoot = mkdtempSync(path.join(tmpdir(), 'e2e-shared-src-'));
	writeFileSync(
		path.join(sharedRoot, 'constants.ts'),
		"export const SESSION_TOKEN_HEADER_KEY = 'X-Session-Token';\n" +
			'export const MAX_RETRIES = 3;\n' +
			'export function retry() { return undefined; }\n',
		'utf8',
	);
	return {
		exports_: collectSharedTsExports(sharedRoot),
		values: collectSharedTsConstantValues(sharedRoot),
	};
};

after(() => {
	rmSync(e2eRoot, { recursive: true, force: true });
});

void test('#1752: catches a const re-declared inside a describe callback', () => {
	const spec = path.join(e2eRoot, 'deep.spec.ts');
	writeFileSync(
		spec,
		"describe('leak check', () => {\n" +
			"\tit('rejects a missing token', () => {\n" +
			"\t\tconst SESSION_TOKEN_HEADER_KEY = 'X-Session-Token';\n" +
			'\t\texpect(request.headers[SESSION_TOKEN_HEADER_KEY]).toBeUndefined();\n' +
			'\t});\n' +
			'});\n',
		'utf8',
	);

	const fixture = sharedFixture();

	const findings = findRedeclaredConstants(
		[spec],
		fixture.exports_,
		fixture.values,
	);

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.name, 'SESSION_TOKEN_HEADER_KEY');
	assert.equal(findings[0]?.source, '@org/shared-ts/constants');
});

void test('#1752: catches a const re-declared inside a helper function body', () => {
	const spec = path.join(e2eRoot, 'helper.spec.ts');
	writeFileSync(
		spec,
		'function buildHeaders() {\n' +
			"\tconst SESSION_TOKEN_HEADER_KEY = 'X-Session-Token';\n" +
			"\treturn { [SESSION_TOKEN_HEADER_KEY]: 'x' };\n" +
			'}\n' +
			"test('builds a token header', () => {\n" +
			"\texpect(buildHeaders()).toHaveProperty('X-Session-Token');\n" +
			'});\n',
		'utf8',
	);

	const fixture = sharedFixture();

	const findings = findRedeclaredConstants(
		[spec],
		fixture.exports_,
		fixture.values,
	);

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.name, 'SESSION_TOKEN_HEADER_KEY');
});

void test('#1752: catches a const re-declared in a Vitest src test file (not e2e)', () => {
	const srcRoot = mkdtempSync(path.join(tmpdir(), 'e2e-shared-src-tests-'));
	mkdirSync(path.join(srcRoot, 'test'));
	const testFile = path.join(srcRoot, 'test', 'session-toggle.test.ts');
	writeFileSync(
		testFile,
		"import { describe, it, expect } from 'vitest';\n" +
			"describe('session banner', () => {\n" +
			"\tit('reads the session header', () => {\n" +
			"\t\tconst SESSION_TOKEN_HEADER_KEY = 'X-Session-Token';\n" +
			"\t\texpect(readHeader(SESSION_TOKEN_HEADER_KEY)).toBe('abc');\n" +
			'\t});\n' +
			'});\n',
		'utf8',
	);

	const fixture = sharedFixture();

	const findings = findRedeclaredConstants(
		[testFile],
		fixture.exports_,
		fixture.values,
	);

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.name, 'SESSION_TOKEN_HEADER_KEY');
	assert.equal(findings[0]?.source, '@org/shared-ts/constants');

	rmSync(srcRoot, { recursive: true, force: true });
});

void test('#1752: production (non-test) src files are NOT in the scanned surface', () => {
	// The defect is a TEST asserting against its own copy. The surface builder
	// (`listVitestTestFiles`) returns only `*.test.ts`/`*.test.tsx`, so a
	// production module that happens to declare a shared-shaped name never
	// reaches `findRedeclaredConstants`. The assertion is on the surface, not
	// on the scan: feeding a production file to the scan function directly
	// would flag it by design — the caller decides what is test code.
	const srcRoot = mkdtempSync(path.join(tmpdir(), 'e2e-shared-src-prod-'));
	mkdirSync(path.join(srcRoot, 'lib'));
	writeFileSync(
		path.join(srcRoot, 'lib', 'session.ts'),
		"const SESSION_TOKEN_HEADER_KEY = 'X-Session-Token';\nexport { SESSION_TOKEN_HEADER_KEY };\n",
		'utf8',
	);
	writeFileSync(
		path.join(srcRoot, 'lib', 'session.test.ts'),
		"test('reads the session header', () => { expect(1).toBe(1); });\n",
		'utf8',
	);

	const surface = listVitestTestFiles(srcRoot);

	assert.equal(surface.length, 1);
	assert.ok(surface[0]?.endsWith('session.test.ts'));

	rmSync(srcRoot, { recursive: true, force: true });
});

void test('#1752: top-level const re-declarations are still caught (regression)', () => {
	const spec = path.join(e2eRoot, 'top-level.spec.ts');
	writeFileSync(
		spec,
		"const SESSION_TOKEN_HEADER_KEY = 'X-Session-Token';\n" +
			"test('reads the session header', () => {\n" +
			"\texpect(readHeader(SESSION_TOKEN_HEADER_KEY)).toBe('abc');\n" +
			'});\n',
		'utf8',
	);

	const fixture = sharedFixture();

	const findings = findRedeclaredConstants(
		[spec],
		fixture.exports_,
		fixture.values,
	);

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.name, 'SESSION_TOKEN_HEADER_KEY');
});

void test('#1752: a name match with a DIFFERENT value is not a copy (no false positive)', () => {
	// The value condition is what separates a copy from a name collision.
	// `SESSION_TOKEN_HEADER_KEY` here holds a fabricated string, NOT the
	// production value: the test is not asserting its own copy of the
	// production constant, so the guard must stay quiet.
	const spec = path.join(e2eRoot, 'renamed.spec.ts');
	writeFileSync(
		spec,
		"test('reads the session header', () => {\n" +
			"\tconst SESSION_TOKEN_HEADER_KEY = 'X-Session-Token-DEV';\n" +
			'\texpect(readHeader(SESSION_TOKEN_HEADER_KEY)).toBe(1);\n' +
			'});\n',
		'utf8',
	);

	const fixture = sharedFixture();
	const findings = findRedeclaredConstants(
		[spec],
		fixture.exports_,
		fixture.values,
	);

	assert.equal(findings.length, 0);
});

void test('#1752: a generic local name reusing a shared FUNCTION export is not a copy', () => {
	// The real-tree false-positive class (#1752): `retry` is a shared-ts
	// exported helper AND a common local name for a UI button locator or a
	// mock. The initializer is a call expression, not the shared value, so
	// the guard must not flag it.
	const spec = path.join(e2eRoot, 'retry.spec.ts');
	writeFileSync(
		spec,
		"test('shows the retry button', () => {\n" +
			"\tconst retry = page.getByRole('button', { name: 'Retry' });\n" +
			'\texpect(retry).toBeVisible();\n' +
			'});\n',
		'utf8',
	);

	const fixture = sharedFixture();
	const findings = findRedeclaredConstants(
		[spec],
		fixture.exports_,
		fixture.values,
	);

	assert.equal(findings.length, 0);
});

void test('#1752: collectSharedTsConstantValues folds template consts to scalars', () => {
	const sharedRoot = mkdtempSync(path.join(tmpdir(), 'e2e-shared-values-'));
	writeFileSync(
		path.join(sharedRoot, 'keys.ts'),
		"export const APP_ID = 'publyapp';\n" +
			'export const SESSION_TOKEN_COOKIE_KEY = `${APP_ID}-session_token`;\n' +
			'export const RETRY_LIMIT = 3;\n',
		'utf8',
	);

	const values = collectSharedTsConstantValues(sharedRoot);

	assert.equal(values.get('APP_ID'), 'publyapp');
	assert.equal(
		values.get('SESSION_TOKEN_COOKIE_KEY'),
		'publyapp-session_token',
	);
	assert.equal(values.get('RETRY_LIMIT'), 3);
});

void test('#1752: booleans fold (there is no Node.isBooleanLiteral in ts-morph)', () => {
	// The regression this pins: the guard originally called
	// `Node.isBooleanLiteral(...)`, which does not exist in ts-morph — booleans
	// are two nodes, `TrueLiteral` and `FalseLiteral`. Every pass over the
	// fixture below threw `TypeError: Node.isBooleanLiteral is not a function`
	// (and, before that check, any template-literal initializer hit the broken
	// call before the template branch could run).
	const sharedRoot = mkdtempSync(path.join(tmpdir(), 'e2e-shared-bools-'));
	writeFileSync(
		path.join(sharedRoot, 'flags.ts'),
		'export const COOKIE_SECURE = true;\n' +
			'export const COOKIE_HTTP_ONLY = false;\n' +
			'export const FLAG_KEY = `secure=${COOKIE_SECURE}`;\n',
		'utf8',
	);

	const values = collectSharedTsConstantValues(sharedRoot);

	assert.equal(values.get('COOKIE_SECURE'), true);
	assert.equal(values.get('COOKIE_HTTP_ONLY'), false);
	// A template substitution coerces like the runtime: `true` renders as
	// "true" inside a template literal.
	assert.equal(values.get('FLAG_KEY'), 'secure=true');
});

void test('#1752: an unfoldable initializer is a LOUD finding, never a silent pass', () => {
	// An initializer the fold cannot decide (a call, an unresolved
	// identifier) is exactly how a copy hides from a value-comparing
	// guard: `const SESSION_TOKEN_HEADER_KEY = getToken();` may return
	// the production value. Treating it as "nothing to report" would
	// install a silent false negative, so the guard reports it
	// (`kind: 'unfoldable'`) instead of passing.
	const spec = path.join(e2eRoot, 'unfoldable-call.spec.ts');
	writeFileSync(
		spec,
		"test('reads the session header', () => {\n" +
			'\tconst SESSION_TOKEN_HEADER_KEY = getToken();\n' +
			'\texpect(readHeader(SESSION_TOKEN_HEADER_KEY)).toBe(1);\n' +
			'});\n',
		'utf8',
	);

	const fixture = sharedFixture();
	const findings = findRedeclaredConstants(
		[spec],
		fixture.exports_,
		fixture.values,
	);

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.kind, 'unfoldable');
	assert.equal(findings[0]?.name, 'SESSION_TOKEN_HEADER_KEY');
	assert.equal(findings[0]?.source, '@org/shared-ts/constants');
});

void test('#1752: an unresolved identifier initializer is also a LOUD finding', () => {
	const spec = path.join(e2eRoot, 'unfoldable-ident.spec.ts');
	writeFileSync(
		spec,
		"test('reads the session header', () => {\n" +
			'\tconst SESSION_TOKEN_HEADER_KEY = SOME_OTHER_CONST;\n' +
			'\texpect(readHeader(SESSION_TOKEN_HEADER_KEY)).toBe(1);\n' +
			'});\n',
		'utf8',
	);

	const fixture = sharedFixture();
	const findings = findRedeclaredConstants(
		[spec],
		fixture.exports_,
		fixture.values,
	);

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.kind, 'unfoldable');
	assert.equal(findings[0]?.name, 'SESSION_TOKEN_HEADER_KEY');
});
