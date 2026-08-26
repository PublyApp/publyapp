import { createInstance, type BackendModule, type i18n } from 'i18next';

import {
	GLOBAL_I18N_NAMESPACES,
	type SupportedNamespace,
} from './i18n.namespaces';
import {
	type I18nLoadResult,
	type I18nResources,
	type NamespaceResource,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from './i18n.shared';

type JsonModule = { default: NamespaceResource };
type ResourceLoader = () => Promise<JsonModule>;

const localLoaders = import.meta.glob<JsonModule>('../i18n/locales/*/*.json');

// Relative paths into shared-ts's JSON, NOT `@org/shared-ts/...json` (which resolves to a
// nonexistent `.json.ts` under shared-ts's `./* → ./src/*.ts` export map) and NOT the locale barrel
// (`@org/shared-ts/lib/i18n/locales/{en,fr}`, which would pull shared `common` into every namespace
// chunk). A relative dynamic `import()` of the exact file resolves correctly and code-splits each
// namespace on its own — verified resolving + typechecking from `apps/front/src/lib/`.
/** Known shared loaders, keyed by `${language}/${namespace}`. A Map keeps the
 * dynamic lookup (`${language}/${namespace}`) explicit about unknown keys —
 * `.get()` returns `undefined` for a missing namespace instead of widening the
 * literal to an open dictionary (no-known-value-widening). */
const sharedLoaders = new Map<string, ResourceLoader>([
	[
		'en/zod',
		() =>
			import('../../../../packages/shared-ts/src/lib/i18n/json/zod.en.json'),
	],
	[
		'fr/zod',
		() =>
			import('../../../../packages/shared-ts/src/lib/i18n/json/zod.fr.json'),
	],
	[
		'en/response-message',
		() =>
			import('../../../../packages/shared-ts/src/lib/i18n/json/response-message.en.json'),
	],
	[
		'fr/response-message',
		() =>
			import('../../../../packages/shared-ts/src/lib/i18n/json/response-message.fr.json'),
	],
] as const satisfies readonly (readonly [string, ResourceLoader])[]);

const localLoaderByKey = new Map<string, ResourceLoader>();
const globalNamespaceSet = new Set<SupportedNamespace>(GLOBAL_I18N_NAMESPACES);
for (const [path, loader] of Object.entries(localLoaders)) {
	const match = path.match(/\/locales\/(en|fr)\/([^/]+)\.json$/);
	if (match) {
		localLoaderByKey.set(`${match[1]}/${match[2]}`, loader);
	}
}

export const readNamespaceResource = async (
	language: SupportedLanguage,
	namespace: SupportedNamespace,
): Promise<NamespaceResource> => {
	const key = `${language}/${namespace}`;
	const loader = localLoaderByKey.get(key) ?? sharedLoaders.get(key);
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
