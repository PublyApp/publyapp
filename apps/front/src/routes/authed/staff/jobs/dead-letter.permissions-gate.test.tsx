/**
 * @vitest-environment jsdom
 *
 * #2268: the dead-letter Requeue gate against the REAL `useStaffJobPermissions`
 * and the real list table. Only the network layer (the staff API client) is
 * faked, with a scope response that arrives late. While it is pending the
 * Requeue item is disabled with the « checking » title; once it resolves the
 * item is enabled, and a row menu opened during the wait stays open across
 * the transition.
 */
import {
	QueryClient,
	QueryClientProvider,
	type QueryClient as QueryClientType,
} from '@tanstack/react-query';
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	scope: {
		resolve: (_value: unknown) => {},
	},
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useNavigate: () => vi.fn(),
		useSearch: () => ({}),
	}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) =>
			({
				'action-permission-checking': 'Checking your permissions…',
				'action-permission-denied': 'No permission',
				'common:action-requeue': 'Requeue',
				'common:action-inspect': 'Inspect',
			})[key] ?? key,
		i18n: { language: 'en' },
	}),
}));

vi.mock('~/lib/api-client/client-manager', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/api-client/client-manager')>();
	const list = (data: unknown[]) => async () => ({
		data,
		nextCursor: null,
		totalCount: data.length,
	});
	const client = {
		auth: {
			scopeAuthData: {
				get: () =>
					new Promise((resolve) => {
						mocks.scope.resolve = resolve;
					}),
			},
		},
		staff: {
			jobs: {
				deadLetter: {
					get: list([
						{
							id: 'dl-1',
							jobType: 'SendEmailJob',
							attempts: 3,
							lastError: 'boom',
							failedAt: new Date('2026-01-01T00:00:00Z'),
						},
					]),
				},
				queue: { get: list([]) },
				systemJobs: { get: list([]) },
			},
		},
	};
	return {
		...actual,
		getClientManager: () => ({
			getOrCreateStaffClient: () => client,
			getOrCreateClient: () => client,
		}),
	};
});

import { Route } from './dead-letter';

const Page = Route.options.component as () => JSX.Element;

let queryClient: QueryClientType;

beforeEach(() => {
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
});

afterEach(() => {
	cleanup();
	document.getElementById('app-shell-page-panel')?.remove();
});

const openRowMenu = async () => {
	const trigger = await screen.findByRole('button', { name: 'SendEmailJob' });
	fireEvent.click(trigger);
	return screen.findByTestId('dead-letter-requeue-dl-1');
};

const renderPage = () =>
	render(
		<QueryClientProvider client={queryClient}>
			<div id="app-shell-page-panel" />
			<Page />
		</QueryClientProvider>,
	);

describe('dead-letter Requeue gate (#2268)', () => {
	test('disabled while the scope request is pending, enabled once it resolves, menu stays open', async () => {
		renderPage();
		const item = await openRowMenu();
		expect(item.getAttribute('aria-disabled')).toBe('true');
		expect(item.getAttribute('title')).toBe('Checking your permissions…');

		await act(async () => {
			mocks.scope.resolve({
				code: 'staff',
				isAdmin: false,
				permissions: ['staff.jobs.requeue'],
			});
		});

		const after = await screen.findByTestId('dead-letter-requeue-dl-1');
		expect(after.getAttribute('aria-disabled')).not.toBe('true');
		expect(after.getAttribute('title')).toBeNull();
	});
});
