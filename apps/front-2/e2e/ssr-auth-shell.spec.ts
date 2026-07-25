import { expect, test } from '@playwright/test';

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

const PROFILE_ID = '11111111-1111-1111-1111-111111111111';

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
			url: 'https://front-2.localhost:8443',
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
		await expect(casePage.getByTestId('neutral-authed-recovery')).toBeVisible();
		await expect(casePage.getByTestId('neutral-authed-shell')).toHaveCount(0);
		await expect(casePage.getByTestId('app-shell-shell')).toHaveCount(0);
		await expect(casePage.getByRole('link')).toHaveCount(0);
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
		if (releaseFirstRequest) {
			releaseFirstRequest();
		}
		await casePage.keyboard.press('Enter');

		await expect(casePage.getByTestId('app-shell-shell')).toBeVisible({
			timeout: 15_000,
		});
		expect(failedAttemptCount, failureCase).toBe(1);
		expect(successfulAttemptCount, failureCase).toBe(1);

		await caseContext.close();
	}
});

test('profile-user paging holds page 2 through a slow deterministic 25-user response', async ({
	page,
}) => {
	await loginAsStaffAdmin(page);

	const requestedPages: number[] = [];
	let releaseSecondPage: (() => void) | undefined;
	const secondPageBlocked = new Promise<void>((resolve) => {
		releaseSecondPage = resolve;
	});

	await page.route(
		`**/staff/profiles/${PROFILE_ID}**`,
		async (route, request) => {
			const url = new URL(request.url());
			if (!url.hostname.startsWith('api.')) {
				await route.continue();
				return;
			}

			if (!url.pathname.endsWith('/users')) {
				await route.fulfill({
					contentType: 'application/json',
					json: {
						profile: {
							description: 'Deterministic paging fixture',
							id: PROFILE_ID,
							name: 'QA profile',
							userAccountCount: 25,
						},
					},
				});
				return;
			}

			const pageNumber = Number(url.searchParams.get('page') ?? '1');
			requestedPages.push(pageNumber);
			if (pageNumber === 2) {
				await secondPageBlocked;
			}

			const firstUserNumber = (pageNumber - 1) * 10 + 1;
			const users = Array.from(
				{ length: pageNumber === 3 ? 5 : 10 },
				(_, index) => {
					const userNumber = firstUserNumber + index;
					return {
						avatarUrl: null,
						email: `qa-user-${userNumber}@example.test`,
						firstName: 'QA',
						id: `00000000-0000-0000-0000-${String(userNumber).padStart(12, '0')}`,
						lastName: `User ${userNumber}`,
						status: 'active',
					};
				},
			);
			await route.fulfill({
				contentType: 'application/json',
				json: { count: 25, users },
			});
		},
	);

	await page.goto(`/staff/profiles/${PROFILE_ID}/users?size=10`);
	await expect(
		page.getByTestId('staff-profile-users-table-page-label'),
	).toHaveText('Page 1');

	await page.getByTestId('staff-profile-users-table-next-page').click();
	await expect.poll(() => requestedPages.includes(2)).toBe(true);
	await page.waitForTimeout(250);
	expect(requestedPages).toEqual([1, 2]);

	if (!releaseSecondPage) {
		throw new Error('the page-2 response gate was not initialized');
	}
	releaseSecondPage();
	await expect(
		page.getByTestId('staff-profile-users-table-page-label'),
	).toHaveText('Page 2');
	await expect(page.getByText('qa-user-11@example.test')).toBeVisible();

	await page.getByTestId('staff-profile-users-table-prev-page').click();
	await expect(
		page.getByTestId('staff-profile-users-table-page-label'),
	).toHaveText('Page 1');
	await expect(page.getByText('qa-user-1@example.test')).toBeVisible();
	expect(requestedPages).toEqual([1, 2]);
});

test('profile-user count shrink revalidates the cached clamp destination before showing rows', async ({
	page,
}) => {
	await loginAsStaffAdmin(page);

	const requestedPages: number[] = [];
	let totalCount = 25;
	await page.route(
		`**/staff/profiles/${PROFILE_ID}**`,
		async (route, request) => {
			const url = new URL(request.url());
			if (!url.hostname.startsWith('api.')) {
				await route.continue();
				return;
			}

			if (!url.pathname.endsWith('/users')) {
				await route.fulfill({
					contentType: 'application/json',
					json: {
						profile: {
							description: 'Count shrink fixture',
							id: PROFILE_ID,
							name: 'QA profile',
							userAccountCount: 25,
						},
					},
				});
				return;
			}

			const pageNumber = Number(url.searchParams.get('page') ?? '1');
			requestedPages.push(pageNumber);
			if (pageNumber === 3) {
				totalCount = 15;
			}

			let length = 10;
			if (pageNumber === 3) {
				length = 0;
			} else if (pageNumber === 2 && totalCount === 15) {
				length = 5;
			}
			const users = Array.from({ length }, (_, index) => ({
				avatarUrl: null,
				email: `boundary-${pageNumber}-${index}@example.test`,
				firstName: 'Boundary',
				id: `00000000-0000-0000-${String(pageNumber).padStart(4, '0')}-${String(index).padStart(12, '0')}`,
				lastName: `User ${index}`,
				status: 'active',
			}));
			await route.fulfill({
				contentType: 'application/json',
				json: { count: totalCount, users },
			});
		},
	);

	await page.goto(`/staff/profiles/${PROFILE_ID}/users?size=10`);
	await page.getByTestId('staff-profile-users-table-next-page').click();
	await expect(page.getByText('boundary-2-9@example.test')).toBeVisible();
	await page.getByTestId('staff-profile-users-table-next-page').click();

	await expect(
		page.getByTestId('staff-profile-users-table-page-label'),
	).toHaveText('Page 2');
	await expect(page.getByText('boundary-2-4@example.test')).toBeVisible();
	await expect(page.getByText('boundary-2-9@example.test')).toHaveCount(0);
	expect(requestedPages).toEqual([1, 2, 3, 2]);
});

test('profile-user paging hides at zero and disables Next at exactly one page', async ({
	page,
}) => {
	await loginAsStaffAdmin(page);

	let totalCount = 0;
	await page.route(
		`**/staff/profiles/${PROFILE_ID}**`,
		async (route, request) => {
			const url = new URL(request.url());
			if (!url.hostname.startsWith('api.')) {
				await route.continue();
				return;
			}

			if (!url.pathname.endsWith('/users')) {
				await route.fulfill({
					contentType: 'application/json',
					json: {
						profile: {
							description: 'Paging boundary fixture',
							id: PROFILE_ID,
							name: 'QA profile',
							userAccountCount: totalCount,
						},
					},
				});
				return;
			}

			const users = Array.from({ length: totalCount }, (_, index) => ({
				avatarUrl: null,
				email: `boundary-single-${index}@example.test`,
				firstName: 'Boundary',
				id: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
				lastName: `User ${index}`,
				status: 'active',
			}));
			await route.fulfill({
				contentType: 'application/json',
				json: { count: totalCount, users },
			});
		},
	);

	await page.goto(`/staff/profiles/${PROFILE_ID}/users?size=10`);
	await expect(
		page.getByTestId('staff-profile-users-table-footer'),
	).toHaveCount(0);

	totalCount = 10;
	await page.reload();
	await expect(page.getByText('boundary-single-9@example.test')).toBeVisible();
	await expect(
		page.getByTestId('staff-profile-users-table-next-page'),
	).toBeDisabled();
});

test('staff profiles and staff users still page forward and backward by cursor', async ({
	page,
}) => {
	await loginAsStaffAdmin(page);

	const profileCursors: Array<string | null> = [];
	const userCursors: Array<string | null> = [];
	await page.route('**/staff/profiles?**', async (route, request) => {
		const url = new URL(request.url());
		if (!url.hostname.startsWith('api.')) {
			await route.continue();
			return;
		}

		const cursor = url.searchParams.get('cursor');
		profileCursors.push(cursor);
		await route.fulfill({
			contentType: 'application/json',
			json: {
				data: [
					{
						description: null,
						id:
							cursor === 'profile-cursor-2'
								? '22222222-2222-2222-2222-222222222222'
								: PROFILE_ID,
						name:
							cursor === 'profile-cursor-2'
								? 'Profile page 2'
								: 'Profile page 1',
						userAccountCount: 1,
					},
				],
				nextCursor: cursor === 'profile-cursor-2' ? null : 'profile-cursor-2',
			},
		});
	});
	await page.route('**/staff/users?**', async (route, request) => {
		const url = new URL(request.url());
		if (!url.hostname.startsWith('api.')) {
			await route.continue();
			return;
		}

		const cursor = url.searchParams.get('cursor');
		userCursors.push(cursor);
		await route.fulfill({
			contentType: 'application/json',
			json: {
				data: [
					{
						avatarUrl: null,
						email:
							cursor === 'user-cursor-2'
								? 'staff-page-2@example.test'
								: 'staff-page-1@example.test',
						firstName: 'Staff',
						id:
							cursor === 'user-cursor-2'
								? '44444444-4444-4444-4444-444444444444'
								: '33333333-3333-3333-3333-333333333333',
						lastName: cursor === 'user-cursor-2' ? 'Page 2' : 'Page 1',
						level: 'admin',
						status: 'active',
					},
				],
				nextCursor: cursor === 'user-cursor-2' ? null : 'user-cursor-2',
			},
		});
	});

	await page.goto('/staff/profiles?size=10');
	await expect(page.getByText('Profile page 1')).toBeVisible();
	await page.getByTestId('staff-profiles-table-next-page').click();
	await expect(page.getByText('Profile page 2')).toBeVisible();
	await expect(page.getByTestId('staff-profiles-table-page-label')).toHaveText(
		'Page 2',
	);
	await page.getByTestId('staff-profiles-table-prev-page').click();
	await expect(page.getByText('Profile page 1')).toBeVisible();
	expect(profileCursors).toEqual([null, 'profile-cursor-2']);

	await page.goto('/staff/staff-users?size=10');
	await expect(page.getByText('staff-page-1@example.test')).toBeVisible();
	await page.getByTestId('staff-users-table-next-page').click();
	await expect(page.getByText('staff-page-2@example.test')).toBeVisible();
	await expect(page.getByTestId('staff-users-table-page-label')).toHaveText(
		'Page 2',
	);
	await page.getByTestId('staff-users-table-prev-page').click();
	await expect(page.getByText('staff-page-1@example.test')).toBeVisible();
	expect(userCursors).toEqual([null, 'user-cursor-2']);
});

test('neutral authenticated geometry matches the hydrated shell across responsive widths', async ({
	context,
	page,
}) => {
	await loginAsStaffAdmin(page);

	const cases = [
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

	for (const matrixCase of cases) {
		const casePage = await context.newPage();
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
		let validationRequestSeen = false;
		await casePage.route('**/auth/redirect-code**', async (route) => {
			validationRequestSeen = true;
			await validationBlocked;
			await route.continue();
		});

		await casePage.goto(matrixCase.pathname, {
			waitUntil: 'domcontentloaded',
		});
		await expect(casePage.getByTestId('neutral-authed-shell')).toBeVisible();
		await expect
			.poll(() => validationRequestSeen, {
				message: `${matrixCase.pathname} ${matrixCase.width}px did not validate the session`,
			})
			.toBe(true);

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
			`${matrixCase.pathname} at ${matrixCase.width}px with sidebar ${
				matrixCase.sidebarOpen ? 'open' : 'closed'
			}`,
		).toEqual(neutralGeometry);

		await casePage.close();
	}
});
