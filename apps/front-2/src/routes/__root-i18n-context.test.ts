/** @vitest-environment node */
import { afterEach, describe, expect, test, vi } from 'vitest';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';

const mocks = vi.hoisted(() => ({
	loadI18nForRequest: vi.fn(),
}));

vi.mock('~/server/i18n-locale', () => ({
	loadI18nForRequest: mocks.loadI18nForRequest,
	setLocale: vi.fn(),
}));

import type { I18nResources, SupportedLanguage } from '~/lib/i18n.shared';

import { Route as RootRoute } from './__root';

type RootContext = {
	locale: SupportedLanguage;
	resources: I18nResources;
};

const runRootBeforeLoad = async (): Promise<RootContext> => {
	const beforeLoad = RootRoute.options.beforeLoad as () => Promise<RootContext>;
	return await beforeLoad();
};

const stubDocument = (cookie: string, language: string): void => {
	vi.stubGlobal('document', {
		cookie,
		documentElement: { lang: language },
	});
};

describe('root i18n context on the client', () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.unstubAllGlobals();
	});

	test('resolves the cookie locally without calling the server function', async () => {
		stubDocument(`other=value; ${LOCALE_COOKIE_KEY}=fr`, 'en');

		const context = await runRootBeforeLoad();

		expect(context.locale).toBe('fr');
		expect(Object.keys(context.resources)).toEqual(['fr', 'en']);
		expect(mocks.loadI18nForRequest).not.toHaveBeenCalled();
	});

	test('uses the document language when the cookie is unsupported', async () => {
		stubDocument(`${LOCALE_COOKIE_KEY}=de`, 'fr');

		const context = await runRootBeforeLoad();

		expect(context.locale).toBe('fr');
		expect(mocks.loadI18nForRequest).not.toHaveBeenCalled();
	});

	test('falls back to English when the cookie and document language are unsupported', async () => {
		stubDocument(`${LOCALE_COOKIE_KEY}=de`, 'es');

		const context = await runRootBeforeLoad();

		expect(context.locale).toBe('en');
		expect(mocks.loadI18nForRequest).not.toHaveBeenCalled();
	});

	test('reuses one context per locale while observing locale switches', async () => {
		stubDocument(`${LOCALE_COOKIE_KEY}=fr`, 'en');
		const firstFrenchContext = await runRootBeforeLoad();
		const secondFrenchContext = await runRootBeforeLoad();

		stubDocument(`${LOCALE_COOKIE_KEY}=en`, 'fr');
		const englishContext = await runRootBeforeLoad();

		stubDocument(`${LOCALE_COOKIE_KEY}=fr`, 'en');
		const switchedBackFrenchContext = await runRootBeforeLoad();

		expect(secondFrenchContext).toBe(firstFrenchContext);
		expect(englishContext).not.toBe(firstFrenchContext);
		expect(englishContext.locale).toBe('en');
		expect(switchedBackFrenchContext).toBe(firstFrenchContext);
		expect(mocks.loadI18nForRequest).not.toHaveBeenCalled();
	});
});
