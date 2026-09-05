import { readFileSync, writeFileSync } from 'node:fs';
/**
 * KEPT RED PROOF — issue #1611.
 *
 * This proof runs the real #1611 Playwright journey against a temporary source
 * mutation that collapses the all-deleted branch back into the generic empty
 * branch. The journey must fail on the visible all-deleted title assertion;
 * response-shape and setup failures are measurement errors, not kept-red
 * evidence. The source is restored in `finally`, then the unchanged journey
 * is replayed once more to prove the green state before the test returns.
 *
 * Replay directly (the proof is intentionally expected to fail at its final
 * kept-red assertion when the production source is correct):
 *
 *   cd apps/front && pnpm exec vitest run --config vitest.proofs.config.ts \
 *     tests/proofs/1611/red-1611-deleted-picker-message-collapsed.test.ts
 *
 * The second replay is the paired green half; the kept-red assertion remains
 * the final assertion in this test.
 */
import { createServer as createHttpServer } from 'node:http';
import { resolve } from 'node:path';

import { expect as playwrightExpect, request } from '@playwright/test';
import { createServer as createViteServer, type Plugin } from 'vite';
import { expect, test } from 'vitest';

const FRONT_ROOT = process.cwd();
const PICKER_STATES_PATH = resolve(
	FRONT_ROOT,
	'src/routes/authed/tenant/_tenant-picker-states.tsx',
);
const RENDER_TARGET_URL = '/@issue-1611-tenant-picker-render-target';
const RENDER_TARGET_ID = '\0issue-1611-tenant-picker-render-target';
const I18N_STUB_ID = '\0issue-1611-react-i18next';
const LOGOUT_STUB_ID = '\0issue-1611-use-logout';
const LOGOUT_SOURCE_ID = resolve(FRONT_ROOT, 'src/lib/hooks/use-logout.ts');
const PROOF_ROUTE = '/__proof/tenant-picker';
const MUTATION_FROM = 'if (hasDeletedTenants) {';
const MUTATION_TO = 'if (false) {';

const errorText = (error: unknown): string =>
	error instanceof Error ? `${error.name}: ${error.message}` : String(error);

type JourneyResult = {
	status: number | null;
	stdout: string;
	stderr: string;
	error?: Error;
};

type RenderTargetModule = {
	renderTenantPortalEmptyState: () => string;
};

type ProofRuntime = {
	url: string;
	close: () => Promise<void>;
};

const proofRuntimePlugin = (): Plugin => ({
	name: 'issue-1611-proof-runtime',
	enforce: 'pre',
	resolveId(id) {
		if (id === 'react-i18next') {
			return I18N_STUB_ID;
		}
		if (
			id === '~/lib/hooks/use-logout' ||
			id === LOGOUT_SOURCE_ID ||
			id === LOGOUT_SOURCE_ID.slice(0, -3)
		) {
			return LOGOUT_STUB_ID;
		}
		if (id === RENDER_TARGET_URL) {
			return RENDER_TARGET_ID;
		}
		return undefined;
	},
	load(id) {
		if (id === I18N_STUB_ID) {
			return `
const messages = {
  'all-organizations-deleted-title': 'Your organizations are no longer available',
  'all-organizations-deleted-description': 'All of your organizations have been removed by their administrators.',
  'no-organizations-found': 'No organizations found',
  'common-loading': 'Loading',
  'failed-to-load-organizations': 'Failed to load organizations',
  retry: 'Retry',
  'log-out': 'Log out',
};
export const useTranslation = () => ({
  t: (key) => messages[key] ?? key,
});
`;
		}
		if (id === LOGOUT_STUB_ID) {
			return `
export const useLogout = () => ({
  logout: () => undefined,
  isLoggingOut: false,
});
`;
		}
		if (id === RENDER_TARGET_ID) {
			return `
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TenantPortalEmptyState } from '/src/routes/authed/tenant/_tenant-picker-states.tsx';

export const renderTenantPortalEmptyState = () =>
  renderToStaticMarkup(
    React.createElement(TenantPortalEmptyState, { hasDeletedTenants: true }),
  );
`;
		}
		return undefined;
	},
});

const startProofRuntime = async (): Promise<ProofRuntime> => {
	const vite = await createViteServer({
		root: FRONT_ROOT,
		configFile: resolve(FRONT_ROOT, 'vite.config.ts'),
		plugins: [proofRuntimePlugin()],
		server: { middlewareMode: true, hmr: false, watch: null },
		ssr: { noExternal: ['react-i18next'] },
		appType: 'custom',
		logLevel: 'error',
	});

	const httpServer = createHttpServer((requestMessage, response) => {
		if (requestMessage.url !== PROOF_ROUTE) {
			response.writeHead(404);
			response.end();
			return;
		}

		void vite
			.ssrLoadModule(RENDER_TARGET_URL)
			.then((module) => {
				const markup = (
					module as RenderTargetModule
				).renderTenantPortalEmptyState();
				response.writeHead(200, { 'content-type': 'text/html' });
				response.end(`<!doctype html><html><body>${markup}</body></html>`);
			})
			.catch(() => {
				response.writeHead(500);
				response.end('SSR render failed');
			});
	});

	try {
		await new Promise<void>((resolvePromise, reject) => {
			httpServer.once('error', reject);
			httpServer.listen(0, '127.0.0.1', resolvePromise);
		});
		const address = httpServer.address();
		if (!address || typeof address === 'string') {
			throw new Error('Proof runtime did not expose a TCP address');
		}

		return {
			url: `http://127.0.0.1:${address.port}${PROOF_ROUTE}`,
			close: async () => {
				await new Promise<void>((resolvePromise) => {
					httpServer.close(() => resolvePromise());
				});
				await vite.close();
			},
		};
	} catch (error) {
		await vite.close();
		throw error;
	}
};

const runDeletedPickerJourney = async (): Promise<JourneyResult> => {
	let result: JourneyResult = {
		status: null,
		stdout: '',
		stderr: '',
	};
	let runtime: ProofRuntime | undefined;
	let browserRequest:
		| Awaited<ReturnType<typeof request.newContext>>
		| undefined;

	try {
		runtime = await startProofRuntime();
		browserRequest = await request.newContext();
		const response = await browserRequest.get(runtime.url);
		if (response.status() !== 200) {
			result = {
				status: null,
				stdout: '',
				stderr: `Playwright received HTTP ${response.status()} from the source-backed proof runtime`,
				error: new Error(
					'source-backed proof runtime returned a non-200 response',
				),
			};
		} else {
			const body = await response.text();
			try {
				playwrightExpect(body).toContain(
					'Your organizations are no longer available',
				);
				playwrightExpect(body).toContain(
					'All of your organizations have been removed by their administrators',
				);
				playwrightExpect(body).toContain('tenant-portal-logout-button');
				playwrightExpect(body).not.toContain('No organizations found');
				result = { status: 0, stdout: body, stderr: '' };
			} catch (error) {
				result = {
					status: 1,
					stdout: body,
					stderr: errorText(error),
				};
			}
		}
	} catch (error) {
		result = {
			status: null,
			stdout: '',
			stderr: errorText(error),
			error: error instanceof Error ? error : new Error(errorText(error)),
		};
	} finally {
		try {
			await browserRequest?.dispose();
			await runtime?.close();
		} catch (error) {
			if (result.status === 0) {
				result = {
					status: null,
					stdout: '',
					stderr: errorText(error),
					error: error instanceof Error ? error : new Error(errorText(error)),
				};
			}
		}
	}

	return result;
};

test('the source-backed #1611 journey rejects collapsed all-deleted copy', async () => {
	const original = readFileSync(PICKER_STATES_PATH, 'utf8');
	if (!original.includes(MUTATION_FROM)) {
		throw new Error(
			'MESURE IMPOSSIBLE: the all-deleted branch marker was not found; the proof mutation no longer targets the live source',
		);
	}

	let mutatedResult: JourneyResult | undefined;
	let restoredResult: JourneyResult | undefined;
	try {
		writeFileSync(
			PICKER_STATES_PATH,
			original.replace(MUTATION_FROM, MUTATION_TO),
			'utf8',
		);
		mutatedResult = await runDeletedPickerJourney();
	} finally {
		writeFileSync(PICKER_STATES_PATH, original, 'utf8');
		restoredResult = await runDeletedPickerJourney();
	}

	if (mutatedResult === undefined || mutatedResult.error) {
		throw new Error(
			'MESURE IMPOSSIBLE: Playwright could not start the #1611 journey',
		);
	}
	if (mutatedResult.status === null) {
		throw new Error(
			'MESURE IMPOSSIBLE: Playwright exited without a status for the #1611 journey',
		);
	}
	if (mutatedResult.status === 0) {
		throw new Error(
			'MESURE IMPOSSIBLE: the collapsed-message mutation did not make the #1611 journey fail',
		);
	}
	if (
		restoredResult === undefined ||
		restoredResult.error ||
		restoredResult.status !== 0
	) {
		throw new Error(
			'MESURE IMPOSSIBLE: the restored source did not make the #1611 journey pass',
		);
	}

	const output = `${mutatedResult.stdout}\n${mutatedResult.stderr}`;
	if (!output.includes('Your organizations are no longer available')) {
		throw new Error(
			'MESURE IMPOSSIBLE: the failed journey did not reach the visible all-deleted message assertion',
		);
	}

	// Kept-red assertion: with the temporary mutation, the source-backed
	// Playwright journey must fail this visible assertion. A passing assertion
	// means the journey no longer distinguishes the two empty states.
	expect(mutatedResult.status).toBe(0);
});
