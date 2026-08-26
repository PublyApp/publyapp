/** @vitest-environment node */
import { afterEach, describe, expect, test, vi } from 'vitest';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';

const mocks = vi.hoisted(() => ({
	createBackendI18n: vi.fn(),
	loadI18nContext: vi.fn(),
	loadI18nForRequest: vi.fn(),
}));

vi.mock('~/lib/i18n.backend', () => ({
	createBackendI18n: mocks.createBackendI18n,
	loadI18nContext: mocks.loadI18nContext,
}));

vi.mock('~/server/i18n-locale', () => ({
	loadI18nForRequest: mocks.loadI18nForRequest,
	setLocale: vi.fn(),
}));

import type { I18nRouteMatch, SupportedNamespace } from '~/lib/i18n.namespaces';
import type { I18nResources, SupportedLanguage } from '~/lib/i18n.shared';

import { Route as RootRoute } from './__root';

type RootContext = {
	locale: SupportedLanguage;
	namespaces: SupportedNamespace[];
	resources: I18nResources;
	namespaceLoadError: string | null;
};

const runRootBeforeLoad = async (
	matches: readonly I18nRouteMatch[],
): Promise<RootContext> => {
	const beforeLoad = RootRoute.options.beforeLoad as (options: {
		location: { pathname: string };
		matches: readonly I18nRouteMatch[];
	}) => Promise<RootContext>;
	return await beforeLoad({
		location: { pathname: '/login' },
		matches,
	});
};

const stubDocument = (cookie: string, language: string): void => {
	vi.stubGlobal('document', {
		cookie,
		documentElement: { lang: language },
	});
};

const authMatches = [
	{ staticData: undefined },
	{ staticData: { i18nNamespaces: ['auth'] as const } },
];

mocks.createBackendI18n.mockResolvedValue({});
mocks.loadI18nContext.mockImplementation(
	async (
		_instance: unknown,
		locale: SupportedLanguage,
		namespaces: readonly SupportedNamespace[],
	) => {
		return {
			namespaces: [...namespaces],
			resources: {
				[locale]: Object.fromEntries(
					namespaces.map((namespace) => [namespace, {}]),
				),
			},
			namespaceLoadError: null,
		};
	},
);

describe('root i18n context on the client', () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.unstubAllGlobals();
	});

	test('returns globals plus a serializable error when a feature import fails', async () => {
		mocks.loadI18nContext.mockResolvedValueOnce({
			namespaces: ['common', 'zod', 'response-message'],
			resources: {
				fr: {
					common: { retry: 'Réessayer' },
					zod: {},
					'response-message': {},
				},
			},
			namespaceLoadError: 'Unknown i18n resource: fr/auth',
		});
		stubDocument(`${LOCALE_COOKIE_KEY}=fr`, 'en');

		await expect(runRootBeforeLoad(authMatches)).resolves.toMatchObject({
			locale: 'fr',
			namespaceLoadError: 'Unknown i18n resource: fr/auth',
		});
	});

	test('loads matched namespaces on the client without an RPC', async () => {
		stubDocument(`${LOCALE_COOKIE_KEY}=fr`, 'en');

		const context = await runRootBeforeLoad(authMatches);

		expect(context.locale).toBe('fr');
		expect(mocks.loadI18nContext).toHaveBeenCalledWith(
			expect.anything(),
			'fr',
			['common', 'zod', 'response-message', 'auth'],
		);
		expect(mocks.loadI18nForRequest).not.toHaveBeenCalled();
	});

	test('uses the validated server loader only during SSR', async () => {
		vi.unstubAllGlobals();

		await runRootBeforeLoad(authMatches);

		expect(mocks.loadI18nForRequest).toHaveBeenCalledWith({
			data: { namespaces: ['common', 'zod', 'response-message', 'auth'] },
		});
	});

	test('caches by locale and namespace set, not locale alone', async () => {
		stubDocument(`${LOCALE_COOKIE_KEY}=fr`, 'en');

		const globals = await runRootBeforeLoad([]);
		const auth = await runRootBeforeLoad(authMatches);

		expect(auth).not.toBe(globals);
		expect(auth.resources as object).not.toHaveProperty('en');
	});

	test('uses the document language when the cookie is unsupported', async () => {
		stubDocument(`${LOCALE_COOKIE_KEY}=de`, 'fr');

		const context = await runRootBeforeLoad([]);

		expect(context.locale).toBe('fr');
		expect(mocks.loadI18nForRequest).not.toHaveBeenCalled();
	});

	test('falls back to English when the cookie and document language are unsupported', async () => {
		stubDocument(`${LOCALE_COOKIE_KEY}=de`, 'es');

		const context = await runRootBeforeLoad([]);

		expect(context.locale).toBe('en');
		expect(mocks.loadI18nForRequest).not.toHaveBeenCalled();
	});

	test('reuses one context per locale and namespace set while observing locale switches', async () => {
		stubDocument(`${LOCALE_COOKIE_KEY}=fr`, 'en');
		const firstFrenchContext = await runRootBeforeLoad([]);
		const secondFrenchContext = await runRootBeforeLoad([]);

		stubDocument(`${LOCALE_COOKIE_KEY}=en`, 'fr');
		const englishContext = await runRootBeforeLoad([]);

		stubDocument(`${LOCALE_COOKIE_KEY}=fr`, 'en');
		const switchedBackFrenchContext = await runRootBeforeLoad([]);

		expect(secondFrenchContext).toBe(firstFrenchContext);
		expect(englishContext).not.toBe(firstFrenchContext);
		expect(englishContext.locale).toBe('en');
		expect(Object.keys(englishContext.resources)).toEqual(['en']);
		expect(switchedBackFrenchContext).toBe(firstFrenchContext);
		expect(mocks.loadI18nForRequest).not.toHaveBeenCalled();
	});
});
