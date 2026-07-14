/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	createRootRouteWithContext: () => () => ({}),
	HeadContent: () => null,
	Outlet: () => null,
	Scripts: () => null,
	useLocation: (options?: { select?: (location: unknown) => unknown }) => {
		const location = { pathname: '/some-path', searchStr: '' };
		return options?.select ? options.select(location) : location;
	},
	useRouter: () => ({ invalidate: vi.fn() }),
	Link: ({ children, to, ...props }: { children?: ReactNode; to: string }) =>
		createElement('a', { href: to, ...props }, children),
}));

vi.mock('react-i18next', async () => {
	const actual =
		await vi.importActual<typeof import('react-i18next')>('react-i18next');

	return {
		...actual,
		useTranslation: () => ({ t: (key: string) => key }),
	};
});

import { RootErrorBoundary } from './__root';

// The root `errorComponent`/`notFoundComponent` REPLACE `RootComponent`'s
// whole subtree — there is no other `<main>` on the page — so every branch
// must render its own `role="main"` landmark (embedded={false}), or a 403/
// 404/500 at the root renders as a landmark-less div in an otherwise empty
// <body> (r3-shell-F4).
describe('RootErrorBoundary renders a <main> landmark at the root (r3-shell-F4)', () => {
	afterEach(() => {
		cleanup();
	});

	test('403', () => {
		render(<RootErrorBoundary error={{ status: 403 }} reset={vi.fn()} />);
		expect(screen.getByRole('main')).toBeTruthy();
	});

	test('404', () => {
		render(<RootErrorBoundary error={{ status: 404 }} reset={vi.fn()} />);
		expect(screen.getByRole('main')).toBeTruthy();
	});

	test('unhandled/500', () => {
		render(<RootErrorBoundary error={new Error('boom')} reset={vi.fn()} />);
		expect(screen.getByRole('main')).toBeTruthy();
	});
});
