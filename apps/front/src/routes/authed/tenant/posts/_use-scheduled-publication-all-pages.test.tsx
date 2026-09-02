/**
 * @vitest-environment jsdom
 *
 * Real-hook regression suite for issue #2053 (`fix/2053-front-aggregation`).
 *
 * The calendar page drives `useScheduledPublicationAllPages` with the
 * `tenantId` resolved by `useResolvedWorkspaceTenantId` — meaning the
 * `tenantId` prop CAN change across a session (workspace switch, picker
 * re-resolution). Today the hook only resets its aggregation when the
 * visible month / status set changes, so a tenant switch can leave the
 * previous tenant's rows, dedupe memory, and cursor stack attached to the
 * new tenant's walk. The calendar must clear these SYNCHRONOUSLY (in the
 * same commit, not after the next effect) — otherwise the next paint of
 * the calendar shows data from the workspace the user just left.
 *
 * The page also needs TERMINAL error semantics: once a page errors, the
 * walk must stop driving the queue (no further fetches, the page's error
 * surface owns the render). The current hook keeps `isAggregating` true
 * even after a terminal error (cursor never advances, so it stays
 * `!completed`) which traps the page in a perpetual loading skeleton.
 *
 * Plus two ACL guarantees inherited from the centralized 401-only logout
 * invariant: 401 must still gate logout at the hook boundary (defence in
 * depth alongside the QueryCache backstop); 403 must NEVER gate logout.
 *
 * These tests exercise the REAL `useScheduledPublicationAllPages` hook
 * against a real `QueryClient`; only the Kiota client manager and the
 * logger are mocked. Everything else (window reset during render, dedupe,
 * cycle detection, terminal stop, restart) is the production code.
 */
// react-dom's `act` expects this flag when there's no test-runner integration
// (e.g. @testing-library/react) declaring the environment for it.
// (Suppressed — @testing-library/react sets it implicitly for jsdom.)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	get: vi.fn(),
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateClient: () => ({
			posts: { publications: { get: mocks.get } },
		}),
	}),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

const WINDOW = {
	from: new Date('2026-08-01T00:00:00.000Z'),
	to: new Date('2026-08-31T23:59:59.999Z'),
};

const EN_LABELS: TestLabelMap = {
	calendar: 'Calendar',
	'calendar-description': 'Scheduled publications grouped by local date.',
	'calendar-empty-title': 'No publications this month',
	'calendar-empty-description': 'Scheduled publications will appear here.',
	'common:calendar': 'Calendar',
	'common:list-unavailable-title': 'List unavailable',
	'common:list-error-default-description': 'An error occurred.',
	'read-only': 'Read only',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

import type { ScheduledPublicationRow } from '~/lib/query/tenant-scheduled-publications';

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { useScheduledPublicationAllPages } from './_use-scheduled-publication-all-pages';

type ProbeProps = {
	tenantId: string;
	initialSize?: number;
};

type ProbeResult = ReturnType<typeof useScheduledPublicationAllPages> & {
	restart: () => void;
	onRetry: () => void;
};

const mountProbe = (props: ProbeProps) => {
	let latest: ProbeResult | undefined;

	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});

	const Probe = ({ tenantId, initialSize = 100 }: ProbeProps) => {
		const result = useScheduledPublicationAllPages({
			tenantId,
			window: WINDOW,
			initialSize,
		});
		latest = result as ProbeResult;
		return (
			<div data-testid="probe-rows" data-row-count={result.rows.length}>
				{result.rows.map((row) => (
					<article
						key={row.publicationId}
						data-publication-id={row.publicationId}
					>
						{row.postBodyPreview}
					</article>
				))}
				{result.error ? (
					<div
						data-testid="probe-error"
						data-status={String(
							'status' in (result.error as { status?: unknown })
								? (result.error as { status?: unknown }).status
								: '',
						)}
					>
						{String((result.error as Error).message ?? '')}
					</div>
				) : null}
				{result.isAggregating ? (
					<div data-testid="probe-aggregating" />
				) : (
					<div data-testid="probe-idle" />
				)}
			</div>
		);
	};

	const Wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);

	const utils = render(<Probe {...props} />, { wrapper: Wrapper });

	const readProbe = () => {
		if (!latest) {
			throw new Error('useScheduledPublicationAllPages did not render');
		}
		return latest;
	};

	const rerender = (nextProps: ProbeProps) =>
		utils.rerender(<Probe {...nextProps} />);

	return { readProbe, rerender, queryClient };
};

const rowOf = (
	publicationId: string,
	postBodyPreview: string,
): ScheduledPublicationRow => ({
	id: publicationId,
	publicationId,
	postId: `post-${publicationId}`,
	postBodyPreview,
	accountDisplayHandle: null,
	status: 'scheduled',
	postStatus: 'scheduled',
	scheduledAtUtc: new Date('2026-08-10T10:00:00.000Z'),
	scheduledAtLocal: '2026-08-10T12:00:00+02:00',
	timeZone: 'Europe/Paris',
});

const page = (data: ScheduledPublicationRow[], nextCursor: string | null) => ({
	data,
	nextCursor,
});

const problemError = (status: number, title: string) => ({
	responseStatusCode: status,
	title,
});

beforeEach(() => {
	mocks.get.mockReset();
});

afterEach(() => {
	cleanup();
});

describe('useScheduledPublicationAllPages (#2053)', () => {
	test('stays aggregating while the first page is still pending', () => {
		mocks.get.mockImplementationOnce(() => new Promise(() => {}));

		const probe = mountProbe({ tenantId: 'tenant-A' });

		expect(probe.readProbe().rows).toEqual([]);
		expect(probe.readProbe().isAggregating).toBe(true);
	});

	test('clears the aggregation synchronously when the tenant switches — no paint can observe the previous tenant rows', async () => {
		// First tenant: populate rows from page 1.
		mocks.get.mockResolvedValueOnce(page([rowOf('tenantA-pub-1', 'A1')], null));
		const probe = mountProbe({ tenantId: 'tenant-A' });

		await waitFor(() => {
			expect(probe.readProbe().rows.map((r) => r.publicationId)).toEqual([
				'tenantA-pub-1',
			]);
		});

		// Switch tenants: the next page request is for tenant-B with no
		// cursor (a fresh walk).
		mocks.get.mockResolvedValueOnce(page([rowOf('tenantB-pub-1', 'B1')], null));

		act(() => {
			probe.rerender({ tenantId: 'tenant-B' });
		});

		// Synchronous: the very next render after the rerender MUST already
		// have cleared tenant-A's rows. The dedupe Set carried over from
		// tenant-A would otherwise reject `tenantB-pub-1` as a duplicate of
		// itself on the next fetch, and the previous tenant's rows would
		// survive into the new tenant's walk.
		const immediatelyAfterSwitch = probe.readProbe();
		expect(immediatelyAfterSwitch.rows.map((r) => r.publicationId)).toEqual([]);

		await waitFor(() => {
			expect(probe.readProbe().rows.map((r) => r.publicationId)).toEqual([
				'tenantB-pub-1',
			]);
		});

		// The fetch issued under tenant-B MUST request tenant-B's scope and
		// a fresh page (no cursor) — otherwise the carried-over cursor from
		// tenant-A would skip the tenant-B walk.
		const tenantBRequest = mocks.get.mock.calls.at(-1)?.[0] as
			| { queryParameters?: { cursor?: string } }
			| undefined;
		expect(tenantBRequest?.queryParameters?.cursor).toBeUndefined();
	});

	test('terminal first error: stops the walk, exposes the error, and keeps isAggregating false so the error surface can render', async () => {
		mocks.get.mockRejectedValueOnce(problemError(500, 'Internal Server Error'));

		const probe = mountProbe({ tenantId: 'tenant-A' });

		await waitFor(() => {
			expect(probe.readProbe().error).not.toBeNull();
		});

		const result = probe.readProbe();

		// No rows from a failed walk.
		expect(result.rows).toEqual([]);
		// Walk is terminal: aggregation must NOT keep spinning, otherwise the
		// page is locked into its loading skeleton forever.
		expect(result.isAggregating).toBe(false);
		// Terminal error must surface verbatim so the page's error card can
		// classify it (transparent failure cause).
		expect(
			(result.error as { responseStatusCode?: number }).responseStatusCode,
		).toBe(500);
		// 500 must NEVER trigger logout (only 401 does).
		expect(result.shouldLogout).toBe(false);

		// Exactly one fetch was attempted — the failing first page. No
		// retries, no follow-up pages. The error stops the walk.
		expect(mocks.get).toHaveBeenCalledTimes(1);
	});

	test('terminal later error: preserves the rows already collected, stops the walk, exposes the error', async () => {
		// Page 1 succeeds with a next cursor; page 2 errors terminally.
		mocks.get
			.mockResolvedValueOnce(
				page(
					[
						rowOf('pub-1', 'first page row'),
						rowOf('pub-2', 'second page row candidate'),
					],
					'cursor-2',
				),
			)
			.mockRejectedValueOnce(problemError(503, 'Service Unavailable'));

		const probe = mountProbe({ tenantId: 'tenant-A' });

		await waitFor(() => {
			expect(mocks.get).toHaveBeenCalledTimes(2);
		});

		const result = probe.readProbe();

		// Page 1 rows MUST survive the terminal error — the calendar still
		// has something to render for the days we successfully fetched.
		expect(result.rows.map((r) => r.publicationId)).toEqual(['pub-1', 'pub-2']);
		// Walk is terminal after the page 2 failure.
		expect(result.isAggregating).toBe(false);
		// Terminal error surfaced.
		expect(
			(result.error as { responseStatusCode?: number }).responseStatusCode,
		).toBe(503);
		expect(result.shouldLogout).toBe(false);

		// Exactly the two pages — page 3 must not be attempted.
		expect(mocks.get).toHaveBeenCalledTimes(2);
	});

	test('restart() resets the cursor and dedupe memory so page 1 can succeed after a failed first attempt', async () => {
		// First attempt: page 1 errors terminally.
		mocks.get.mockRejectedValueOnce(problemError(500, 'Internal Server Error'));
		const probe = mountProbe({ tenantId: 'tenant-A' });

		await waitFor(() => {
			expect(probe.readProbe().error).not.toBeNull();
		});

		// Second attempt: page 1 now succeeds.
		mocks.get.mockResolvedValueOnce(
			page([rowOf('recovery-pub', 'recovery row')], null),
		);

		act(() => {
			probe.readProbe().restart();
		});

		await waitFor(() => {
			expect(probe.readProbe().rows.map((r) => r.publicationId)).toEqual([
				'recovery-pub',
			]);
		});

		const result = probe.readProbe();
		// Recovery clears the error and the loading flag.
		expect(result.error).toBeNull();
		expect(result.isAggregating).toBe(false);
		// Restart MUST re-issue the page 1 request with no cursor — otherwise
		// the carried-over state would skip / collide with previous attempts.
		const lastRequest = mocks.get.mock.calls.at(-1)?.[0] as
			| { queryParameters?: { cursor?: string } }
			| undefined;
		expect(lastRequest?.queryParameters?.cursor).toBeUndefined();
	});

	test('does not gate logout on a 403 — only 401 must (centralised failure-classifier invariant)', async () => {
		mocks.get.mockRejectedValueOnce(problemError(403, 'Forbidden'));

		const probe = mountProbe({ tenantId: 'tenant-A' });

		await waitFor(() => {
			expect(probe.readProbe().error).not.toBeNull();
		});

		const result = probe.readProbe();
		// The raw error from the fetcher still carries its wire status — the
		// hook must hand it through unchanged so the page's error classifier
		// can decide between "show error card" and "redirect to logout".
		expect(
			(result.error as { responseStatusCode?: number }).responseStatusCode,
		).toBe(403);
		// The whole point of the test: a 403 on a tenant-scoped listing is
		// "you do not have access to this slice", never "your session is
		// invalid" — the hook MUST NOT escalate it to a logout redirect.
		expect(result.shouldLogout).toBe(false);
		// ensure the test does not silently skip its real assertion
		expect(screen.getByTestId('probe-error')).toBeTruthy();
	});

	test('invalidate() refetches every page so the walk stays complete after data changes mid-session', async () => {
		// Page 1 then page 2 = complete walk (cursor null on last page).
		mocks.get
			.mockResolvedValueOnce(page([rowOf('pub-1', 'first')], 'cursor-2'))
			.mockResolvedValueOnce(page([rowOf('pub-2', 'second')], null));

		const probe = mountProbe({ tenantId: 'tenant-A' });

		// Wait for the full walk to land.
		await waitFor(() => {
			expect(probe.readProbe().rows.map((r) => r.publicationId)).toEqual([
				'pub-1',
				'pub-2',
			]);
		});
		await waitFor(() => {
			expect(probe.readProbe().isAggregating).toBe(false);
		});

		// Data has changed server-side. Provide a fresh set of pages so
		// invalidate() has something new to return — the in-memory copy that
		// the current implementation keeps in React state CANNOT update
		// without a real refetch.
		mocks.get
			.mockResolvedValueOnce(
				page(
					[rowOf('pub-1', 'first-updated'), rowOf('pub-3', 'third')],
					'cursor-2',
				),
			)
			.mockResolvedValueOnce(page([rowOf('pub-4', 'fourth')], null));

		await act(async () => {
			await probe.queryClient.invalidateQueries();
			// Let the refetch settle.
			await Promise.resolve();
		});

		// After invalidate, every page must be re-walked, deduped, flattened.
		// The updated server payload has pub-1, pub-3, pub-4 — the old
		// in-memory `rows` array (held in useState by the previous
		// implementation) would still show pub-1 + pub-2 here.
		await waitFor(() => {
			expect(probe.readProbe().rows.map((r) => r.publicationId)).toEqual([
				'pub-1',
				'pub-3',
				'pub-4',
			]);
		});
		expect(probe.readProbe().isAggregating).toBe(false);
		// Walk restarted from page 1, not appended.
		expect(mocks.get).toHaveBeenCalledTimes(4);
	});

	test('late-page failure then restart restarts the walk from page 1 and completes it', async () => {
		// Page 1 ok, page 2 fails terminally.
		mocks.get
			.mockResolvedValueOnce(page([rowOf('pub-1', 'first')], 'cursor-2'))
			.mockRejectedValueOnce(problemError(503, 'Service Unavailable'));

		const probe = mountProbe({ tenantId: 'tenant-A' });

		await waitFor(() => {
			expect(probe.readProbe().error).not.toBeNull();
		});

		// Recovery: page 1 + page 2 succeed.
		mocks.get
			.mockResolvedValueOnce(
				page([rowOf('pub-1', 'first'), rowOf('pub-2', 'second')], 'cursor-2'),
			)
			.mockResolvedValueOnce(page([rowOf('pub-3', 'third')], null));

		act(() => {
			probe.readProbe().restart();
		});

		// After restart, the walk must be complete with every row visible —
		// page 1 AND page 2. The current implementation keeps page 1's rows
		// in React state across the restart and skips the new page 1 request,
		// so it would re-show only [pub-1, pub-2] and never reach pub-3.
		await waitFor(() => {
			expect(probe.readProbe().rows.map((r) => r.publicationId)).toEqual([
				'pub-1',
				'pub-2',
				'pub-3',
			]);
		});

		const result = probe.readProbe();
		expect(result.error).toBeNull();
		expect(result.isAggregating).toBe(false);
		// 2 prior pages + 2 restart pages.
		expect(mocks.get).toHaveBeenCalledTimes(4);
		// The very first request of the restarted walk MUST be page 1 (no
		// cursor) — the previous implementation reuses the carried-over
		// cursor and would skip straight to the old page 2.
		const restartRequests = mocks.get.mock.calls.slice(2);
		expect(
			(
				restartRequests[0]?.[0] as
					| { queryParameters?: { cursor?: string } }
					| undefined
			)?.queryParameters?.cursor,
		).toBeUndefined();
	});

	test('in-flight A does not leak rows into B when the tenant switches mid-walk', async () => {
		// Tenant A: page 1 returns a row, page 2 will be in-flight when the
		// switch happens. We must NOT resolve those late responses against
		// the new tenant B.
		let resolvePage1A: ((value: unknown) => void) | undefined;
		let resolvePage2A: ((value: unknown) => void) | undefined;
		mocks.get
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolvePage1A = resolve;
					}),
			)
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolvePage2A = resolve;
					}),
			);

		const probe = mountProbe({ tenantId: 'tenant-A' });

		// Resolve A's page 1; the hook must auto-schedule page 2 (in
		// flight, still pending). Wait for the second call to actually
		// land before we switch tenants — otherwise we cannot be sure
		// the hook even tried to advance.
		await act(async () => {
			resolvePage1A?.(page([rowOf('A-pub-1', 'a1')], 'cursor-A2'));
			await Promise.resolve();
		});
		await waitFor(() => {
			expect(mocks.get).toHaveBeenCalledTimes(2);
		});

		// Tenant B: server returns a different page 1.
		mocks.get.mockResolvedValueOnce(page([rowOf('B-pub-1', 'b1')], null));

		await act(async () => {
			probe.rerender({ tenantId: 'tenant-B' });
		});

		// Synchronous reset — the very next paint after the rerender must NOT
		// show tenant-A rows.
		expect(probe.readProbe().rows.map((r) => r.publicationId)).toEqual([]);

		// Wait for B's walk to complete.
		await waitFor(() => {
			expect(probe.readProbe().rows.map((r) => r.publicationId)).toEqual([
				'B-pub-1',
			]);
		});

		// Now tenant A's late page 2 resolves — its row must NOT appear in
		// the calendar under tenant B. The previous implementation
		// accumulates into React state with a setState callback that
		// ignores the tenant switch, leaking the late A-pub-2 row.
		await act(async () => {
			resolvePage2A?.(page([rowOf('A-pub-2', 'a2-late')], null));
			await Promise.resolve();
		});

		// Settle any subsequent renders.
		await act(async () => {
			await Promise.resolve();
		});

		expect(probe.readProbe().rows.map((r) => r.publicationId)).toEqual([
			'B-pub-1',
		]);
	});
});
