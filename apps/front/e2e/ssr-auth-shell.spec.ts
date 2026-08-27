import { expect, test, type Request } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const EMPTY_STORAGE_STATE = {
	cookies: [],
	origins: [],
};

const AUTHED_CHROME_MARKERS = [
	'data-mode="authed"',
	'data-testid="app-shell-rail"',
	'data-testid="app-shell-topbar"',
];

type MatrixCase = {
	name: string;
	path: string;
	status: number;
	cookie?: string;
	location?: RegExp;
};

test.use({ storageState: EMPTY_STORAGE_STATE });

const expectNoAuthedChrome = (html: string) => {
	for (const marker of AUTHED_CHROME_MARKERS) {
		expect(html).not.toContain(marker);
	}
};

const isValidationRequest = (request: Request) =>
	request.method() === 'GET' &&
	new URL(request.url()).pathname.endsWith('/auth/redirect-code');

test.describe('SSR auth shell', { tag: ['@security', '@997'] }, () => {
	test('SSR never serves authenticated chrome from an unvalidated cookie or a /staff prefix', async ({
		request,
	}) => {
		const cases: readonly MatrixCase[] = [
			{
				name: 'no cookie on a known authed route',
				path: '/staff/staff-users',
				status: 307,
				location: /\/login\?rto=%2Fstaff%2Fstaff-users$/,
			},
			{
				name: 'no cookie on an unknown staff path',
				path: '/staff/users',
				status: 404,
			},
			{
				name: 'no cookie on another unknown staff path',
				path: '/staff/not-a-route',
				status: 404,
			},
			{
				name: 'no cookie on a lookalike public path',
				path: '/staffing',
				status: 404,
			},
			{
				name: 'forged staff token',
				path: '/staff/staff-users',
				cookie: 'publyapp-session_token=s:forged',
				status: 200,
			},
			{
				name: 'validly formatted forged staff and tenant hints',
				path: '/staff/staff-users',
				cookie: 'publyapp-session_token=s:forged-staff+t:forged-tenant',
				status: 200,
			},
			{
				name: 'expired token',
				path: '/staff/staff-users',
				cookie: 'publyapp-session_token=s:expired',
				status: 200,
			},
			{
				name: 'empty scoped token',
				path: '/staff/staff-users',
				cookie: 'publyapp-session_token=s:',
				status: 200,
			},
			{
				name: 'malformed raw legacy token',
				path: '/staff/staff-users',
				cookie: 'publyapp-session_token=forged-legacy',
				status: 200,
			},
		];

		for (const matrixCase of cases) {
			const response = await request.get(matrixCase.path, {
				headers: matrixCase.cookie ? { cookie: matrixCase.cookie } : undefined,
				maxRedirects: 0,
			});
			const html = await response.text();

			expect(response.status(), matrixCase.name).toBe(matrixCase.status);
			if (matrixCase.location) {
				expect(response.headers().location, matrixCase.name).toMatch(
					matrixCase.location,
				);
			}
			expectNoAuthedChrome(html);
		}
	});

	test('hydration never validates stale cookies on unknown authed-prefix paths, so 404 stays genuine', async ({
		context,
	}) => {
		// `_authed-layout`'s own `beforeLoad` applies the same
		// `hasExactAuthedRouteMatch` guard the root already applies (PR #997
		// finding 1), so none of these cases may redirect away from an unknown
		// path anymore: neither the tokenless/unresolvable-token branch (no
		// cookie, an empty scoped cookie, an unscoped/malformed legacy cookie)
		// nor the cross-surface branch (a bare tenant token, or an unscoped
		// legacy cookie that also parses as a tenant token) may fire for a path
		// that isn't an exact authenticated route match. With the redirect out
		// of the way for every one of these shapes, only the RoutedShell
		// surface-session query being fixed in this test is in play.
		const cases = [
			{
				cookie: undefined,
				name: 'no cookie on unknown staff path',
				path: '/staff/not-a-route',
			},
			{
				cookie: 's:',
				name: 'empty scoped token on unknown staff path',
				path: '/staff/not-a-route',
			},
			{
				cookie: 'forged-legacy',
				name: 'malformed raw legacy token on unknown staff path',
				path: '/staff/not-a-route',
			},
			{
				cookie: 't:forged-tenant',
				name: 'cross-scope tenant-only token on unknown staff path',
				path: '/staff/not-a-route',
			},
			{
				cookie: 's:forged',
				name: 'forged staff token on unknown staff path',
				path: '/staff/not-a-route',
			},
			{
				cookie: 's:expired',
				name: 'expired staff token on unknown staff path',
				path: '/staff/not-a-route',
			},
			{
				cookie: 's:forged-staff+t:forged-tenant',
				name: 'validly formatted forged staff and tenant hints on unknown staff path',
				path: '/staff/not-a-route',
			},
			{
				cookie: 's:forged',
				name: 'forged staff token on a lookalike public path',
				path: '/staffing',
			},
		] as const;

		for (const matrixCase of cases) {
			await context.clearCookies();
			if (matrixCase.cookie) {
				await context.addCookies([
					{
						name: 'publyapp-session_token',
						url: 'https://front.localhost:8443',
						value: matrixCase.cookie,
					},
				]);
			}

			const casePage = await context.newPage();
			const validationRequests: string[] = [];
			casePage.on('request', (request) => {
				if (isValidationRequest(request)) {
					validationRequests.push(request.url());
				}
			});

			const response = await casePage.goto(matrixCase.path, {
				waitUntil: 'domcontentloaded',
			});
			expect(response?.status(), matrixCase.name).toBe(404);

			await expect(
				casePage.getByTestId('view-404'),
				matrixCase.name,
			).toBeVisible();
			await casePage.waitForLoadState('networkidle');

			expect(validationRequests, matrixCase.name).toEqual([]);
			expect(new URL(casePage.url()).pathname, matrixCase.name).toBe(
				matrixCase.path,
			);
			expectNoAuthedChrome(await casePage.content());

			await casePage.close();
		}
	});

	test('a genuine session cold-loads the authenticated shell without a hydration error', async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (error) => {
			pageErrors.push(error.message);
		});

		await loginAsStaffAdmin(page);
		await page.goto('/staff/staff-users');

		await expect(page).toHaveURL(/\/staff\/staff-users(?:[?#].*)?$/);
		await expect(page.getByTestId('app-shell-shell')).toHaveAttribute(
			'data-mode',
			'authed',
		);
		await expect(page.getByTestId('app-shell-rail')).toBeVisible();
		await expect(page.getByTestId('app-shell-topbar')).toBeVisible();
		expect(pageErrors).toEqual([]);
	});

	test('genuine and junk cookies receive byte-identical neutral served subtrees', async ({
		context,
		page,
		playwright,
	}) => {
		await loginAsStaffAdmin(page);
		const genuineResponse = await context.request.get('/staff/staff-users');
		const genuineHtml = await genuineResponse.text();

		const junkContext = await playwright.request.newContext({
			baseURL: new URL(page.url()).origin,
			extraHTTPHeaders: {
				cookie: 'publyapp-session_token=s:forged',
			},
			ignoreHTTPSErrors: true,
		});
		const junkResponse = await junkContext.get('/staff/staff-users');
		const junkHtml = await junkResponse.text();
		await junkContext.dispose();

		expect(genuineResponse.status()).toBe(200);
		expect(junkResponse.status()).toBe(200);
		expectNoAuthedChrome(genuineHtml);
		expectNoAuthedChrome(junkHtml);
		const neutralSubtrees = await page.evaluate(
			({ genuine, junk }) => {
				const parser = new DOMParser();
				const extractNeutralShell = (html: string) =>
					parser
						.parseFromString(html, 'text/html')
						.querySelector('[data-testid="neutral-authed-shell"]')?.outerHTML;

				return {
					genuine: extractNeutralShell(genuine),
					junk: extractNeutralShell(junk),
				};
			},
			{ genuine: genuineHtml, junk: junkHtml },
		);
		expect(neutralSubtrees.genuine).toBeDefined();
		expect(neutralSubtrees.junk).toBe(neutralSubtrees.genuine);
		expect(neutralSubtrees.genuine).toHaveLength(2739);
	});

	test('a junk session cookie redirects from neutral chrome without mounting the authenticated shell', async ({
		context,
		page,
	}) => {
		await context.addCookies([
			{
				name: 'publyapp-session_token',
				value: 's:forged',
				url: 'https://front.localhost:8443',
			},
		]);
		await page.addInitScript(() => {
			const mountedModes: string[] = [];
			Object.defineProperty(window, '__publyMountedShellModes', {
				configurable: true,
				value: mountedModes,
			});
			const captureShellMode = () => {
				const mode = document
					.querySelector('[data-mode]')
					?.getAttribute('data-mode');
				if (mode) {
					mountedModes.push(mode);
				}
			};
			new MutationObserver(captureShellMode).observe(document, {
				attributes: true,
				childList: true,
				subtree: true,
			});
			document.addEventListener('DOMContentLoaded', captureShellMode, {
				once: true,
			});
		});

		await page.goto('/staff/staff-users');

		await expect(page).toHaveURL(
			(url) =>
				url.pathname === '/login' &&
				url.searchParams.get('rto') === '/staff/staff-users',
		);
		const mountedModes = await page.evaluate(
			() =>
				(
					window as typeof window & {
						__publyMountedShellModes?: string[];
					}
				).__publyMountedShellModes ?? [],
		);
		expect(mountedModes).not.toContain('authed');
	});

	test('session-validation failures expose an accessible neutral Retry and recover when the API returns', async ({
		browser,
		context,
		page,
	}, testInfo) => {
		test.setTimeout(90_000);
		await loginAsStaffAdmin(page);
		const authenticatedState = await context.storageState();
		const baseURL = testInfo.project.use.baseURL;

		const cases = [
			'aborted',
			'server 500',
			'malformed response',
			'disconnected',
			'held past timeout',
		] as const;

		for (const failureCase of cases) {
			const caseContext = await browser.newContext({
				baseURL,
				ignoreHTTPSErrors: true,
				storageState: authenticatedState,
			});
			let failedAttemptCount = 0;
			let successfulAttemptCount = 0;
			let activeRequestCount = 0;
			let maximumActiveRequestCount = 0;
			let totalRequestCount = 0;
			let isRecoveryEnabled = false;
			let releaseFirstRequest: (() => void) | undefined;
			const firstRequestBlocked = new Promise<void>((resolve) => {
				releaseFirstRequest = resolve;
			});

			await caseContext.route('**/auth/redirect-code**', async (route) => {
				if (route.request().method() !== 'GET') {
					await route.fallback();
					return;
				}

				if (isRecoveryEnabled) {
					successfulAttemptCount += 1;
					await route.continue();
					return;
				}

				failedAttemptCount += 1;
				if (failureCase === 'held past timeout') {
					await firstRequestBlocked;
					await route.abort('timedout');
					return;
				}

				if (failureCase === 'aborted') {
					await route.abort('aborted');
					return;
				}

				if (failureCase === 'server 500') {
					await route.fulfill({
						contentType: 'application/problem+json',
						json: {
							detail: 'Deterministic validation failure',
							status: 500,
							title: 'Internal Server Error',
						},
						status: 500,
					});
					return;
				}

				if (failureCase === 'malformed response') {
					await route.fulfill({
						body: '{"redirectCode":',
						contentType: 'application/json',
						status: 200,
					});
					return;
				}

				await route.abort('internetdisconnected');
			});
			const casePage = await caseContext.newPage();
			const activeRequests = new Set<Request>();
			const isValidationRequest = (request: Request) =>
				request.method() === 'GET' &&
				new URL(request.url()).pathname.endsWith('/auth/redirect-code');
			casePage.on('request', (request) => {
				if (!isValidationRequest(request)) {
					return;
				}

				totalRequestCount += 1;
				activeRequests.add(request);
				activeRequestCount = activeRequests.size;
				maximumActiveRequestCount = Math.max(
					maximumActiveRequestCount,
					activeRequestCount,
				);
			});
			const markRequestSettled = (request: Request) => {
				if (!isValidationRequest(request)) {
					return;
				}

				activeRequests.delete(request);
				activeRequestCount = activeRequests.size;
			};
			casePage.on('requestfailed', markRequestSettled);
			casePage.on('requestfinished', markRequestSettled);

			await casePage.goto('/staff/staff-users', {
				waitUntil: 'domcontentloaded',
			});
			await expect
				.poll(() => failedAttemptCount, {
					message: `${failureCase}: validation GET started`,
				})
				.toBe(1);

			const retry = casePage.getByRole('button', { name: 'Retry' });
			await expect(retry, failureCase).toBeVisible({ timeout: 25_000 });
			await expect
				.poll(() => activeRequestCount, {
					message: `${failureCase}: failed validation request was cancelled`,
				})
				.toBe(0);
			await expect(
				casePage.getByTestId('neutral-authed-recovery'),
			).toBeVisible();
			await expect(casePage.getByTestId('neutral-authed-shell')).toHaveCount(0);
			await expect(casePage.getByTestId('app-shell-shell')).toHaveCount(0);
			// The only link on this screen is the always-rendered "Go to home"
			// control (PR #997 finding 3) — it must never be hidden, including
			// during a goto-driven (not reload-driven) recovery flow like this one.
			const homeLink = casePage.getByRole('link', { name: 'Go to home' });
			await expect(casePage.getByRole('link')).toHaveCount(1);
			await expect(homeLink).toBeVisible();
			await expect(homeLink).toHaveAttribute('href', '/');
			expect(
				await retry.locator('xpath=ancestor-or-self::*[@inert]').count(),
				failureCase,
			).toBe(0);
			expect(
				await retry
					.locator('xpath=ancestor-or-self::*[@aria-hidden="true"]')
					.count(),
				failureCase,
			).toBe(0);

			await retry.focus();
			await expect(retry).toBeFocused();

			isRecoveryEnabled = true;
			await casePage.keyboard.press('Enter');

			await expect(casePage.getByTestId('app-shell-shell')).toBeVisible({
				timeout: 15_000,
			});
			if (releaseFirstRequest) {
				releaseFirstRequest();
			}
			expect(failedAttemptCount, failureCase).toBe(1);
			expect(successfulAttemptCount, failureCase).toBe(1);
			expect(totalRequestCount, failureCase).toBe(2);
			expect(maximumActiveRequestCount, failureCase).toBe(1);

			await caseContext.close();
		}
	});

	// #1639: each matrix case owns its own test so a future failure names the
	// culprit, and no single 30s envelope stretches across all twelve page
	// loads. The matrix itself is unchanged (3 widths × 2 paths × 2 sidebar
	// states = 12 cases); only the loop that ran them inside one test has been
	// lifted to generate one test() per case.
	const geometryCases = [
		{ pathname: '/staff/profiles', sidebarOpen: true, width: 390 },
		{ pathname: '/staff/profiles', sidebarOpen: false, width: 390 },
		{ pathname: '/staff/staff-users', sidebarOpen: true, width: 390 },
		{ pathname: '/staff/staff-users', sidebarOpen: false, width: 390 },
		{ pathname: '/staff/profiles', sidebarOpen: true, width: 800 },
		{ pathname: '/staff/profiles', sidebarOpen: false, width: 800 },
		{ pathname: '/staff/staff-users', sidebarOpen: true, width: 800 },
		{ pathname: '/staff/staff-users', sidebarOpen: false, width: 800 },
		{ pathname: '/staff/profiles', sidebarOpen: true, width: 1440 },
		{ pathname: '/staff/profiles', sidebarOpen: false, width: 1440 },
		{ pathname: '/staff/staff-users', sidebarOpen: true, width: 1440 },
		{ pathname: '/staff/staff-users', sidebarOpen: false, width: 1440 },
	] as const;

	for (const matrixCase of geometryCases) {
		const sidebarLabel = matrixCase.sidebarOpen ? 'open' : 'closed';
		test(`neutral authenticated geometry matches the hydrated shell (${matrixCase.pathname}, ${matrixCase.width}px, sidebar ${sidebarLabel})`, async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);
			const casePage = page;
			await casePage.setViewportSize({
				height: 900,
				width: matrixCase.width,
			});
			await casePage.addInitScript((sidebarOpen) => {
				window.localStorage.setItem(
					'publyapp:sidebar-open',
					JSON.stringify(sidebarOpen),
				);
			}, matrixCase.sidebarOpen);

			let releaseValidation: (() => void) | undefined;
			const validationBlocked = new Promise<void>((resolve) => {
				releaseValidation = resolve;
			});
			const validationRequest = casePage.waitForRequest(
				(request) => isValidationRequest(request),
				{
					timeout: 30_000,
				},
			);
			await casePage.route('**/auth/redirect-code**', async (route) => {
				await validationBlocked;
				await route.continue();
			});

			await casePage.goto(matrixCase.pathname, {
				waitUntil: 'domcontentloaded',
			});
			await expect(casePage.getByTestId('neutral-authed-shell')).toBeVisible();
			await expect(
				validationRequest,
				`${matrixCase.pathname} ${matrixCase.width}px did not validate the session`,
			).resolves.toBeTruthy();

			const neutralGeometry = await casePage
				.locator('.neutral-authed-shell > .app-shell-body')
				.evaluate((element) => {
					const bounds = element.getBoundingClientRect();
					return { left: bounds.left, width: bounds.width };
				});

			if (!releaseValidation) {
				throw new Error('the session-validation gate was not initialized');
			}
			releaseValidation();
			await expect(casePage.getByTestId('app-shell-shell')).toBeVisible();
			const hydratedGeometry = await casePage
				.locator(
					'.app-shell-workspace:not(.neutral-authed-shell) > .app-shell-body',
				)
				.evaluate((element) => {
					const bounds = element.getBoundingClientRect();
					return { left: bounds.left, width: bounds.width };
				});

			expect(
				hydratedGeometry,
				`${matrixCase.pathname} at ${matrixCase.width}px with sidebar ${sidebarLabel}`,
			).toEqual(neutralGeometry);
		});
	}
});
