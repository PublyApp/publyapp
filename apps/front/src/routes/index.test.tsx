/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

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

		const tabpanels = screen.getAllByRole('tabpanel', { hidden: true });
		expect(tabpanels).toHaveLength(TOUR_TAB_IDS.length * 2);
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
