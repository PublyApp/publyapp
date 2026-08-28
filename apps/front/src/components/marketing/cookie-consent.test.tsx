/** @vitest-environment jsdom */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	COOKIE_CONSENT_POLICY_VERSION,
	COOKIE_CONSENT_STORAGE_KEY,
	resetCookieConsentStoreForTests,
	useCookieConsentStore,
} from '~/lib/store/cookie-consent-store';

import { CookieConsentBand } from './cookie-consent-band';
import { CookiePrefsDrawer } from './cookie-prefs-drawer';
import { renderMarketing } from './marketing.test-helper';

const readStored = () => {
	const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
	if (raw === null) return null;
	return JSON.parse(raw);
};

const storeDecision = (
	consent: Partial<Record<'functional' | 'analytics' | 'marketing', boolean>>,
	version?: string,
) => {
	window.localStorage.setItem(
		COOKIE_CONSENT_STORAGE_KEY,
		JSON.stringify({
			version: version ?? COOKIE_CONSENT_POLICY_VERSION,
			consent,
		}),
	);
};

beforeEach(() => {
	window.localStorage.clear();
	resetCookieConsentStoreForTests();
});

afterEach(cleanup);

describe('CookieConsentBand', () => {
	test('asks when there is no stored decision', async () => {
		await renderMarketing(<CookieConsentBand onCustomize={vi.fn()} />);

		expect(await screen.findByTestId('cookie-consent-band')).toBeTruthy();
	});

	test('stays hidden once a decision is stored', async () => {
		storeDecision({ functional: true, analytics: false, marketing: false });
		await renderMarketing(<CookieConsentBand onCustomize={vi.fn()} />);

		await waitFor(() =>
			expect(useCookieConsentStore.getState().isHydrated).toBe(true),
		);
		expect(screen.queryByTestId('cookie-consent-band')).toBeNull();
	});

	test('Accept all persists every category and dismisses the band', async () => {
		await renderMarketing(<CookieConsentBand onCustomize={vi.fn()} />);

		fireEvent.click(await screen.findByTestId('cookie-band-accept'));

		expect(readStored()).toEqual({
			version: COOKIE_CONSENT_POLICY_VERSION,
			consent: { functional: true, analytics: true, marketing: true },
		});
		expect(screen.queryByTestId('cookie-consent-band')).toBeNull();
	});

	test('Reject all persists a refusal — it does not merely hide the band', async () => {
		await renderMarketing(<CookieConsentBand onCustomize={vi.fn()} />);

		fireEvent.click(await screen.findByTestId('cookie-band-reject'));

		expect(readStored()).toEqual({
			version: COOKIE_CONSENT_POLICY_VERSION,
			consent: { functional: false, analytics: false, marketing: false },
		});
		expect(useCookieConsentStore.getState().hasDecision).toBe(true);
	});

	test('Accept and Reject are the same size and variant — the consent exception to one primary CTA', async () => {
		await renderMarketing(<CookieConsentBand onCustomize={vi.fn()} />);

		const accept = await screen.findByTestId('cookie-band-accept');
		const reject = screen.getByTestId('cookie-band-reject');

		expect(accept.className).toContain('h-8');
		expect(reject.className).toContain('h-8');
	});

	test('Customize hands off to the preferences drawer', async () => {
		const onCustomize = vi.fn();
		await renderMarketing(<CookieConsentBand onCustomize={onCustomize} />);

		fireEvent.click(await screen.findByTestId('cookie-band-customize'));

		expect(onCustomize).toHaveBeenCalledTimes(1);
	});
});

describe('cookie consent fails closed', () => {
	test('a malformed stored decision is discarded and re-asked, with nothing enabled', async () => {
		window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, '{not json');

		await renderMarketing(<CookieConsentBand onCustomize={vi.fn()} />);

		expect(await screen.findByTestId('cookie-consent-band')).toBeTruthy();
		expect(useCookieConsentStore.getState().consent).toEqual({
			functional: false,
			analytics: false,
			marketing: false,
		});
	});

	test('a decision stored against an older policy version is re-asked', async () => {
		storeDecision(
			{ functional: true, analytics: true, marketing: true },
			'1999-01',
		);

		await renderMarketing(<CookieConsentBand onCustomize={vi.fn()} />);

		expect(await screen.findByTestId('cookie-consent-band')).toBeTruthy();
		expect(useCookieConsentStore.getState().consent.analytics).toBe(false);
	});

	test('a partially-shaped stored decision is treated as corrupt, not defaulted', async () => {
		storeDecision({ functional: true });

		await renderMarketing(<CookieConsentBand onCustomize={vi.fn()} />);

		expect(await screen.findByTestId('cookie-consent-band')).toBeTruthy();
		expect(useCookieConsentStore.getState().consent.functional).toBe(false);
	});
});

describe('CookiePrefsDrawer', () => {
	test('Essential is shown, checked and not switchable', async () => {
		await renderMarketing(<CookiePrefsDrawer open onOpenChange={vi.fn()} />);

		const essential = await screen.findByTestId('cookie-category-essential');
		expect(essential.getAttribute('data-checked')).not.toBeNull();

		// Behaviour, not markup: clicking it must not be able to turn it off,
		// and saving afterwards must not record it as a switchable category.
		fireEvent.click(essential);
		fireEvent.click(screen.getByTestId('cookie-prefs-save'));

		expect(essential.getAttribute('data-checked')).not.toBeNull();
		expect(readStored()).toEqual({
			version: COOKIE_CONSENT_POLICY_VERSION,
			consent: { functional: false, analytics: false, marketing: false },
		});
	});

	test('saves exactly the categories that were ticked', async () => {
		await renderMarketing(<CookiePrefsDrawer open onOpenChange={vi.fn()} />);

		fireEvent.click(await screen.findByTestId('cookie-category-analytics'));
		fireEvent.click(screen.getByTestId('cookie-prefs-save'));

		expect(readStored()).toEqual({
			version: COOKIE_CONSENT_POLICY_VERSION,
			consent: { functional: false, analytics: true, marketing: false },
		});
	});

	test('an abandoned edit never leaks into the stored decision', async () => {
		const onOpenChange = vi.fn();
		const { rerender } = await renderMarketing(
			<CookiePrefsDrawer open onOpenChange={onOpenChange} />,
		);

		fireEvent.click(await screen.findByTestId('cookie-category-marketing'));
		rerender(<CookiePrefsDrawer open={false} onOpenChange={onOpenChange} />);

		expect(readStored()).toBeNull();
		expect(useCookieConsentStore.getState().hasDecision).toBe(false);
	});

	test('Reject all inside the drawer persists a refusal', async () => {
		await renderMarketing(<CookiePrefsDrawer open onOpenChange={vi.fn()} />);

		fireEvent.click(await screen.findByTestId('cookie-category-functional'));
		fireEvent.click(screen.getByTestId('cookie-prefs-reject-all'));

		expect(readStored()).toEqual({
			version: COOKIE_CONSENT_POLICY_VERSION,
			consent: { functional: false, analytics: false, marketing: false },
		});
	});
});
