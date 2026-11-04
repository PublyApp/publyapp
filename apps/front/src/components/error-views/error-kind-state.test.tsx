/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

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

import { ErrorKindState } from './error-kind-state';

afterEach(cleanup);

type Expected = {
	kind: 'offline' | 'not_found' | 'forbidden' | 'server' | 'unknown';
	icon: string;
	tone: string;
	role: 'status' | 'alert';
	links: number;
	buttons: number;
	details: boolean;
};

const CASES: Expected[] = [
	{
		kind: 'offline',
		icon: 'wifi-off',
		tone: 'info',
		role: 'status',
		links: 1,
		buttons: 1,
		details: true,
	},
	{
		kind: 'not_found',
		icon: 'zoom-question',
		tone: 'neutral',
		role: 'alert',
		links: 1,
		buttons: 1,
		details: false,
	},
	{
		kind: 'forbidden',
		icon: 'lock',
		tone: 'warning',
		role: 'alert',
		links: 1,
		buttons: 0,
		details: false,
	},
	{
		kind: 'server',
		icon: 'server-off',
		tone: 'danger',
		role: 'alert',
		links: 1,
		buttons: 1,
		details: true,
	},
	{
		kind: 'unknown',
		icon: 'alert-triangle',
		tone: 'danger',
		role: 'alert',
		links: 1,
		buttons: 1,
		details: true,
	},
];

describe('ErrorKindState — ShopKart per-kind mapping', () => {
	test.each(CASES)(
		'$kind uses $icon, tone $tone, role $role, $links link(s), $buttons button(s), details $details',
		({ kind, icon, tone, role, links, buttons, details }) => {
			render(
				<ErrorKindState
					scale="page"
					kind={kind}
					details="raw cause"
					testId="state"
				/>,
			);

			const root = screen.getByTestId('state');
			expect(root.getAttribute('role')).toBe(role);
			expect(root.getAttribute('data-presentation')).toBe('status');
			expect(root.querySelector('.publy-status-ring')).not.toBeNull();
			expect(root.querySelector('.publy-empty-ring')).toBeNull();
			expect(
				root.querySelector('.publy-state-icon')?.getAttribute('data-tone'),
			).toBe(tone);
			expect(root.querySelector(`svg.tabler-icon-${icon}`)).not.toBeNull();
			expect(within(root).queryAllByRole('link')).toHaveLength(links);
			expect(within(root).queryAllByRole('button')).toHaveLength(buttons);
			expect(root.querySelector('details') !== null).toBe(details);
		},
	);

	test('forbidden is exactly one action: the primary back-home link', () => {
		render(<ErrorKindState scale="page" kind="forbidden" testId="state" />);

		const root = screen.getByTestId('state');
		const links = within(root).getAllByRole('link');
		expect(links).toHaveLength(1);
		expect(links[0].className).toContain('bg-primary');
		expect(within(root).queryByRole('button')).toBeNull();
	});
});

describe('ErrorKindState — inline panel', () => {
	test('keeps the sentence and only Réessayer, never the empty pictogram', () => {
		render(
			<ErrorKindState
				scale="inline"
				panel
				kind="not_found"
				details="raw cause"
				testId="panel"
			/>,
		);

		const root = screen.getByTestId('panel');
		expect(screen.getByText('not-found-sentence')).toBeTruthy();
		expect(root.getAttribute('data-presentation')).toBe('status');
		expect(root.querySelector('.publy-empty-ring')).toBeNull();
		expect(within(root).getAllByRole('button')).toHaveLength(1);
		expect(within(root).queryAllByRole('link')).toHaveLength(0);
	});
});
