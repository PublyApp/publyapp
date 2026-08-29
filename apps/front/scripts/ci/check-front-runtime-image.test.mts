/**
 * Unit tests for the cause-of-failure explainer in
 * `check-front-runtime-image.mts`. These are the part of the guard the
 * owner rule "every failure names its cause in plain words" rides on:
 * a regression in the format function would silently turn a useful
 * "Missing module: /app/trust-proxy.mjs" message back into an opaque
 * exit code, which is the exact thing this guard exists to prevent.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { explainNodeCrash, formatCause } from './check-front-runtime-image.mts';

// `node:test`'s runner captures test outcomes via its async-context mechanism,
// independent of the returned Promise (see the same comment in
// check-shared-ts-import-paths.test.mts and check-e2e-shared-constants.test.mts).
// The `typescript(no-floating-promises)` rule flags `test()` as returning
// `Promise<void>` per `@types/node` 26.x, but the runner does not depend on the
// caller awaiting it. We therefore prefix each `test()` call with `void` (a
// targeted, per-call suppression) rather than disabling the rule for the file.
void test('explainNodeCrash pulls the missing module and importer from a Node crash trace', () => {
	const logs = [
		'node:internal/modules/esm/resolve:271',
		'    throw new ERR_MODULE_NOT_FOUND(',
		'          ^',
		'',
		"Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/trust-proxy.mjs' imported from /app/server.mjs",
		'    at finalizeResolution (node:internal/modules/esm/resolve:271:11)',
		'    at moduleResolve (node:internal/modules/esm/resolve:865:10)',
		'',
		'Node.js v24.17.0',
	].join('\n');

	assert.deepEqual(explainNodeCrash(logs), {
		missingModule: '/app/trust-proxy.mjs',
		importedFrom: '/app/server.mjs',
	});
});

void test('explainNodeCrash returns nulls when the crash is not a missing module', () => {
	const logs = [
		'Error: EADDRINUSE: address already in use :::5050',
		'    at Server.setupListenHandle [as _listen2] (node:net:1872:16)',
		'',
		'Node.js v24.17.0',
	].join('\n');

	assert.deepEqual(explainNodeCrash(logs), {
		missingModule: null,
		importedFrom: null,
	});
});

void test('explainNodeCrash returns nulls on empty input', () => {
	assert.deepEqual(explainNodeCrash(''), {
		missingModule: null,
		importedFrom: null,
	});
});

void test('formatCause names the missing module and the importer in plain words', () => {
	const logs = [
		"Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/trust-proxy.mjs' imported from /app/server.mjs",
		'    at finalizeResolution (node:internal/modules/esm/resolve:271:11)',
	].join('\n');

	const cause = formatCause(logs);

	// The owner rule: a failure must name the cause in plain words.
	// A future regression that drops "Missing module:" or "Imported from:"
	// from the output turns this guard back into a bare exit code, which
	// is the bug this guard exists to prevent.
	assert.ok(
		cause.some((line) => line.includes('Missing module: /app/trust-proxy.mjs')),
		`formatCause did not name the missing module: ${cause.join(' | ')}`,
	);
	assert.ok(
		cause.some((line) => line.includes('Imported from:  /app/server.mjs')),
		`formatCause did not name the importer: ${cause.join(' | ')}`,
	);
	assert.ok(
		cause[0] !== undefined && cause[0].toLowerCase().includes('cause'),
		`formatCause first line must lead with "Cause:": ${cause.join(' | ')}`,
	);
});

void test('formatCause falls back to a log tail when the crash is not a missing module', () => {
	const logs = [
		'Error: EADDRINUSE: address already in use :::5050',
		'    at Server.setupListenHandle (node:net:1872:16)',
	].join('\n');

	const cause = formatCause(logs);

	assert.ok(
		cause[0] !== undefined && cause[0].toLowerCase().includes('cause'),
		`formatCause must lead with "Cause:" even on the fallback path: ${cause.join(' | ')}`,
	);
	assert.ok(
		cause.some((line) => line.includes('EADDRINUSE')),
		`formatCause must surface the actual error text on the fallback path: ${cause.join(' | ')}`,
	);
});

void test('formatCause handles an empty log buffer without crashing', () => {
	const cause = formatCause('');
	assert.ok(Array.isArray(cause));
	assert.ok(cause.length > 0);
	assert.ok(
		cause[0] !== undefined && cause[0].toLowerCase().includes('cause'),
		`formatCause first line must lead with "Cause:" on empty input: ${cause.join(' | ')}`,
	);
});
