/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1915 (paired red proof).
 *
 * The normal static-file test must reject a bad status and an empty body. This
 * proof executes the real `srvx/static` handler against a real fixture while
 * its production-supported `renderHTML` hook emits one broken response at a
 * time. The response is therefore broken inside the handler path, before the
 * normal static-file assertions observe it.
 *
 * The two axes are deliberately separate:
 *
 * - A 500 response still carries the correct body. Removing only the positive
 *   status assertion makes this proof test pass and the manifest marks it
 *   stale.
 * - A successful response carries an empty body. Removing only the exact body
 *   assertion makes this proof test pass and the manifest marks it stale.
 *
 * On the corrected code, the normal assertions reject each response emitted by
 * the broken handler,
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
 * Production mutation evidence (replayed against the installed production
 * handler used by `server.mjs`): changing
 * `apps/front/node_modules/srvx/dist/static.mjs:253` from
 * `new FastResponse(stream, { headers })` to
 * `new FastResponse(stream, { status: 500, headers })` made the real
 * `src/server.static.test.ts` run fail 1 test (5 passed / 1 failed), at the
 * strengthened `response.ok` assertion. The dependency mutation was restored.
 *
 * Adverse search (all temporary edits were restored): an equivalent status
 * assertion (`response.status === 200`), a non-empty-body assertion, and a
 * changed non-empty fixture body each left both named kept-red tests red with
 * `AssertionError: expected false to be true // Object.is equality`. A second
 * production-path mutation, returning `new FastResponse(null, { headers })`
 * from the same srvx handler line, made the real static test fail its exact
 * body assertion (and the allowlisted `.well-known` body assertion). No
 * surviving alternate mutation was found.
 *
 * Green run:
 *   pnpm --filter front exec vitest run src/server.static.test.ts
 *   Test Files 1 passed; Tests 6 passed.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { StaticMiddlewareOptions } from 'srvx/static';
import { staticMiddleware } from 'srvx/static';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
	assertNormalStaticFileResponse,
	INDEX_HTML_BODY,
} from '../../helpers/static-file-assertions';
import { executeStaticFileScenario } from '../../helpers/static-file-scenario';

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
	renderHTML: NonNullable<StaticMiddlewareOptions['renderHTML']>,
): Promise<Response> => {
	const directory = getFixtureDirectory();
	let renderHTMLObserved = false;
	const handler = staticMiddleware({
		dir: directory,
		renderHTML: (context) => {
			renderHTMLObserved = true;
			return renderHTML(context);
		},
	});
	const response = await executeStaticFileScenario({
		directory,
		handler,
	});

	if (!renderHTMLObserved) {
		throw new Error(
			'MESURE IMPOSSIBLE: staticMiddleware did not execute its production ' +
				'renderHTML path for the fixture file.',
		);
	}

	return response;
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
			({ html }) =>
				new Response(html, {
					status: 500,
				}),
		);

		expect(await normalStaticAssertionsAccepted(brokenResponse)).toBe(true);
	});

	test('normal static-file assertions accept a successful empty body (#1915 body axis)', async () => {
		const brokenResponse = await executeStaticHandler(
			() =>
				new Response('', {
					status: 200,
				}),
		);

		expect(await normalStaticAssertionsAccepted(brokenResponse)).toBe(true);
	});
});
