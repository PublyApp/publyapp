import { IconWorld } from '@tabler/icons-react';
/** @vitest-environment jsdom */
import {
	act,
	cleanup,
	fireEvent,
	screen,
	waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	MARKETING_NAV_INTENT_CLOSE_DELAY_MS,
	MARKETING_NAV_INTENT_OPEN_DELAY_MS,
	MarketingHeader,
} from './marketing-header';
import {
	MARKETING_NAV_TRIGGERS,
	type MarketingNavTrigger,
	routedColumns,
} from './marketing-nav';
import { renderMarketing } from './marketing.test-helper';

/**
 * The nav model shipped in production is deliberately sparse: every marketing
 * page except the landing page is unrouted, so most entries are filtered out
 * (see marketing-nav.ts). These triggers exercise the mega-menu machinery
 * with the SAME component and the SAME data shape — the injected model is the
 * component's own public contract, not a stand-in for it — while the
 * production model is asserted separately (production-model tests below).
 */
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
						id: 'tenants',
						labelKey: 'marketing-nav-tenants',
						descriptionKey: 'marketing-nav-tenants-description',
						Icon: IconWorld,
						to: '/signup',
					},
				],
			},
		],
	},
	{
		id: 'pricing',
		labelKey: 'marketing-nav-pricing',
		to: '/',
		hash: 'pricing',
		columns: [],
	},
	{
		id: 'resources',
		labelKey: 'marketing-nav-resources',
		columns: [
			{
				id: 'resources',
				titleKey: 'marketing-nav-resources',
				// Nothing routed: this whole trigger must disappear.
				items: [
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

const renderHeader = (locale: 'en' | 'fr' = 'en') =>
	renderMarketing(
		<MarketingHeader
			pathname="/"
			onOpenMobileNav={vi.fn()}
			triggers={TEST_TRIGGERS}
		/>,
		{ locale },
	);

const platformTrigger = () =>
	screen.getByRole('button', { name: /platform|plateforme/i });

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('MarketingHeader mega menu — keyboard', () => {
	test('opens on Enter and exposes the panel it controls', async () => {
		await renderHeader();

		const trigger = platformTrigger();
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByTestId('marketing-mega-panel')).toBeNull();

		fireEvent.click(trigger);

		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		const panel = screen.getByTestId('marketing-mega-panel');
		expect(panel.getAttribute('id')).toBe(
			trigger.getAttribute('aria-controls'),
		);
		expect(panel.getAttribute('aria-labelledby')).toBe(trigger.id);
	});

	test('ArrowDown opens the panel and moves focus onto its first link', async () => {
		await renderHeader();

		const trigger = platformTrigger();
		trigger.focus();
		fireEvent.keyDown(trigger, { key: 'ArrowDown' });

		const panel = screen.getByTestId('marketing-mega-panel');
		const firstLink = panel.querySelectorAll('[data-mega-link]')[0];

		await waitFor(() => expect(document.activeElement).toBe(firstLink));
	});

	test('Escape closes the panel and returns focus to its trigger', async () => {
		await renderHeader();

		const trigger = platformTrigger();
		fireEvent.click(trigger);
		const panel = screen.getByTestId('marketing-mega-panel');
		const firstLink =
			panel.querySelector<HTMLAnchorElement>('[data-mega-link]');
		firstLink?.focus();

		fireEvent.keyDown(firstLink as HTMLAnchorElement, { key: 'Escape' });

		expect(screen.queryByTestId('marketing-mega-panel')).toBeNull();
		expect(document.activeElement).toBe(platformTrigger());
	});

	test('the panel is the trigger’s next focusable sibling, so Tab enters it', async () => {
		await renderHeader();

		const trigger = platformTrigger();
		fireEvent.click(trigger);

		const focusables = Array.from(
			document.querySelectorAll<HTMLElement>('a[href], button'),
		);
		const triggerIndex = focusables.indexOf(trigger);
		const firstPanelLink = screen
			.getByTestId('marketing-mega-panel')
			.querySelector<HTMLAnchorElement>('[data-mega-link]');

		expect(focusables[triggerIndex + 1]).toBe(firstPanelLink);
	});
});

describe('MarketingHeader mega menu — hover intent', () => {
	test('waits out the open delay before opening, and the close delay before closing', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		await renderHeader();

		const trigger = platformTrigger();
		// React synthesises onMouseEnter/onMouseLeave from mouseover/mouseout,
		// so the bubbling events are what the component actually listens to.
		fireEvent.mouseOver(trigger.parentElement as HTMLElement);

		act(() => {
			vi.advanceTimersByTime(MARKETING_NAV_INTENT_OPEN_DELAY_MS - 1);
		});
		expect(screen.queryByTestId('marketing-mega-panel')).toBeNull();

		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(screen.getByTestId('marketing-mega-panel')).toBeTruthy();

		fireEvent.mouseOut(screen.getByTestId('marketing-mega-panel'));
		act(() => {
			vi.advanceTimersByTime(MARKETING_NAV_INTENT_CLOSE_DELAY_MS - 1);
		});
		expect(screen.getByTestId('marketing-mega-panel')).toBeTruthy();

		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(screen.queryByTestId('marketing-mega-panel')).toBeNull();
	});

	test('a pointer press outside the nav closes an open panel', async () => {
		await renderHeader();

		fireEvent.click(platformTrigger());
		expect(screen.getByTestId('marketing-mega-panel')).toBeTruthy();

		fireEvent.pointerDown(document.body);

		expect(screen.queryByTestId('marketing-mega-panel')).toBeNull();
	});

	test('Escape closes a hover-opened panel without moving focus', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		await renderHeader();

		const trigger = platformTrigger();
		fireEvent.mouseOver(trigger.parentElement as HTMLElement);

		act(() => {
			vi.advanceTimersByTime(MARKETING_NAV_INTENT_OPEN_DELAY_MS);
		});
		expect(screen.getByTestId('marketing-mega-panel')).toBeTruthy();

		// Hover open does not transfer focus to the panel. Repro checks
		// that a document-level Escape listener closes it in that case.
		document.body.focus();
		fireEvent.keyDown(document, { key: 'Escape' });

		expect(screen.queryByTestId('marketing-mega-panel')).toBeNull();

		vi.useRealTimers();
	});
});

describe('MarketingHeader — no dead ends', () => {
	test('a trigger whose mega items are all unrouted is not rendered at all', async () => {
		await renderHeader();

		expect(screen.queryByRole('button', { name: /resources/i })).toBeNull();
		expect(screen.queryByRole('link', { name: /resources/i })).toBeNull();
		// …and its unrouted child never appears either.
		expect(screen.queryByText('Blog')).toBeNull();
	});

	test('a trigger with no mega items but its own route degrades to a plain link', async () => {
		await renderHeader();

		const pricing = screen.getByRole('link', { name: 'Pricing' });
		expect(pricing.getAttribute('href')).toBe('/#pricing');
		expect(pricing.getAttribute('aria-expanded')).toBeNull();
	});

	test('every rendered destination is an href the real router built, not a raw string', async () => {
		const { router } = await renderHeader();

		const hrefs = Array.from(
			document.querySelectorAll<HTMLAnchorElement>('a[href]'),
		).map((anchor) => anchor.getAttribute('href') ?? '');

		expect(hrefs.length).toBeGreaterThan(0);
		for (const href of hrefs) {
			const pathOnly = href.split('#')[0];
			// `matchRoutes` is the router's own resolution: an href no route
			// matches comes back with only the root match, which is how a dead
			// link would show up here.
			const matches = router.matchRoutes(pathOnly);
			expect(matches.length).toBeGreaterThan(1);
		}
	});
});

describe('MarketingHeader — production nav model', () => {
	test('never declares a mega item or trigger pointing at an unrouted path', () => {
		for (const trigger of MARKETING_NAV_TRIGGERS) {
			for (const column of routedColumns(trigger.columns)) {
				for (const item of column.items) {
					expect(item.to).toBeDefined();
				}
			}
		}
	});

	test('renders translated copy in French, not the English literal', async () => {
		await renderHeader('fr');

		expect(
			screen.getAllByRole('link', { name: "S'inscrire gratuitement" }).length,
		).toBeGreaterThan(0);
		expect(screen.queryByRole('link', { name: 'Sign up free' })).toBeNull();
		expect(screen.getByRole('link', { name: 'Tarifs' })).toBeTruthy();
	});
});
