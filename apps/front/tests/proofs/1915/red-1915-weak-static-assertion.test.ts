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
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { staticMiddleware } from 'srvx/static';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
	assertNormalStaticFileResponse,
	INDEX_HTML_BODY,
} from '../../helpers/static-file-assertions';

const tmpDir = join(process.cwd(), '.test-static-proof-assets-1915');

type ResponseVariant = (body: string, response: Response) => Response;

const createFixtureFiles = (): void => {
	mkdirSync(tmpDir, { recursive: true });
	writeFileSync(join(tmpDir, 'index.html'), INDEX_HTML_BODY);
};

const cleanupFixtureFiles = (): void => {
	rmSync(tmpDir, { recursive: true, force: true });
};

const executeStaticHandler = async (
	variant: ResponseVariant,
): Promise<Response> => {
	const handler = staticMiddleware({ dir: tmpDir });
	const request = new Request('http://localhost:3000/index.html');
	const response = await handler(
		request,
		() => new Response('not found', { status: 404 }),
	);

	if (response === undefined) {
		throw new Error(
			`MESURE IMPOSSIBLE: staticMiddleware did not return a response for ` +
				`the fixture file ${join(tmpDir, 'index.html')}.`,
		);
	}

	const body = await response.text();
	if (
		!response.ok ||
		body !== readFileSync(join(tmpDir, 'index.html'), 'utf8')
	) {
		throw new Error(
			`MESURE IMPOSSIBLE: staticMiddleware did not serve the known-good ` +
				`fixture before applying the broken-response mutation.`,
		);
	}

	return variant(body, response);
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
