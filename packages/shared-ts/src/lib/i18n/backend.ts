import { createInstance, type BackendModule, type i18n } from 'i18next';

import { GLOBAL_I18N_NAMESPACES, type SupportedNamespace } from './namespaces';
import {
	type I18nLoadResult,
	type I18nResources,
	type NamespaceResource,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from './shared';

type JsonModule = { default: NamespaceResource };
type ResourceLoader = () => Promise<JsonModule>;

// Every catalogue lives next to this module (`json/<namespace>.<language>.json`), and each is
// loaded through its own dynamic `import()`. That is deliberate and load-bearing: a static import
// (or one from the locale barrel, `./locales/{en,fr}`) would pull the whole catalogue into
// whichever chunk happens to need one namespace. A relative dynamic `import()` of the exact file
// code-splits each namespace on its own — the build emits one chunk per namespace per language,
// and the route that needs `staff-users` never downloads `landing`.
//
// Keys are `${language}/${namespace}`, typed as the closed union below rather than `string`:
// a typo or a namespace outside the registry is a typecheck error instead of a runtime
// "Unknown i18n resource" on the one route that happens to load it. That the map covers EVERY
// registered namespace is pinned by `backend.test.ts` ("has a loader for every registered
// namespace in both languages"), not by the type — a `Map` cannot express completeness.
type SharedLoaderKey = `${SupportedLanguage}/${SupportedNamespace}`;

const sharedLoaders = new Map<SharedLoaderKey, ResourceLoader>([
	['en/common', () => import('./json/common.en.json')],
	['fr/common', () => import('./json/common.fr.json')],
	['en/zod', () => import('./json/zod.en.json')],
	['fr/zod', () => import('./json/zod.fr.json')],
	['en/response-message', () => import('./json/response-message.en.json')],
	['fr/response-message', () => import('./json/response-message.fr.json')],
	['en/auth', () => import('./json/auth.en.json')],
	['fr/auth', () => import('./json/auth.fr.json')],
	['en/account', () => import('./json/account.en.json')],
	['fr/account', () => import('./json/account.fr.json')],
	['en/settings', () => import('./json/settings.en.json')],
	['fr/settings', () => import('./json/settings.fr.json')],
	['en/organizations', () => import('./json/organizations.en.json')],
	['fr/organizations', () => import('./json/organizations.fr.json')],
	['en/posts', () => import('./json/posts.en.json')],
	['fr/posts', () => import('./json/posts.fr.json')],
	['en/social-accounts', () => import('./json/social-accounts.en.json')],
	['fr/social-accounts', () => import('./json/social-accounts.fr.json')],
	[
		'en/staff-tenant-profiles',
		() => import('./json/staff-tenant-profiles.en.json'),
	],
	[
		'fr/staff-tenant-profiles',
		() => import('./json/staff-tenant-profiles.fr.json'),
	],
	['en/staff-users', () => import('./json/staff-users.en.json')],
	['fr/staff-users', () => import('./json/staff-users.fr.json')],
	['en/staff-invitations', () => import('./json/staff-invitations.en.json')],
	['fr/staff-invitations', () => import('./json/staff-invitations.fr.json')],
	['en/staff-audit-logs', () => import('./json/staff-audit-logs.en.json')],
	['fr/staff-audit-logs', () => import('./json/staff-audit-logs.fr.json')],
	['en/staff-jobs', () => import('./json/staff-jobs.en.json')],
	['fr/staff-jobs', () => import('./json/staff-jobs.fr.json')],
	[
		'en/staff-tenant-activity',
		() => import('./json/staff-tenant-activity.en.json'),
	],
	[
		'fr/staff-tenant-activity',
		() => import('./json/staff-tenant-activity.fr.json'),
	],
	['en/landing', () => import('./json/landing.en.json')],
	['fr/landing', () => import('./json/landing.fr.json')],
]);

const globalNamespaceSet = new Set<SupportedNamespace>(GLOBAL_I18N_NAMESPACES);

export const readNamespaceResource = async (
	language: SupportedLanguage,
	namespace: SupportedNamespace,
): Promise<NamespaceResource> => {
	const key: SharedLoaderKey = `${language}/${namespace}`;
	const loader = sharedLoaders.get(key);
	if (!loader) {
		throw new Error(`Unknown i18n resource: ${key}`);
	}
	return (await loader()).default;
};

export const i18nBackend: BackendModule = {
	type: 'backend',
	init: () => undefined,
	read: (language, namespace, done) => {
		void readNamespaceResource(
			language as SupportedLanguage,
			namespace as SupportedNamespace,
		).then(
			(resource) => done(null, resource),
			(error: unknown) =>
				done(error instanceof Error ? error : new Error(String(error)), null),
		);
	},
};

export const loadNamespacesStrict = (
	instance: i18n,
	namespaces: readonly SupportedNamespace[],
): Promise<void> =>
	new Promise((resolve, reject) => {
		void instance.loadNamespaces([...namespaces], (error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});

export const createBackendI18n = async (
	locale: SupportedLanguage,
): Promise<i18n> => {
	const instance = createInstance();
	await instance.use(i18nBackend).init({
		lng: locale,
		fallbackLng: false,
		supportedLngs: [...SUPPORTED_LANGUAGES],
		defaultNS: 'common',
		ns: [],
		partialBundledLanguages: true,
		interpolation: { escapeValue: false },
	});
	return instance;
};

const snapshotResources = (
	instance: i18n,
	locale: SupportedLanguage,
	namespaces: readonly SupportedNamespace[],
): I18nResources => {
	const language: Partial<Record<SupportedNamespace, NamespaceResource>> = {};
	for (const namespace of namespaces) {
		const bundle = instance.getResourceBundle(locale, namespace) as unknown;
		language[namespace] =
			typeof bundle === 'object' && bundle !== null
				? (bundle as NamespaceResource)
				: {};
	}
	return { [locale]: language };
};

export const loadI18nContext = async (
	instance: i18n,
	locale: SupportedLanguage,
	namespaces: readonly SupportedNamespace[],
): Promise<I18nLoadResult> => {
	try {
		await loadNamespacesStrict(instance, GLOBAL_I18N_NAMESPACES);
		const features = namespaces.filter(
			(namespace) => !globalNamespaceSet.has(namespace),
		);
		await loadNamespacesStrict(instance, features);
		return {
			namespaces: [...namespaces],
			resources: snapshotResources(instance, locale, namespaces),
			namespaceLoadError: null,
		};
	} catch (error) {
		return {
			namespaces: [...GLOBAL_I18N_NAMESPACES],
			resources: snapshotResources(instance, locale, GLOBAL_I18N_NAMESPACES),
			namespaceLoadError:
				error instanceof Error ? error.message : String(error),
		};
	}
};
