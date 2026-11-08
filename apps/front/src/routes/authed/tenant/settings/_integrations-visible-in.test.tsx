/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { useTenantProjectsQuery } from '~/lib/query/tenant-projects';

import { IntegrationsVisibleIn } from './_integrations-visible-in';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: { names?: string }) =>
			options?.names ? `${key}: ${options.names}` : key,
	}),
}));

afterEach(cleanup);

const widenFake = <T,>(value: unknown): T => value as T;

/** A partial query fake: the component only reads the state flags and data. */
const queryOf = (state: {
	isPending?: boolean;
	isError?: boolean;
	data?: unknown;
}) =>
	widenFake<ReturnType<typeof useTenantProjectsQuery>>({
		isPending: state.isPending ?? false,
		isLoading: false,
		isFetching: false,
		isError: state.isError ?? false,
		error: state.isError ? new Error('boom') : null,
		data: state.data,
		refetch: vi.fn(),
	});

describe('IntegrationsVisibleIn', () => {
	// Review H #4: the raw-id fallback is the component's documented contract,
	// so a first-load failure must not blank the cell.
	test('falls back to the raw project ids when the projects query fails', () => {
		render(
			<IntegrationsVisibleIn
				projectIds={['p1', 'p2']}
				query={queryOf({ isError: true })}
			/>,
		);

		expect(screen.getByText('visible-in-projects: p1, p2')).toBeTruthy();
	});

	test('falls back to the raw project ids while the projects query loads', () => {
		render(
			<IntegrationsVisibleIn
				projectIds={['p1']}
				query={queryOf({ isPending: true })}
			/>,
		);

		expect(screen.getByText('visible-in-projects: p1')).toBeTruthy();
	});

	test('names the projects when the query answers', () => {
		render(
			<IntegrationsVisibleIn
				projectIds={['p1']}
				query={queryOf({ data: { items: [{ id: 'p1', name: 'Acme' }] } })}
			/>,
		);

		expect(screen.getByText('visible-in-projects: Acme')).toBeTruthy();
	});
});
