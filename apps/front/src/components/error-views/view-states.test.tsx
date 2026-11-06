/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ServerFailure } from '~/lib/server/server-failure';

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('@tanstack/react-router')>();

	return {
		...actual,
		Link: ({ children, ...props }: React.ComponentProps<'a'>) => (
			<a {...props}>{children}</a>
		),
		useRouter: () => ({ invalidate: vi.fn() }),
	};
});

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key.replace(/^common:/, ''),
	}),
}));

import { AppErrorView } from './AppErrorView';
import { View403 } from './View403';
import { View404 } from './View404';

afterEach(cleanup);

const retryAction = () =>
	screen.getByText('retry').closest('button') as HTMLButtonElement;
const backAction = () =>
	screen.getByText('go-to-home').closest('a') as HTMLAnchorElement;

describe('ShopKart OS full-page error actions', () => {
	test('404 offers the retry primary then the outline back-home, in that order', () => {
		render(<View404 />);

		const retry = retryAction();
		const back = backAction();
		expect(
			retry.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(retry.className).toContain('bg-primary');
		expect(back.className).toContain('bg-background');
		expect(retry.querySelector('.tabler-icon-refresh')).not.toBeNull();
		expect(back.querySelector('.tabler-icon-arrow-left')).not.toBeNull();
	});

	test('403 keeps the one tone rule: back-home is primary and there is no retry', () => {
		render(<View403 />);

		expect(backAction().className).toContain('bg-primary');
		expect(screen.queryByText('retry')).toBeNull();
	});
});

describe('no eyebrow, raw cause folded', () => {
	test('the code never renders as a visible line above the title', () => {
		render(
			<AppErrorView
				icon={<span />}
				code="500 — Erreur serveur"
				title="Un problème est survenu"
				testId="error"
			/>,
		);

		expect(screen.getByTestId('error').textContent).not.toContain('500 —');
		expect(screen.queryByText(/Erreur serveur/)).toBeNull();
	});

	test('the actions stack under sm and never force a nowrap row on a phone', () => {
		render(<View404 />);

		const wrapper = retryAction().parentElement;
		expect(wrapper?.className).toContain('flex-col');
		expect(wrapper?.className).toContain('sm:flex-row');
		expect(wrapper?.className).not.toContain('flex-nowrap');
	});

	test('a 500 problem response renders no technical details and no raw status', () => {
		const error = new ServerFailure({
			responseStatusCode: 500,
			status: 500,
			title: 'Internal Server Error',
			detail: 'The request failed.',
			translationKey: 'request-failed',
			traceId: 'trace-123',
		});
		render(
			<AppErrorView
				icon={<span />}
				title="Un problème est survenu"
				error={error}
				testId="error"
			/>,
		);

		const root = screen.getByTestId('error');
		// No folded disclosure at all — not even a collapsed one.
		expect(root.querySelector('details')).toBeNull();
		expect(root.querySelector('pre')).toBeNull();
		expect(
			screen.queryByText(/Détails techniques|Technical details/),
		).toBeNull();
		// The raw cause stays out of the UI: no status, problem title/detail
		// or request id. The human sentence is the only thing shown.
		expect(root.textContent).not.toMatch(/HTTP \d{3}/);
		expect(root.textContent).not.toContain('Internal Server Error');
		expect(root.textContent).not.toContain('trace-123');
		expect(root.textContent).toContain('error-500-description');
	});
});
