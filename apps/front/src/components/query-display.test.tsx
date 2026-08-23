/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import QueryDisplay from './query-display';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				loading: 'Loading…',
				'query-display-error-default': 'An error occurred while loading data.',
			};
			return labels[key] ?? key;
		},
	}),
}));

afterEach(cleanup);

const pendingQuery = {
	isPending: true,
	isLoading: true,
	isFetching: true,
	isError: false,
} as never;

const successQueryStub = {
	isPending: false,
	isLoading: false,
	isFetching: false,
	isError: false,
	data: 'payload',
};

const errorQuery = {
	isPending: false,
	isLoading: false,
	isFetching: false,
	isError: true,
	error: new Error('boom'),
} as never;

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

		expect(
			screen.getByText('An error occurred while loading data.'),
		).toBeTruthy();
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

		const firstQuery = { ...successQueryStub } as never;
		const { rerender } = render(
			<QueryDisplay query={firstQuery}>
				{({ data }: { data: string }) => <Probe key={data} />}
			</QueryDisplay>,
		);
		expect(mounts).toBe(1);

		// Same data, fresh query object — as a background refetch would produce.
		rerender(
			<QueryDisplay query={{ ...successQueryStub } as never}>
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
			<QueryDisplay query={successQueryStub as never}>
				{() => <Probe />}
			</QueryDisplay>,
		);
		fireEvent.click(screen.getByRole('button'));
		expect(screen.getByRole('button').textContent).toBe('count:1');

		rerender(
			<QueryDisplay query={{ ...successQueryStub } as never}>
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
});
