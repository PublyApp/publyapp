/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	Link: ({
		children,
		to,
		...props
	}: {
		children: React.ReactNode;
		to: string;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));

const marketingFlags = vi.hoisted(() => ({
	customerLogos: false,
	socialProof: false,
}));

vi.mock('~/lib/flags', async (importOriginal) => {
	const actual = await importOriginal<typeof import('~/lib/flags')>();

	return {
		...actual,
		FEATURES: {
			...actual.FEATURES,
			get marketing() {
				return {
					...actual.FEATURES.marketing,
					...marketingFlags,
				};
			},
		},
	};
});

import { Route } from './index';

const TOUR_TAB_IDS = [
	'calendar',
	'composer',
	'approvals',
	'profiles',
	'dashboards',
] as const;

const ALWAYS_VISIBLE_MARKETING_SECTION_COUNT = 9;

const LandingPage = Route.options.component as () => ReactElement;

const renderLandingPage = () => render(<LandingPage />);

const getTourPanel = (container: HTMLElement, tabId: string) => {
	return container.querySelector(`#tour-panel-${tabId}`) as HTMLDivElement;
};

describe('marketing landing route', () => {
	beforeEach(() => {
		marketingFlags.customerLogos = false;
		marketingFlags.socialProof = false;
	});

	afterEach(() => {
		cleanup();
	});

	test('renders core landing sections and copy', () => {
		renderLandingPage();

		expect(screen.getByText('landing-hero-title')).not.toBeNull();
		expect(screen.getByText('landing-tour-title')).not.toBeNull();
		expect(screen.getByText('landing-bento-title')).not.toBeNull();
		expect(screen.getByText('landing-timeline-title')).not.toBeNull();
		expect(screen.getByText('landing-faq-title')).not.toBeNull();
	});

	test('renders all beta pricing tiers with struck-through prices and signup CTAs', () => {
		const { container } = renderLandingPage();

		expect(screen.getByTestId('landing-pricing')).not.toBeNull();
		expect(
			screen.getByRole('heading', { name: 'landing-pricing-title' }),
		).not.toBeNull();

		for (const tier of ['studio', 'agency', 'network']) {
			expect(screen.getByTestId(`landing-pricing-${tier}`)).not.toBeNull();
			expect(
				screen
					.getByRole('link', { name: `landing-pricing-${tier}-cta` })
					.getAttribute('href'),
			).toBe('/signup');
		}

		for (const priceKey of [
			'landing-pricing-studio-price',
			'landing-pricing-agency-price',
			'landing-pricing-network-price',
		]) {
			expect(screen.getByText(priceKey)).toHaveProperty('tagName', 'DEL');
		}

		expect(screen.getAllByText('landing-pricing-beta-note')).toHaveLength(3);
		expect(container.querySelectorAll('del')).toHaveLength(3);
	});

	test('keeps the trial planning note inside the timeline section', () => {
		renderLandingPage();

		const note = screen.getByText('landing-trial-plan-note');
		const timelineSection = screen
			.getByText('landing-timeline-title')
			.closest('section');

		expect(timelineSection?.contains(note)).toBe(true);
	});

	test('keeps optional marketing bands behind feature flags', () => {
		const { container } = renderLandingPage();

		expect(container.querySelectorAll('section')).toHaveLength(
			ALWAYS_VISIBLE_MARKETING_SECTION_COUNT,
		);
	});

	test('does not render customer logos when the flag is off', () => {
		marketingFlags.customerLogos = false;
		renderLandingPage();

		expect(screen.queryByTestId('landing-customer-logos')).toBeNull();
	});

	test('renders all supplied customer logos when the flag is on', () => {
		marketingFlags.customerLogos = true;
		renderLandingPage();

		expect(screen.getByTestId('landing-customer-logos')).not.toBeNull();
		expect(
			screen.getByRole('heading', { name: 'landing-customer-logos-title' }),
		).not.toBeNull();

		for (const key of [
			'landing-customer-logo-northbeam',
			'landing-customer-logo-halcyon',
			'landing-customer-logo-fieldnote',
			'landing-customer-logo-studio-mera',
			'landing-customer-logo-orrery',
			'landing-customer-logo-caldera',
		]) {
			expect(screen.getByText(key)).not.toBeNull();
		}
	});

	test('does not render social proof when the flag is off', () => {
		marketingFlags.socialProof = false;
		renderLandingPage();

		expect(screen.queryByTestId('landing-social-proof')).toBeNull();
	});

	test('renders all social-proof stats when the flag is on', () => {
		marketingFlags.socialProof = true;
		renderLandingPage();

		expect(screen.getByTestId('landing-social-proof')).not.toBeNull();
		for (const key of [
			'landing-social-proof-rating',
			'landing-social-proof-brands',
			'landing-social-proof-setup',
		]) {
			expect(screen.getByText(key)).not.toBeNull();
		}
	});

	test('scopes hero and closing CTAs to their sections and preserves destinations', () => {
		renderLandingPage();

		const hero = screen.getByTestId('landing-hero-title').closest('section');
		const closing = screen
			.getByText('landing-closing-title')
			.closest('section');

		expect(hero?.querySelector('a[href="/signup"]')).not.toBeNull();
		expect(hero?.querySelector('a[href="#product-window"]')).not.toBeNull();
		expect(closing?.querySelector('a[href="/signup"]')).not.toBeNull();
		expect(closing?.querySelector('a[href="/login"]')).not.toBeNull();
	});

	test('keeps the landing anchors wired to real sections', () => {
		const { container } = renderLandingPage();

		for (const id of ['product-window', 'pricing', 'faq']) {
			expect(container.querySelector(`#${id}`)).not.toBeNull();
		}
	});

	test('implements a complete product-tour tablist', () => {
		const { container } = renderLandingPage();

		const tablist = screen.getByRole('tablist', {
			name: 'landing-tour-tablist-aria',
		});
		expect(tablist).not.toBeNull();

		const tabs = screen.getAllByRole('tab');
		expect(tabs).toHaveLength(TOUR_TAB_IDS.length);

		for (const [index, tab] of tabs.entries()) {
			expect(tab.getAttribute('id')).toBe(`tour-tab-${TOUR_TAB_IDS[index]}`);
			expect(tab.getAttribute('aria-controls')).toBe(
				`tour-panel-${TOUR_TAB_IDS[index]}`,
			);
			expect(tab.getAttribute('aria-selected')).toBe(
				index === 0 ? 'true' : 'false',
			);
			expect(tab.getAttribute('tabindex')).toBe(index === 0 ? '0' : '-1');
		}

		for (const [index, id] of TOUR_TAB_IDS.entries()) {
			const panel = getTourPanel(container, id);
			expect(panel.getAttribute('role')).toBe('tabpanel');
			expect(panel.getAttribute('aria-labelledby')).toBe(`tour-tab-${id}`);
			expect(panel).toHaveProperty('hidden', index !== 0);
		}

		expect(screen.getAllByRole('tabpanel', { hidden: true })).toHaveLength(
			TOUR_TAB_IDS.length,
		);
	});

	test('changes active tab and panel on click', () => {
		const { container } = renderLandingPage();

		const composerTab = screen.getAllByRole('tab')[1];
		fireEvent.click(composerTab);

		expect(composerTab.getAttribute('aria-selected')).toBe('true');
		expect(composerTab.getAttribute('tabindex')).toBe('0');
		expect(getTourPanel(container, 'calendar')).toHaveProperty('hidden', true);
		expect(getTourPanel(container, 'composer')).toHaveProperty('hidden', false);
	});

	test('moves focus with desktop arrow, Home, and End navigation', () => {
		renderLandingPage();

		const tabs = screen.getAllByRole('tab');
		tabs[0].focus();
		fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
		expect(document.activeElement).toBe(tabs[1]);

		fireEvent.keyDown(tabs[1], { key: 'ArrowLeft' });
		expect(document.activeElement).toBe(tabs[0]);

		fireEvent.keyDown(tabs[0], { key: 'End' });
		expect(document.activeElement).toBe(tabs[4]);

		fireEvent.keyDown(tabs[4], { key: 'Home' });
		expect(document.activeElement).toBe(tabs[0]);
	});

	test('keeps exactly one desktop text panel visible at a time', () => {
		const { container } = renderLandingPage();

		const expectOnlyOneVisiblePanel = () => {
			const visiblePanels = TOUR_TAB_IDS.filter(
				(id) => !getTourPanel(container, id).hidden,
			);
			expect(visiblePanels).toHaveLength(1);
		};

		expectOnlyOneVisiblePanel();
		fireEvent.click(screen.getAllByRole('tab')[4]);
		expectOnlyOneVisiblePanel();
		expect(getTourPanel(container, 'dashboards')).toHaveProperty(
			'hidden',
			false,
		);
	});

	test('hides collapsed mobile tour panels from keyboard and assistive technology', () => {
		const { container } = renderLandingPage();

		for (const id of TOUR_TAB_IDS) {
			const panel = container.querySelector(
				`#tour-accordion-panel-${id}`,
			) as HTMLDivElement;
			if (id === 'calendar') {
				expect(panel.hidden).toBe(false);
				expect(panel.getAttribute('aria-hidden')).toBe('false');
			} else {
				expect(panel.hidden).toBe(true);
				expect(panel.getAttribute('aria-hidden')).toBe('true');
			}
		}
	});
});
