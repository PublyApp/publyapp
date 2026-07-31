/** @vitest-environment jsdom */
import { IconWorld } from '@tabler/icons-react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { MarketingMobileNav } from './marketing-mobile-nav';
import type { MarketingNavTrigger } from './marketing-nav';
import { renderMarketing } from './marketing.test-helper';

const TEST_TRIGGERS: readonly MarketingNavTrigger[] = [
	{
		id: 'platform',
		labelKey: 'marketing-nav-platform',
		columns: [
			{
				id: 'platform',
				titleKey: 'marketing-nav-platform',
				items: [
					{
						id: 'profiles',
						labelKey: 'marketing-nav-profiles',
						descriptionKey: 'marketing-nav-profiles-description',
						Icon: IconWorld,
						to: '/login',
					},
					{
						id: 'blog',
						labelKey: 'marketing-nav-blog',
						descriptionKey: 'marketing-nav-blog-description',
						Icon: IconWorld,
					},
				],
			},
		],
	},
];

const renderNav = async (onOpenChange = vi.fn()) => {
	const rendered = await renderMarketing(
		<>
			<button type="button" data-testid="outside-control">
				outside
			</button>
			<MarketingMobileNav
				open
				onOpenChange={onOpenChange}
				triggers={TEST_TRIGGERS}
			/>
		</>,
	);

	return { ...rendered, onOpenChange };
};

afterEach(cleanup);

describe('MarketingMobileNav', () => {
	test('opens as a dialog and moves focus inside it', async () => {
		await renderNav();

		const drawer = await screen.findByTestId('marketing-mobile-nav');
		expect(drawer.getAttribute('role')).toBe('dialog');

		await waitFor(() =>
			expect(drawer.contains(document.activeElement)).toBe(true),
		);
	});

	test('traps focus: everything outside the drawer is inert while it is open', async () => {
		await renderNav();

		const drawer = await screen.findByTestId('marketing-mobile-nav');
		await waitFor(() =>
			expect(drawer.contains(document.activeElement)).toBe(true),
		);

		// Base UI's modal dialog marks the rest of the document inert rather
		// than policing every focus event, so this asserts the mechanism that
		// actually keeps Tab inside the drawer.
		const outside = screen.getByTestId('outside-control');
		const inertAncestor = outside.closest('[inert], [aria-hidden="true"]');
		expect(inertAncestor).not.toBeNull();
	});

	test('Esc asks the shell to close it', async () => {
		const { onOpenChange } = await renderNav();

		await screen.findByTestId('marketing-mobile-nav');
		fireEvent.keyDown(document, { key: 'Escape' });

		await waitFor(() =>
			expect(onOpenChange).toHaveBeenCalledWith(false, expect.any(Object)),
		);
	});

	test('an accordion section reveals only its routed items', async () => {
		await renderNav();

		const accordion = await screen.findByRole('button', { name: 'Platform' });
		expect(accordion.getAttribute('aria-expanded')).toBe('false');

		fireEvent.click(accordion);

		expect(accordion.getAttribute('aria-expanded')).toBe('true');
		expect(screen.getByRole('link', { name: 'Profiles' })).toBeTruthy();
		expect(screen.queryByRole('link', { name: 'Blog' })).toBeNull();
	});

	test('following a link closes the drawer', async () => {
		const { onOpenChange } = await renderNav();

		fireEvent.click(await screen.findByRole('button', { name: 'Platform' }));
		fireEvent.click(screen.getByRole('link', { name: 'Profiles' }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
