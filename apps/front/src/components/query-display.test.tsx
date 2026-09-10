import { QueryObserver, QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
/**
 * @vitest-environment jsdom
 */
import { ServerFailure } from '~/lib/server/server-failure';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

import QueryDisplay from './query-display';

const TRANSLATION_LABELS: TestLabelMap = {
	loading: 'Loading…',
	'query-display-error-default': 'An error occurred while loading data.',
	'query-display-error-cause-unknown':
		"We couldn't determine what went wrong. Try again in a moment.",
	'error-403-code': '403 — Forbidden',
	'error-404-code': '404 — Not Found',
	'error-500-code': '500 — Server Error',
	'no-access-title': "You don't have access",
	'forbidden-description': 'The page is restricted.',
	'page-not-found': 'Page not found',
	'not-found-sentence': 'The page could not be found.',
	'error-500-title': 'Internal Server Error',
	'error-500-description': 'Something went wrong on our end.',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			return TRANSLATION_LABELS[key] ?? key;
		},
	}),
}));

afterEach(cleanup);

// Real query results built through TanStack Query's own observer (fetching
// disabled, state seeded directly), so every flag the component reads
// (isPending/isLoading/isFetching/isError/data/error) carries the library's
// actual semantics instead of hand-picked literals.
const stubQueryClient = new QueryClient();
const observerOf = (queryKey: readonly string[]) =>
	new QueryObserver(stubQueryClient, {
		queryKey: [...queryKey],
		queryFn: () => 'payload',
		enabled: false,
	});

const pendingQuery = observerOf(['stub-pending']).getCurrentResult();

stubQueryClient.setQueryData(['stub-success'], 'payload');
const successQueryStub = observerOf(['stub-success']).getCurrentResult();

const errorStubQuery = stubQueryClient.getQueryCache().build(stubQueryClient, {
	queryKey: ['stub-error'],
	queryFn: () => Promise.reject(new Error('boom')),
});
errorStubQuery.setState({
	status: 'error',
	fetchStatus: 'idle',
	error: new Error('boom'),
});
const errorQuery = observerOf(['stub-error']).getCurrentResult();

describe('QueryDisplay', () => {
	// shell F4: the default loading spinner and error fallback used to be
	// hardcoded English ("Loading" / "An error occurred while loading
	// data."); both now route through t().
	test('routes the default loading spinner aria-label through t()', () => {
		render(<QueryDisplay query={pendingQuery} />);

		expect(screen.getByRole('status').getAttribute('aria-label')).toBe(
			'Loading…',
		);
	});

	test('routes the default error fallback text through t()', () => {
		render(<QueryDisplay query={errorQuery} />);

		expect(screen.getByText('boom')).toBeTruthy();
	});

	test('renders the default error through the shared state surface path', () => {
		render(<QueryDisplay query={errorQuery} />);

		const announcement = screen.getByRole('status');
		expect(announcement.className).toContain('publy-state-surface');
		expect(
			announcement.querySelector('.publy-state-icon-cluster'),
		).not.toBeNull();
	});

	// PR 2: the render-prop children used to be mounted as a component, so an
	// inline closure was a brand-new component type on every parent render and
	// React remounted (reset) the whole data subtree — forms included — on every
	// keystroke. Direct invocation keeps the element tree stable across renders.
	test('does not remount the data subtree when the query object identity changes', () => {
		let mounts = 0;
		const Probe = () => {
			useEffect(() => {
				mounts += 1;
				return () => {
					mounts -= 1;
				};
			}, []);
			return <span>probe</span>;
		};

		const firstQuery = { ...successQueryStub };
		const { rerender } = render(
			<QueryDisplay query={firstQuery}>
				{({ data }: { data: string }) => <Probe key={data} />}
			</QueryDisplay>,
		);
		expect(mounts).toBe(1);

		// Same data, fresh query object — as a background refetch would produce.
		rerender(
			<QueryDisplay query={{ ...successQueryStub }}>
				{({ data }: { data: string }) => <Probe key={data} />}
			</QueryDisplay>,
		);
		expect(mounts).toBe(1);
	});

	test('a stable child keeps its DOM node across query identity churn', () => {
		const Probe = () => {
			const [count, setCount] = useState(0);
			return (
				<button type="button" onClick={() => setCount((c) => c + 1)}>
					count:{count}
				</button>
			);
		};

		const { rerender } = render(
			<QueryDisplay query={successQueryStub}>{() => <Probe />}</QueryDisplay>,
		);
		fireEvent.click(screen.getByRole('button'));
		expect(screen.getByRole('button').textContent).toBe('count:1');

		rerender(
			<QueryDisplay query={{ ...successQueryStub }}>
				{() => <Probe />}
			</QueryDisplay>,
		);
		// State survived the rerender: no remount happened.
		expect(screen.getByRole('button').textContent).toBe('count:1');
	});

	test('a custom ErrorSlot still wins over the translated default', () => {
		render(
			<QueryDisplay query={errorQuery} ErrorSlot={<span>Custom error</span>} />,
		);

		expect(screen.getByText('Custom error')).toBeTruthy();
		expect(
			screen.queryByText('An error occurred while loading data.'),
		).toBeNull();
	});

	// Issue #2043: the default error branch used to discard the real error and
	// show one generic sentence for every cause (server unreachable, 403, 404,
	// a malformed payload, the browser offline). The shared resolver must
	// extract whatever `ServerFailure` carries — at minimum its `status` and
	// `detail` — and render them through `t()` keyed off the status, while
	// keeping the generic sentence as a real fallback (not pretending to know).
	const errorResultOf = (error: unknown) => {
		errorStubQuery.setState({
			status: 'error',
			fetchStatus: 'idle',
			error: error as Error,
		});
		return observerOf(['stub-error']).getCurrentResult();
	};

	test('default error surfaces a 403 ServerFailure cause instead of the generic sentence', () => {
		const forbiddenQuery = errorResultOf(
			new ServerFailure({
				responseStatusCode: 403,
				status: 403,
				title: 'Forbidden',
				detail: 'Your profile no longer has access to this tenant.',
				translationKey: 'tenant-forbidden',
			}),
		);

		render(<QueryDisplay query={forbiddenQuery} />);

		expect(
			screen.queryByText('An error occurred while loading data.'),
		).toBeNull();
		expect(screen.getByText("You don't have access")).toBeTruthy();
		expect(
			screen.getByText('Your profile no longer has access to this tenant.'),
		).toBeTruthy();
	});

	test('default error surfaces a 404 ServerFailure cause with the not-found copy', () => {
		const notFoundQuery = errorResultOf(
			new ServerFailure({
				responseStatusCode: 404,
				status: 404,
				title: 'Not Found',
				detail: 'The resource was deleted.',
				translationKey: 'tenant-profile-not-found',
			}),
		);

		render(<QueryDisplay query={notFoundQuery} />);

		expect(
			screen.queryByText('An error occurred while loading data.'),
		).toBeNull();
		expect(screen.getByText('404 — Not Found')).toBeTruthy();
		expect(screen.getByText('Page not found')).toBeTruthy();
	});

	test('default error surfaces a 500 ServerFailure cause with the server-error copy', () => {
		const serverErrorQuery = errorResultOf(
			new ServerFailure({
				responseStatusCode: 500,
				status: 500,
				title: 'Internal Server Error',
				detail: 'Trace id: abc',
				translationKey: 'request-failed',
			}),
		);

		render(<QueryDisplay query={serverErrorQuery} />);

		expect(screen.getByText('500 — Server Error')).toBeTruthy();
		expect(screen.getByText('Internal Server Error')).toBeTruthy();
	});

	test('default error surfaces a 400 ServerFailure detail for an unhandled status', () => {
		const badRequestQuery = errorResultOf(
			new ServerFailure({
				responseStatusCode: 400,
				status: 400,
				title: 'Bad Request',
				detail: 'The request could not be understood.',
				translationKey: 'bad-request',
			}),
		);

		render(<QueryDisplay query={badRequestQuery} />);

		expect(
			screen.getByText('The request could not be understood.'),
		).toBeTruthy();
		expect(
			screen.queryByText(
				"We couldn't determine what went wrong. Try again in a moment.",
			),
		).toBeNull();
	});

	test('default error surfaces a 429 ServerFailure detail for an unhandled status', () => {
		const rateLimitedQuery = errorResultOf(
			new ServerFailure({
				responseStatusCode: 429,
				status: 429,
				title: 'Too Many Requests',
				detail: 'Please wait before trying again.',
				translationKey: 'rate-limited',
			}),
		);

		render(<QueryDisplay query={rateLimitedQuery} />);

		expect(screen.getByText('Please wait before trying again.')).toBeTruthy();
		expect(
			screen.queryByText(
				"We couldn't determine what went wrong. Try again in a moment.",
			),
		).toBeNull();
	});

	test('default error surfaces the problem title when detail is absent', () => {
		const badRequestQuery = errorResultOf(
			new ServerFailure({
				responseStatusCode: 400,
				status: 400,
				title: 'Bad Request',
				detail: '',
				translationKey: 'bad-request',
			}),
		);

		render(<QueryDisplay query={badRequestQuery} />);

		expect(
			screen.getByText('An error occurred while loading data.'),
		).toBeTruthy();
		expect(screen.getByText('Bad Request')).toBeTruthy();
	});

	// Secondary note in the issue: the loading branch carries `role="status"`
	// and an `aria-label`, the error branch used a bare `<span>`. A screen
	// reader user got an announcement when loading started and silence when
	// it failed.
	test('default error branch announces itself to assistive tech', () => {
		render(<QueryDisplay query={errorQuery} />);

		const announcement = screen.getByRole('status');
		expect(announcement.getAttribute('aria-live')).toBe('polite');
	});

	// Unknown failures still carry a useful message. The resolver must surface
	// it instead of discarding it behind the generic sentence.
	test('default error surfaces an unknown failure message when the error carries no status', () => {
		const bareErrorQuery = errorResultOf(new Error('boom'));

		render(<QueryDisplay query={bareErrorQuery} />);

		expect(screen.getByText('boom')).toBeTruthy();
	});
});
