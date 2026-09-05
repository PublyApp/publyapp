/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1915 (paired red proof).
 *
 * The normal static-file test must reject a bad status and an empty body. This
 * proof executes the real `srvx/static` handler against a real fixture, then
 * applies one broken response variant at a time. Each variant is passed to the
 * normal static-file assertions and is expected to be accepted only when that
 * assertion is weak.
 *
 * The two axes are deliberately separate:
 *
 * - A 500 response still carries the correct body. Removing only the positive
 *   status assertion makes this proof test pass and the manifest marks it
 *   stale.
 * - A successful response carries an empty body. Removing only the exact body
 *   assertion makes this proof test pass and the manifest marks it stale.
 *
 * On the corrected code, the normal assertions reject each broken response,
 * their helper catches the AssertionError and returns false, and the outer
 * expectation then fails with AssertionError. That is the expected kept-red
 * state. A thrown `MESURE IMPOSSIBLE` error means the real handler could not be
 * exercised and the proof runner classifies the proof as corrupt instead of
 * accepting it.
 *
 * Replay:
 *   cd apps/front && pnpm exec vitest run --config vitest.proofs.config.ts \
 *     tests/proofs/1915/red-1915-weak-static-assertion.test.ts
 *
 * Current corrected-code failure for both declared tests:
 *   AssertionError: expected false to be true // Object.is equality
 *
 * Mutation and adverse evidence:
 * - Removing `expect(response.ok).toBe(true)` makes the named status-axis test
 *   green; removing `expect(body).toBe(INDEX_HTML_BODY)` makes the named
 *   body-axis test green; removing either outer `expect(...).toBe(true)` makes
 *   the corresponding caught AssertionError disappear and is therefore a
 *   non-vacuity failure.
 * - Adverse attempts used equivalent status validation (`response.status ===
 *   200`), a non-empty-body check, and a changed fixture body. The status-axis
 *   test, body-axis test, and both tests respectively remained red, so none
 *   provided a surviving alternate mutation.
 *
 * Green run:
 *   pnpm --filter front exec vitest run src/server.static.test.ts
 *   Test Files 1 passed; Tests 6 passed.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { staticMiddleware } from 'srvx/static';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
	assertNormalStaticFileResponse,
	INDEX_HTML_BODY,
} from '../../helpers/static-file-assertions';
import {
	executeStaticFileScenario,
	type StaticFileResponseVariant,
} from '../../helpers/static-file-scenario';

let tmpDir: string | undefined;

const createFixtureFiles = (): void => {
	const directory = mkdtempSync(join(tmpdir(), 'publy-static-proof-1915-'));
	tmpDir = directory;
	writeFileSync(join(directory, 'index.html'), INDEX_HTML_BODY);
};

const cleanupFixtureFiles = (): void => {
	if (tmpDir === undefined) {
		return;
	}

	rmSync(tmpDir, { recursive: true, force: true });
	tmpDir = undefined;
};

const getFixtureDirectory = (): string => {
	if (tmpDir === undefined) {
		throw new Error('MESURE IMPOSSIBLE: proof fixture was not created.');
	}

	return tmpDir;
};

const executeStaticHandler = async (
	variant: StaticFileResponseVariant,
): Promise<Response> => {
	const directory = getFixtureDirectory();
	return executeStaticFileScenario({
		directory,
		handler: staticMiddleware({ dir: directory }),
		variant,
	});
};

const normalStaticAssertionsAccepted = async (
	response: Response,
): Promise<boolean> => {
	try {
		await assertNormalStaticFileResponse(response);
	} catch (error) {
		if (!(error instanceof Error) || error.name !== 'AssertionError') {
			throw error;
		}
		return false;
	}
	return true;
};

/**
 * Review evidence covers three alternate mutations: removing the status check,
 * removing the exact-body check, and removing the outer `expect` that turns the
 * helper's caught AssertionError into a kept-red failure. The first two make
 * one declared test pass. The third makes both pass. The proof runner rejects
 * all three mutations.
 */
describe('issue #1915 behavioral paired proof', () => {
	beforeEach(createFixtureFiles);
	afterEach(cleanupFixtureFiles);

	test('normal static-file assertions accept a broken 500 response (#1915 status axis)', async () => {
		const brokenResponse = await executeStaticHandler(
			(body, response) =>
				new Response(body, {
					status: 500,
					headers: response.headers,
				}),
		);

		expect(await normalStaticAssertionsAccepted(brokenResponse)).toBe(true);
	});

	test('normal static-file assertions accept a successful empty body (#1915 body axis)', async () => {
		const brokenResponse = await executeStaticHandler(
			(_body, response) =>
				new Response('', {
					status: response.status,
					headers: response.headers,
				}),
		);

		expect(await normalStaticAssertionsAccepted(brokenResponse)).toBe(true);
	});
});
