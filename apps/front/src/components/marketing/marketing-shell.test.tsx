/** @vitest-environment jsdom */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { resetCookieConsentStoreForTests } from '~/lib/store/cookie-consent-store';

import { MarketingShell } from './marketing-shell';
import { renderMarketing } from './marketing.test-helper';

const renderShell = () =>
	renderMarketing(
		<MarketingShell pathname="/">
			<p>page body</p>
		</MarketingShell>,
	);

beforeEach(() => {
	window.localStorage.clear();
	resetCookieConsentStoreForTests();
});

afterEach(cleanup);

describe('MarketingShell composition', () => {
	test('renders the announcement bar, header, page body, social proof, CTA band and footer', async () => {
		await renderShell();

		expect(screen.getByTestId('marketing-announcement-bar')).toBeTruthy();
		expect(screen.getByTestId('marketing-header')).toBeTruthy();
		expect(screen.getByText('page body')).toBeTruthy();
		expect(screen.getByTestId('marketing-social-proof')).toBeTruthy();
		expect(screen.getByTestId('marketing-cta-band')).toBeTruthy();
		expect(screen.getByTestId('marketing-footer')).toBeTruthy();
	});

	test('the header is the only surface at chrome width; body, social proof, CTA band and footer read at reading width', async () => {
		await renderShell();

		const widthOf = (element: HTMLElement) =>
			element
				.querySelector('[data-container-width]')
				?.getAttribute('data-container-width');

		expect(widthOf(screen.getByTestId('marketing-header'))).toBe('chrome');
		expect(widthOf(screen.getByTestId('marketing-social-proof'))).toBe(
			'reading',
		);
		expect(widthOf(screen.getByTestId('marketing-cta-band'))).toBe('reading');
		expect(widthOf(screen.getByTestId('marketing-footer'))).toBe('reading');

		const main = document.querySelector('#marketing-main') as HTMLElement;
		expect(widthOf(main)).toBe('reading');
	});

	test('the chrome container carries the chrome token and the reading container the reading one', async () => {
		await renderShell();

		const chrome = screen
			.getByTestId('marketing-header')
			.querySelector('[data-container-width="chrome"]');
		const reading = screen
			.getByTestId('marketing-footer')
			.querySelector('[data-container-width="reading"]');

		expect(chrome?.className).toContain('max-w-(--publy-container-chrome)');
		expect(reading?.className).toContain('max-w-(--publy-container-reading)');
	});

	test('the header box is sized from the header-height token, not a literal 64px', async () => {
		await renderShell();

		const headerRow = screen
			.getByTestId('marketing-header')
			.querySelector('[data-container-width="chrome"]');

		expect(headerRow?.className).toContain('h-(--publy-header-height)');
	});
});

describe('MarketingShell — measured contrast decisions', () => {
	// Paired with `styles/marketing-contrast.test.ts`, which proves the muted
	// foreground measures BELOW AA on the muted surface. This half proves the
	// band's small labels do not use it — the two together are the guard.
	test('the CTA band labels use the secondary foreground, not the muted step, on the muted band', async () => {
		await renderShell();

		const band = screen.getByTestId('marketing-cta-band');
		const smallLabels = Array.from(band.querySelectorAll<HTMLElement>('p'));
		const kicker = smallLabels.find((node) =>
			node.className.includes('publy-marketing-eyebrow'),
		);
		const footnote = smallLabels.find((node) =>
			node.className.includes('publy-type-helper'),
		);

		expect(kicker?.className).toContain('text-(--publy-foreground-secondary)');
		expect(footnote?.className).toContain(
			'text-(--publy-foreground-secondary)',
		);
		expect(kicker?.className).not.toContain('text-(--publy-foreground-muted)');
		expect(footnote?.className).not.toContain(
			'text-(--publy-foreground-muted)',
		);
	});
});

describe('MarketingShell — cookie surfaces', () => {
	test('the footer control reopens the preferences drawer after a decision was already made', async () => {
		await renderShell();

		// Decide first, so the band is gone and the footer is the only way back.
		fireEvent.click(await screen.findByTestId('cookie-band-reject'));
		expect(screen.queryByTestId('cookie-consent-band')).toBeNull();

		fireEvent.click(screen.getByTestId('marketing-manage-cookies'));

		expect(await screen.findByTestId('cookie-prefs-drawer')).toBeTruthy();
	});

	test('Customize on the band opens the preferences drawer', async () => {
		await renderShell();

		fireEvent.click(await screen.findByTestId('cookie-band-customize'));

		expect(await screen.findByTestId('cookie-prefs-drawer')).toBeTruthy();
	});
});

describe('MarketingShell — mobile nav', () => {
	test('the hamburger opens the drawer, and Esc closes it', async () => {
		await renderShell();

		const toggle = screen.getByTestId('marketing-mobile-nav-toggle');
		// Closed: it must NOT claim to control an element that is not in the
		// document — the drawer is portalled and unmounted while closed, and a
		// dangling `aria-controls` is an invalid ARIA value (axe: critical).
		expect(toggle.getAttribute('aria-controls')).toBeNull();
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		const desktopTrigger = screen.getByRole('button', {
			name: /resources|ressources/i,
		});
		expect(desktopTrigger.getAttribute('aria-controls')).toBeNull();

		fireEvent.click(toggle);

		const drawer = await screen.findByTestId('marketing-mobile-nav');
		expect(drawer.getAttribute('role')).toBe('dialog');
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(
			document.getElementById(toggle.getAttribute('aria-controls') ?? ''),
		).toBe(drawer);

		fireEvent.keyDown(document, { key: 'Escape' });

		await waitFor(() =>
			expect(screen.queryByTestId('marketing-mobile-nav')).toBeNull(),
		);
	});

	test('mobile drawer close restores focus to the hamburger trigger', async () => {
		await renderShell();

		const toggle = screen.getByTestId('marketing-mobile-nav-toggle');
		toggle.focus();

		fireEvent.click(toggle);
		await waitFor(() =>
			expect(screen.getByTestId('marketing-mobile-nav')).toBeTruthy(),
		);

		fireEvent.keyDown(document, { key: 'Escape' });
		await waitFor(() =>
			expect(screen.queryByTestId('marketing-mobile-nav')).toBeNull(),
		);

		await waitFor(() => expect(document.activeElement).toBe(toggle));
	});
});

describe('MarketingShell — announcement bar', () => {
	// e2e axe caught this as a `region` violation: every top-level surface has
	// to sit inside a landmark, and the announcement is the only one that is
	// neither banner, main nor contentinfo.
	test('every top-level shell surface is inside a named landmark', async () => {
		await renderShell();

		const announcement = screen.getByTestId('marketing-announcement-bar');
		expect(announcement.tagName).toBe('ASIDE');
		expect(announcement.getAttribute('aria-label')).toBe('Announcement');

		expect(screen.getByRole('banner')).toBe(
			screen.getByTestId('marketing-header'),
		);
		expect(screen.getByRole('contentinfo')).toBe(
			screen.getByTestId('marketing-footer'),
		);
		expect(screen.getByRole('main')).toBeTruthy();
		expect(
			screen
				.getByTestId('marketing-social-proof')
				.getAttribute('aria-labelledby'),
		).toBeTruthy();
		expect(
			screen.getByTestId('marketing-cta-band').getAttribute('aria-labelledby'),
		).toBeTruthy();
		expect(
			(await screen.findByTestId('cookie-consent-band')).getAttribute('role'),
		).toBe('region');
	});

	test('dismissal persists, so a returning visitor is not shown it again', async () => {
		const first = await renderShell();

		fireEvent.click(screen.getByTestId('marketing-announcement-dismiss'));
		expect(screen.queryByTestId('marketing-announcement-bar')).toBeNull();

		first.unmount();
		await renderShell();

		await waitFor(() =>
			expect(screen.queryByTestId('marketing-announcement-bar')).toBeNull(),
		);
	});
});

describe('MarketingShell — focus restoration', () => {
	test('prefs drawer close returns focus to the launcher button', async () => {
		await renderShell();

		const launcher = screen.getByTestId('marketing-manage-cookies');
		launcher.focus();
		fireEvent.click(launcher);

		await waitFor(() =>
			expect(screen.getByTestId('cookie-prefs-drawer')).toBeTruthy(),
		);

		fireEvent.click(screen.getByTestId('cookie-prefs-save'));

		await waitFor(() =>
			expect(screen.queryByTestId('cookie-prefs-drawer')).toBeNull(),
		);
		await waitFor(() => expect(document.activeElement).toBe(launcher));
	});
});
