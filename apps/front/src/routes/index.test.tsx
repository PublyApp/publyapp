/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
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

vi.mock('~/lib/flags', () => ({
	get FEATURES() {
		return { marketing: marketingFlags };
	},
}));

import { IndexRoute } from './index';

const TOUR_TAB_IDS = [
	'calendar',
	'composer',
	'approvals',
	'profiles',
	'dashboards',
] as const;

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
		render(<IndexRoute />);

		expect(screen.getByText('landing-hero-title')).not.toBeNull();
		expect(screen.getByText('landing-tour-title')).not.toBeNull();
		expect(screen.getByText('landing-bento-title')).not.toBeNull();
		expect(screen.getByText('landing-timeline-title')).not.toBeNull();
		expect(screen.getByText('landing-faq-title')).not.toBeNull();
	});

	test('renders all beta pricing tiers with struck-through prices and signup CTAs', () => {
		const { container } = render(<IndexRoute />);

		expect(screen.getByTestId('landing-pricing')).not.toBeNull();
		expect(
			screen.getByRole('heading', { name: 'landing-pricing-title' }),
		).not.toBeNull();

		for (const tier of ['studio', 'agency', 'network']) {
			expect(screen.getByTestId(`landing-pricing-${tier}`)).not.toBeNull();
			expect(
				screen
					.getByRole('link', {
						name: `landing-pricing-${tier}-cta`,
					})
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

	test('does not render customer logos when the flag is off', () => {
		marketingFlags.customerLogos = false;
		render(<IndexRoute />);

		expect(screen.queryByTestId('landing-customer-logos')).toBeNull();
	});

	test('renders all supplied customer logos when the flag is on', () => {
		marketingFlags.customerLogos = true;
		render(<IndexRoute />);

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
		render(<IndexRoute />);

		expect(screen.queryByTestId('landing-social-proof')).toBeNull();
	});

	test('renders all social-proof stats when the flag is on', () => {
		marketingFlags.socialProof = true;
		render(<IndexRoute />);

		expect(screen.getByTestId('landing-social-proof')).not.toBeNull();
		for (const key of [
			'landing-social-proof-rating',
			'landing-social-proof-brands',
			'landing-social-proof-setup',
		]) {
			expect(screen.getByText(key)).not.toBeNull();
		}
	});

	test('keeps the required navigation targets', () => {
		render(<IndexRoute />);

		expect(
			screen
				.getByRole('link', { name: 'landing-hero-primary-cta' })
				.getAttribute('href'),
		).toBe('/signup');
		expect(
			screen
				.getByRole('link', { name: 'landing-hero-secondary-cta' })
				.getAttribute('href'),
		).toBe('#product-tour');
		expect(
			screen
				.getByRole('link', { name: 'landing-closing-primary-cta' })
				.getAttribute('href'),
		).toBe('/signup');
		expect(
			screen
				.getByRole('link', { name: 'landing-closing-secondary-cta' })
				.getAttribute('href'),
		).toBe('#product-tour');
	});

	test('implements a complete product-tour tablist', () => {
		const { container } = render(<IndexRoute />);

		const tablist = screen.getByRole('tablist', {
			name: 'landing-tour-tablist-aria',
		});
		expect(tablist).not.toBeNull();

		const tabs = screen.getAllByRole('tab');
		expect(tabs).toHaveLength(TOUR_TAB_IDS.length);

		tabs.forEach((tab, index) => {
			expect(tab.getAttribute('id')).toBe(`tour-tab-${TOUR_TAB_IDS[index]}`);
			expect(tab.getAttribute('aria-controls')).toBe(
				`tour-panel-${TOUR_TAB_IDS[index]}`,
			);
			expect(tab.getAttribute('aria-selected')).toBe(
				index === 0 ? 'true' : 'false',
			);
			expect(tab.getAttribute('tabindex')).toBe(index === 0 ? '0' : '-1');
		});

		TOUR_TAB_IDS.forEach((id, index) => {
			const panel = getTourPanel(container, id);
			expect(panel.getAttribute('role')).toBe('tabpanel');
			expect(panel.getAttribute('aria-labelledby')).toBe(`tour-tab-${id}`);
			expect(panel).toHaveProperty('hidden', index !== 0);
		});

		// Exactly one panel per tab. The screenshot plate beside the copy toggles
		// with the active tab but is deliberately NOT a second `tabpanel`: a tab
		// owns one panel, and `aria-controls` above names the copy panel. Asserting
		// two per tab would pin an orphan region no tab controls.
		const tabpanels = screen.getAllByRole('tabpanel', { hidden: true });
		expect(tabpanels).toHaveLength(TOUR_TAB_IDS.length);
	});

	test('changes active tab and panel on click', () => {
		const { container } = render(<IndexRoute />);

		const composerTab = screen.getAllByRole('tab')[1];
		fireEvent.click(composerTab);

		expect(composerTab.getAttribute('aria-selected')).toBe('true');
		expect(composerTab.getAttribute('tabindex')).toBe('0');

		const calendarPanel = getTourPanel(container, 'calendar');
		const composerPanel = getTourPanel(container, 'composer');
		expect(calendarPanel).toHaveProperty('hidden', true);
		expect(composerPanel).toHaveProperty('hidden', false);
	});

	test('supports roving tab index and left/right/home/end movement', () => {
		render(<IndexRoute />);

		fireEvent.keyDown(screen.getAllByRole('tab')[0], { key: 'ArrowRight' });
		expect(screen.getAllByRole('tab')[1].getAttribute('aria-selected')).toBe(
			'true',
		);
		expect(screen.getAllByRole('tab')[1].getAttribute('tabindex')).toBe('0');

		fireEvent.keyDown(screen.getAllByRole('tab')[1], { key: 'ArrowLeft' });
		expect(screen.getAllByRole('tab')[0].getAttribute('aria-selected')).toBe(
			'true',
		);

		fireEvent.keyDown(screen.getAllByRole('tab')[0], { key: 'End' });
		expect(screen.getAllByRole('tab')[4].getAttribute('aria-selected')).toBe(
			'true',
		);
		expect(screen.getAllByRole('tab')[4].getAttribute('tabindex')).toBe('0');

		fireEvent.keyDown(screen.getAllByRole('tab')[4], { key: 'Home' });
		expect(screen.getAllByRole('tab')[0].getAttribute('aria-selected')).toBe(
			'true',
		);
		expect(screen.getAllByRole('tab')[0].getAttribute('tabindex')).toBe('0');
	});

	test('keeps exactly one text panel visible at a time', () => {
		const { container } = render(<IndexRoute />);

		const expectOnlyOneVisiblePanel = () => {
			const visiblePanels = TOUR_TAB_IDS.filter(
				(id) => !getTourPanel(container, id).hidden,
			);
			expect(visiblePanels).toHaveLength(1);
		};

		expectOnlyOneVisiblePanel();
		expect(getTourPanel(container, 'calendar')).toHaveProperty('hidden', false);
		expect(getTourPanel(container, 'composer')).toHaveProperty('hidden', true);

		fireEvent.click(screen.getAllByRole('tab')[4]);
		expectOnlyOneVisiblePanel();
		expect(getTourPanel(container, 'dashboards')).toHaveProperty(
			'hidden',
			false,
		);
		expect(getTourPanel(container, 'calendar')).toHaveProperty('hidden', true);
	});
});
