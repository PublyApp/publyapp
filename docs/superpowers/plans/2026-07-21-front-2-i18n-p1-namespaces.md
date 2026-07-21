# front-2 i18n P1 Namespace Re-architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build complete active-language-only, per-route i18n namespace loading for front-2 and prove it by extracting the five auth routes from `common` into one lazy `auth` namespace.

**Architecture:** Every route contributes typed `staticData.i18nNamespaces`; root `beforeLoad` unions those declarations with the three global namespaces and loads them through one Vite-glob i18next backend. SSR uses a validated server function and a request-local loading instance, while client navigation uses a locale-scoped client loading instance and direct `import()` chunks with no navigation RPC; both return a plain active-language resource snapshot through `__beforeLoadContext`, and `RootShell` synchronously creates the provider instance from that snapshot. `fallbackLng` is `false`; English and French completeness is enforced statically and by namespace-aware key coverage.

**Tech Stack:** TypeScript 6, React 19, TanStack Router/Start, i18next 24, react-i18next, Vite 8 `import.meta.glob`, Zod 3, Vitest 4, Playwright 1.61, pnpm.

---

## File Structure

### Create

- `apps/front-2/src/lib/i18n.namespaces.ts` — canonical global/feature namespace registry, Zod allowlist, TanStack `StaticDataRouteOption` augmentation, and deterministic matched-route union collector.
- `apps/front-2/src/lib/i18n.namespaces.test.ts` — registry, validation, ordering, and deduplication tests.
- `apps/front-2/src/lib/i18n.backend.ts` — hand-rolled Vite dynamic-import backend, strict `loadNamespaces` adapter, active-locale snapshotting, and non-throwing global fallback result.
- `apps/front-2/src/lib/i18n.backend.test.ts` — local/shared loader matrix, unknown-loader rejection, strict callback rejection, and single-language snapshot tests.
- `apps/front-2/src/lib/i18n.shared.test.ts` — synchronous provider initialization and strict no-language-fallback tests.
- `apps/front-2/src/i18n/locales/en/common.json` — front-2-owned English global copy, initially seeded from shared-ts and then slimmed by auth extraction.
- `apps/front-2/src/i18n/locales/fr/common.json` — front-2-owned French global copy, initially seeded from shared-ts and then slimmed by auth extraction.
- `apps/front-2/src/i18n/locales/en/auth.json` — English auth-route copy, lazy outside auth matches.
- `apps/front-2/src/i18n/locales/fr/auth.json` — French auth-route copy with exactly the English auth key shape.
- `apps/front-2/src/i18n/locales/en.ts` — front-2 English resource manifest and canonical resource type.
- `apps/front-2/src/i18n/locales/fr.ts` — French resource manifest constrained with `satisfies LooseResource`.
- `apps/front-2/src/i18n/locales/locales.test.ts` — manifest namespace order and cross-language key-parity tests.
- `apps/front-2/src/types/i18next.d.ts` — front-2-local i18next resource augmentation including `auth`.
- `apps/front-2/e2e/i18n-namespaces.spec.ts` — SSR no-flash, dehydration/hydration, concurrent locale, SPA lazy-load, preload, and locale-switch checks.

### Modify

- `apps/front-2/tsconfig.json` — include shared global helpers without importing shared-ts's incompatible i18next augmentation.
- `apps/front-2/src/lib/i18n.shared.ts` — retain locale utilities, define serializable snapshot types, set `fallbackLng: false`, and synchronously create an instance from an explicit namespace list.
- `apps/front-2/src/lib/i18n.client.ts` — remove embedded en/fr resources and bind client-only Zod behavior to the already hydrated provider instance.
- `apps/front-2/src/lib/i18n.server.ts` — keep cookie normalization only; remove the obsolete `buildI18nResources` re-export.
- `apps/front-2/src/lib/i18n.server.test.ts` — retain locale-cookie tests and remove monolithic/fallback assertions replaced by backend/shared tests.
- `apps/front-2/src/server.ts` — load the global namespaces through the Vite backend for request-local SEO translation and keep `/` and `/login` title/description injection working.
- `apps/front-2/src/server/i18n-locale.ts` — accept a validated namespace allowlist and create a request-local backend instance on the SSR branch only.
- `apps/front-2/src/routes/__root.tsx` — collect matched namespaces, split client direct-import from SSR server loading, cache by locale plus namespace set, keep failures non-throwing, dehydrate the snapshot, and wire `RootShell` synchronously.
- `apps/front-2/src/routes/__root-i18n-context.test.ts` — exercise matched-route collection, no client RPC, stable cache keys, active-language-only snapshots, SSR input, locale switches, and failure fallback.
- `apps/front-2/src/routes/__root-error-boundary.test.tsx` — replace monolithic resource construction with explicit active-locale global snapshots.
- `apps/front-2/src/lib/mutation-toast.test.ts` — construct its test instance with an explicit namespace list and active-locale snapshot.
- `apps/front-2/src/components/field/field.test.tsx` — construct its InterZod test instances from explicit per-locale `zod` snapshots.
- `apps/front-2/src/lib/i18n-key-coverage.test.ts` — read front-2 manifests and resolve each literal or indirect key against its actual namespace in both locales.
- `apps/front-2/src/routes/login.tsx` — declare `auth`, bind both translation hooks to it, and explicitly qualify retained globals with `common:`.
- `apps/front-2/src/routes/signup.tsx` — declare `auth`, bind both translation hooks to it, and qualify retained globals.
- `apps/front-2/src/routes/reset-password.tsx` — declare `auth`, bind all four translation hooks and three `Trans` nodes to it, and qualify retained globals.
- `apps/front-2/src/routes/verify-email.tsx` — declare `auth`, bind its hook and `Trans` node to it, and qualify retained globals.
- `apps/front-2/src/routes/accept-invitation.tsx` — declare `auth`, bind all nine hooks and the dynamic `Trans` node to it, qualify retained globals, and expose indirect keys through `_I18N_KEYS` maps.
- `apps/front-2/src/routes/login.test.tsx` — assert the route's `auth` static data.
- `apps/front-2/src/routes/signup.test.tsx` — assert the route's `auth` static data.
- `apps/front-2/src/routes/reset-password.test.tsx` — assert the route's `auth` static data.
- `apps/front-2/src/routes/verify-email.test.tsx` — assert the route's `auth` static data.
- `apps/front-2/src/routes/accept-invitation.test.tsx` — assert the route's `auth` static data.

### Deliberately unchanged

- `packages/shared-ts/lib/i18n/json/*` and `packages/shared-ts/lib/i18n/locales/{en,fr}.ts` remain the legacy frontend's source; front-2 copies `common` and continues lazy-loading only shared `zod` and `response-message`.
- `apps/front-2/src/router.tsx` keeps `defaultPreload: 'intent'`; runtime verification proves the new root `beforeLoad` composes with it.
- `apps/front-2/src/routes.ts` and `apps/front-2/vite.config.ts` need no configuration change; route options live in route modules, and Vite transforms the backend glob automatically.

### Task 1: Namespace Registry and Route Static Data

**Files:**
- Create: `apps/front-2/src/lib/i18n.namespaces.ts`
- Test: `apps/front-2/src/lib/i18n.namespaces.test.ts`

- [ ] **Step 1: Write the failing registry and collector test**

```ts
import { describe, expect, test } from 'vitest';

import {
	collectI18nNamespaces,
	GLOBAL_I18N_NAMESPACES,
	I18N_NAMESPACES,
	I18nNamespaceListSchema,
} from './i18n.namespaces';

describe('i18n namespace registry', () => {
	test('keeps globals first and adds each matched feature once', () => {
		expect(
			collectI18nNamespaces([
				{ staticData: undefined },
				{ staticData: { i18nNamespaces: ['auth'] } },
				{ staticData: { i18nNamespaces: ['auth'] } },
			]),
		).toEqual([...GLOBAL_I18N_NAMESPACES, 'auth']);
	});

	test('validates only registered server-function input', () => {
		expect(I18nNamespaceListSchema.parse([...I18N_NAMESPACES])).toEqual([
			...I18N_NAMESPACES,
		]);
		expect(I18nNamespaceListSchema.safeParse(['common', 'unknown']).success).toBe(
			false,
		);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter front-2 exec vitest run src/lib/i18n.namespaces.test.ts`

Expected: FAIL because `./i18n.namespaces` does not exist.

- [ ] **Step 3: Add the typed registry, allowlist, augmentation, and collector**

```ts
import { z } from 'zod';

export const GLOBAL_I18N_NAMESPACES = [
	'common',
	'zod',
	'response-message',
] as const;
export const FEATURE_I18N_NAMESPACES = ['auth'] as const;
export const I18N_NAMESPACES = [
	...GLOBAL_I18N_NAMESPACES,
	...FEATURE_I18N_NAMESPACES,
] as const;

export type SupportedNamespace = (typeof I18N_NAMESPACES)[number];

export const I18nNamespaceListSchema = z.array(z.enum(I18N_NAMESPACES));

declare module '@tanstack/react-router' {
	interface StaticDataRouteOption {
		i18nNamespaces?: readonly SupportedNamespace[];
	}
}

export type I18nRouteMatch = {
	staticData?: {
		i18nNamespaces?: readonly SupportedNamespace[];
	};
};

export const collectI18nNamespaces = (
	matches: readonly I18nRouteMatch[],
): SupportedNamespace[] => {
	const requested = new Set<SupportedNamespace>(GLOBAL_I18N_NAMESPACES);

	for (const match of matches) {
		for (const namespace of match.staticData?.i18nNamespaces ?? []) {
			requested.add(namespace);
		}
	}

	return I18N_NAMESPACES.filter((namespace) => requested.has(namespace));
};
```

- [ ] **Step 4: Run the task verification floor**

Run: `pnpm --filter front-2 exec vitest run src/lib/i18n.namespaces.test.ts`

Expected: PASS (2 tests).

Run: `npx oxlint apps/front-2/src/lib/i18n.namespaces.ts apps/front-2/src/lib/i18n.namespaces.test.ts`

Expected: 0 errors.

Run: `pnpm --filter front-2 typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/front-2/src/lib/i18n.namespaces.ts apps/front-2/src/lib/i18n.namespaces.test.ts
git commit -m "feat(front-2): add i18n namespace registry"
```

### Task 2: front-2 Locale Sources and Completeness Types

**Files:**
- Create: `apps/front-2/src/i18n/locales/en/common.json`
- Create: `apps/front-2/src/i18n/locales/fr/common.json`
- Create: `apps/front-2/src/i18n/locales/en/auth.json`
- Create: `apps/front-2/src/i18n/locales/fr/auth.json`
- Create: `apps/front-2/src/i18n/locales/en.ts`
- Create: `apps/front-2/src/i18n/locales/fr.ts`
- Create: `apps/front-2/src/i18n/locales/locales.test.ts`
- Create: `apps/front-2/src/types/i18next.d.ts`
- Modify: `apps/front-2/tsconfig.json`

- [ ] **Step 1: Write the failing locale-manifest test**

```ts
import { describe, expect, test } from 'vitest';

import { I18N_NAMESPACES } from '~/lib/i18n.namespaces';

import en from './en';
import fr from './fr';

describe('front-2 locale manifests', () => {
	test('publish every registered namespace in registry order', () => {
		expect(Object.keys(en)).toEqual([...I18N_NAMESPACES]);
		expect(Object.keys(fr)).toEqual([...I18N_NAMESPACES]);
	});

	test('keep English and French keys identical per namespace', () => {
		for (const namespace of I18N_NAMESPACES) {
			expect(Object.keys(fr[namespace]).sort()).toEqual(
				Object.keys(en[namespace]).sort(),
			);
		}
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter front-2 exec vitest run src/i18n/locales/locales.test.ts`

Expected: FAIL because the front-2 locale manifests do not exist.

- [ ] **Step 3: Seed the local JSON layout without changing shared-ts**

Run these mechanical copy/create commands from the repository root:

```bash
mkdir -p apps/front-2/src/i18n/locales/en apps/front-2/src/i18n/locales/fr apps/front-2/src/types
cp packages/shared-ts/lib/i18n/json/common.en.json apps/front-2/src/i18n/locales/en/common.json
cp packages/shared-ts/lib/i18n/json/common.fr.json apps/front-2/src/i18n/locales/fr/common.json
printf '{}\n' > apps/front-2/src/i18n/locales/en/auth.json
printf '{}\n' > apps/front-2/src/i18n/locales/fr/auth.json
```

The `cp` is intentional: front-2 owns the new files after this commit; do not replace them with imports or symlinks.

- [ ] **Step 4: Add English/French manifests and the front-2 i18next augmentation**

`apps/front-2/src/i18n/locales/en.ts`:

```ts
import responseMessage from '@org/shared-ts/lib/i18n/json/response-message.en.json';
import zod from '@org/shared-ts/lib/i18n/json/zod.en.json';

import auth from './en/auth.json';
import common from './en/common.json';

const resourceEN = {
	common,
	zod,
	'response-message': responseMessage,
	auth,
} as const;

export type Front2Resource = typeof resourceEN;
export type LooseResource = ToPrimitive<Front2Resource>;

export default resourceEN;
```

`apps/front-2/src/i18n/locales/fr.ts`:

```ts
import responseMessage from '@org/shared-ts/lib/i18n/json/response-message.fr.json';
import zod from '@org/shared-ts/lib/i18n/json/zod.fr.json';

import auth from './fr/auth.json';
import common from './fr/common.json';
import type { LooseResource } from './en';

const resourceFR = {
	common,
	zod,
	'response-message': responseMessage,
	auth,
} as const satisfies LooseResource;

export default resourceFR;
```

`apps/front-2/src/types/i18next.d.ts`:

```ts
import type { Front2Resource } from '../i18n/locales/en';

declare module 'i18next' {
	interface CustomTypeOptions {
		defaultNS: 'common';
		resources: Front2Resource;
	}
}
```

In `apps/front-2/tsconfig.json`, replace the wildcard shared declaration include with the two global helper declarations, leaving the rest unchanged:

```json
"include": [
	"**/*.ts",
	"**/*.tsx",
	"server.mjs",
	"scripts/**/*.mjs",
	"../../packages/shared-ts/@types/utils.d.ts",
	"../../packages/shared-ts/@types/paths.d.ts"
]
```

This prevents `packages/shared-ts/@types/i18next.d.ts` from defining the old three-namespace resource shape inside front-2 while preserving `ToPrimitive`, `Paths`, and the other shared global helpers.

- [ ] **Step 5: Run the task verification floor**

Run: `pnpm --filter front-2 exec vitest run src/i18n/locales/locales.test.ts`

Expected: PASS (2 tests).

Run: `npx oxlint apps/front-2/src/i18n/locales/en.ts apps/front-2/src/i18n/locales/fr.ts apps/front-2/src/i18n/locales/locales.test.ts apps/front-2/src/types/i18next.d.ts`

Expected: 0 errors.

Run: `pnpm --filter front-2 typecheck`

Expected: PASS, including the `fr.ts satisfies LooseResource` key-shape check.

- [ ] **Step 6: Commit**

```bash
git add apps/front-2/tsconfig.json apps/front-2/src/i18n apps/front-2/src/types/i18next.d.ts
git commit -m "feat(front-2): own locale namespace sources"
```

### Task 3: Vite-glob i18next Backend and Strict Loading

**Files:**
- Create: `apps/front-2/src/lib/i18n.backend.ts`
- Modify: `apps/front-2/src/lib/i18n.shared.ts`
- Test: `apps/front-2/src/lib/i18n.backend.test.ts`

- [ ] **Step 1: Write the failing backend tests**

```ts
import { createInstance } from 'i18next';
import { describe, expect, test, vi } from 'vitest';

import {
	createBackendI18n,
	loadI18nContext,
	loadNamespacesStrict,
	readNamespaceResource,
} from './i18n.backend';

describe('i18n Vite backend', () => {
	test.each([
		['en', 'common', 'hello', 'Hello'],
		['fr', 'common', 'hello', 'Bonjour'],
		['en', 'zod', 'validations.email', 'email'],
		['fr', 'response-message', 'unauthorized', 'Non autorisé'],
	] as const)('loads %s/%s', async (locale, namespace, key, expected) => {
		const resource = await readNamespaceResource(locale, namespace);
		const value = key.split('.').reduce<unknown>((node, part) => {
			return typeof node === 'object' && node !== null
				? (node as Record<string, unknown>)[part]
				: undefined;
		}, resource);
		expect(value).toBe(expected);
	});

	test('rejects an unknown locale/namespace loader key', async () => {
		await expect(
			readNamespaceResource('en', 'missing' as never),
		).rejects.toThrow('Unknown i18n resource: en/missing');
	});

	test('rejects when i18next reports a callback error', async () => {
		const instance = createInstance();
		vi.spyOn(instance, 'loadNamespaces').mockImplementation((_ns, callback) => {
			callback?.(new Error('chunk failed'), instance.t);
			return Promise.resolve(instance.t);
		});
		await expect(loadNamespacesStrict(instance, ['auth'])).rejects.toThrow(
			'chunk failed',
		);
	});

	test('snapshots only the active language and requested namespaces', async () => {
		const instance = await createBackendI18n('fr');
		const result = await loadI18nContext(instance, 'fr', [
			'common',
			'zod',
			'response-message',
			'auth',
		]);
		expect(Object.keys(result.resources)).toEqual(['fr']);
		expect(Object.keys(result.resources.fr ?? {})).toEqual([
			'common',
			'zod',
			'response-message',
			'auth',
		]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter front-2 exec vitest run src/lib/i18n.backend.test.ts`

Expected: FAIL because `./i18n.backend` does not exist.

- [ ] **Step 3: Implement the backend, strict callback wrapper, and snapshot result**

First replace the broad `I18nResources` aliases in `i18n.shared.ts` with the serializable namespace-aware types needed by the backend (Task 4 will remove the remaining monolithic loaders):

```ts
import type { SupportedNamespace } from './i18n.namespaces';

export type NamespaceResource = Record<string, JsonValue>;
export type I18nResources = Partial<
	Record<
		SupportedLanguage,
		Partial<Record<SupportedNamespace, NamespaceResource>>
	>
>;
export type I18nLoadResult = {
	namespaces: SupportedNamespace[];
	resources: I18nResources;
	namespaceLoadError: string | null;
};
```

Then create `i18n.backend.ts`:

```ts
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

const localLoaders = import.meta.glob<JsonModule>(
	'../i18n/locales/*/*.json',
);

const sharedLoaders: Record<string, ResourceLoader> = {
	'en/zod': () => import('@org/shared-ts/lib/i18n/json/zod.en.json'),
	'fr/zod': () => import('@org/shared-ts/lib/i18n/json/zod.fr.json'),
	'en/response-message': () =>
		import('@org/shared-ts/lib/i18n/json/response-message.en.json'),
	'fr/response-message': () =>
		import('@org/shared-ts/lib/i18n/json/response-message.fr.json'),
};

const localLoaderByKey = new Map<string, ResourceLoader>();
const globalNamespaceSet = new Set<SupportedNamespace>(
	GLOBAL_I18N_NAMESPACES,
);
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
	const loader = localLoaderByKey.get(key) ?? sharedLoaders[key];
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
		instance.loadNamespaces([...namespaces], (error) => {
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
			resources: snapshotResources(
				instance,
				locale,
				GLOBAL_I18N_NAMESPACES,
			),
			namespaceLoadError:
				error instanceof Error ? error.message : String(error),
		};
	}
};
```

- [ ] **Step 4: Run the task verification floor**

Run: `pnpm --filter front-2 exec vitest run src/lib/i18n.backend.test.ts`

Expected: PASS (7 test cases).

Run: `npx oxlint apps/front-2/src/lib/i18n.backend.ts apps/front-2/src/lib/i18n.backend.test.ts apps/front-2/src/lib/i18n.shared.ts`

Expected: 0 errors.

Run: `pnpm --filter front-2 typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/front-2/src/lib/i18n.backend.ts apps/front-2/src/lib/i18n.backend.test.ts apps/front-2/src/lib/i18n.shared.ts
git commit -m "feat(front-2): add lazy i18n backend"
```

### Task 4: Atomic Strict Provider and Matched Namespace Loading Migration

**Files:**
- Modify: `apps/front-2/src/lib/i18n.shared.ts`
- Modify: `apps/front-2/src/lib/i18n.client.ts`
- Modify: `apps/front-2/src/lib/i18n.server.ts`
- Modify: `apps/front-2/src/lib/i18n.server.test.ts`
- Modify: `apps/front-2/src/lib/i18n.backend.ts`
- Modify: `apps/front-2/src/server/i18n-locale.ts`
- Modify: `apps/front-2/src/routes/__root.tsx`
- Modify: `apps/front-2/src/server.ts`
- Modify: `apps/front-2/src/routes/__root-error-boundary.test.tsx`
- Modify: `apps/front-2/src/lib/mutation-toast.test.ts`
- Modify: `apps/front-2/src/components/field/field.test.tsx`
- Test: `apps/front-2/src/lib/i18n.shared.test.ts`
- Test: `apps/front-2/src/routes/__root-i18n-context.test.ts`
- Test: `apps/front-2/src/server.test.ts`

- [ ] **Step 1: Write the failing strict-fallback and namespace-aware root-context tests**

```ts
import { describe, expect, test } from 'vitest';

import { createI18nFromResources } from './i18n.shared';

describe('createI18nFromResources', () => {
	test('initializes synchronously from only the active language', () => {
		const i18n = createI18nFromResources('fr', ['common'], {
			fr: { common: { hello: 'Bonjour' } },
		});
		expect(i18n.isInitialized).toBe(true);
		expect(i18n.t('hello')).toBe('Bonjour');
		expect(Object.keys(i18n.store.data)).toEqual(['fr']);
	});

	test('does not fall back to English', () => {
		const i18n = createI18nFromResources('fr', ['common'], {
			fr: { common: {} },
			en: { common: { englishOnly: 'must not render' } },
		});
		expect(i18n.t('englishOnly')).toBe('englishOnly');
		expect(i18n.options.fallbackLng).toBe(false);
	});
});
```

In `apps/front-2/src/routes/__root-i18n-context.test.ts`, keep the existing cookie/document helpers, mock `createBackendI18n`, `loadI18nContext`, and `loadI18nForRequest`, and call `RootRoute.options.beforeLoad` with `matches`. Add these core cases:

```ts
const authMatches = [
	{ staticData: undefined },
	{ staticData: { i18nNamespaces: ['auth'] as const } },
];

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
	expect((auth.resources as object)).not.toHaveProperty('en');
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
```

Also retain the unsupported-cookie/document test, change the locale-switch cache test to assert the snapshot has only the new locale, and assert identical `(locale, namespaceSet)` calls return the same object.

- [ ] **Step 2: Run both test files to verify the combined behavior is red**

Run: `pnpm --filter front-2 exec vitest run src/lib/i18n.shared.test.ts src/routes/__root-i18n-context.test.ts`

Expected: FAIL because `createI18nFromResources` still has the old two-argument signature and English fallback, `beforeLoad` ignores matches, the SSR function accepts no data, and snapshots have no namespace/error fields.

- [ ] **Step 3: Replace monolithic shared loading with snapshot-only initialization and update the client initializer**

Retain `SUPPORTED_LANGUAGES`, `SupportedLanguage`, `FALLBACK_LANGUAGE`, locale labels, `isSupportedLanguage`, and `dirForLocale`. Remove both shared locale value imports, `LOCALE_RESOURCES`, `FALLBACK_I18N_RESOURCES`, `buildI18nResources`, and the old namespace constant. Keep the resource/result types introduced in Task 3 exactly once in this file and leave `i18n.backend.ts` importing them:

```ts
import {
	createInstance,
	type i18n as I18nInstance,
	type Resource,
} from 'i18next';
import { initReactI18next } from 'react-i18next';

import type { SupportedNamespace } from './i18n.namespaces';

export type JsonValue = string | { [key: string]: JsonValue };
export type NamespaceResource = Record<string, JsonValue>;
export type I18nResources = Partial<
	Record<
		SupportedLanguage,
		Partial<Record<SupportedNamespace, NamespaceResource>>
	>
>;
export type I18nLoadResult = {
	namespaces: SupportedNamespace[];
	resources: I18nResources;
	namespaceLoadError: string | null;
};

export const createI18nFromResources = (
	locale: SupportedLanguage,
	namespaces: readonly SupportedNamespace[],
	resources: I18nResources,
): I18nInstance => {
	const instance = createInstance();
	void instance.use(initReactI18next).init({
		lng: locale,
		fallbackLng: false,
		supportedLngs: [...SUPPORTED_LANGUAGES],
		defaultNS: 'common',
		ns: [...namespaces],
		resources: resources as Resource,
		interpolation: { escapeValue: false },
		react: { useSuspense: false },
		initImmediate: false,
	});
	return instance;
};
```

`apps/front-2/src/lib/i18n.server.ts` now exports only `normalizeLocale` and `resolveLocaleFromCookie`; delete `export { buildI18nResources } from './i18n.shared'`. In its test, delete the two `buildI18nResources` tests while retaining both cookie tests.

Delete the en/fr value imports, `embeddedResources`, and the `i18next` singleton import. Make the hydrated instance mandatory; it is already synchronously initialized by `RootShell`:

```ts
let activeClientI18n: I18nInstance | undefined;
let activeLocale: SupportedLanguage = FALLBACK_LANGUAGE;
let interZodClient: InterZod | undefined;

export const getInterZodClient = (): InterZod => {
	if (!interZodClient) {
		throw new Error('Client i18n has not been initialized');
	}
	return interZodClient;
};

export const initI18nOnClient = async (
	instance: I18nInstance,
): Promise<I18nInstance> => {
	const htmlLocale =
		typeof document !== 'undefined' ? document.documentElement.lang : undefined;
	const locale = resolveLocale(
		isSupportedLanguage(htmlLocale) ? htmlLocale : instance.resolvedLanguage,
	);
	if (activeClientI18n === instance && activeLocale === locale) {
		return instance;
	}
	activeClientI18n = instance;
	activeLocale = locale;
	interZodClient = bindInterZodToI18n(instance, locale);
	z.setErrorMap(interZodClient.getErrorMap());
	return instance;
};
```

Keep `bindInterZodToI18n` and `resolveLocale`; remove `initialized` and every `.init(...)` branch. This guarantees the client initializer never imports or reinstalls translation resources.

- [ ] **Step 4: Validate SSR namespace input and replace root resolution with matched loading**

Replace `loadI18nForRequest` in `apps/front-2/src/server/i18n-locale.ts` with:

```ts
const LoadI18nInputSchema = z.object({
	namespaces: I18nNamespaceListSchema,
});

type LoadI18nInput = z.infer<typeof LoadI18nInputSchema>;

export const loadI18nForRequest = createServerFn({ method: 'GET' })
	.validator((data): LoadI18nInput => LoadI18nInputSchema.parse(data))
	.handler(async ({ data }) => {
		const locale = resolveLocaleFromCookie();
		const instance = await createBackendI18n(locale);
		return {
			locale,
			...(await loadI18nContext(instance, locale, data.namespaces)),
		};
	});
```

Import `createBackendI18n`/`loadI18nContext` and `I18nNamespaceListSchema`; remove `buildI18nResources`. Keep `setLocale` unchanged. The validator matters even though current calls are SSR-inline because every server function remains client-callable.

In `apps/front-2/src/routes/__root.tsx`, add `namespaces` and `namespaceLoadError` to `RootRouteContext`. Import `collectI18nNamespaces`, backend helpers, the route-match/namespace types, and the i18next instance type. Replace the old locale-only map and resolver with:

```ts
const clientLoadingInstanceByLocale = new Map<
	SupportedLanguage,
	Promise<I18nInstance>
>();
const clientRootContextByKey = new Map<string, Promise<RootRouteContext>>();

const getClientLoadingInstance = (locale: SupportedLanguage) => {
	const cached = clientLoadingInstanceByLocale.get(locale);
	if (cached) return cached;
	const pending = createBackendI18n(locale);
	clientLoadingInstanceByLocale.set(locale, pending);
	return pending;
};

const loadClientRootContext = (
	locale: SupportedLanguage,
	namespaces: readonly SupportedNamespace[],
): Promise<RootRouteContext> => {
	const key = `${locale}:${namespaces.join('|')}`;
	const cached = clientRootContextByKey.get(key);
	if (cached) return cached;
	const pending = getClientLoadingInstance(locale).then(async (instance) => ({
		locale,
		...(await loadI18nContext(instance, locale, namespaces)),
	}));
	clientRootContextByKey.set(key, pending);
	void pending.then((context) => {
		if (context.namespaceLoadError) clientRootContextByKey.delete(key);
	});
	return pending;
};

const resolveRootContext = async ({
	matches,
}: {
	matches: readonly I18nRouteMatch[];
}): Promise<RootRouteContext> => {
	const namespaces = collectI18nNamespaces(matches);
	if (typeof document === 'undefined') {
		return loadI18nForRequest({ data: { namespaces } });
	}
	const cookieLocale = parseCookie(document.cookie)[LOCALE_COOKIE_KEY];
	const locale = isSupportedLanguage(cookieLocale)
		? cookieLocale
		: isSupportedLanguage(document.documentElement.lang)
			? document.documentElement.lang
			: FALLBACK_LANGUAGE;
	return loadClientRootContext(locale, namespaces);
};
```

Do not add any client call to `loadI18nForRequest`. The persistent loading instance avoids re-importing globals and hover-preloaded namespaces; the cached root value stays stable for the exact locale/set.

Select `namespaces` in `RootShell` and build the provider synchronously from the dehydrated snapshot:

```ts
const i18n = React.useMemo(
	() => createI18nFromResources(locale, namespaces, resources),
	[locale, namespaces, resources],
);
```

The snapshot remains plain data in root `__beforeLoadContext`; never put an i18next instance there. Make `RootComponent` turn the serializable load failure into the existing root error boundary only after `RootShell` has mounted the global provider:

```tsx
function RootComponent() {
	const namespaceLoadError = Route.useRouteContext({
		select: (context) => context.namespaceLoadError,
	});
	if (namespaceLoadError) {
		throw new Error(namespaceLoadError);
	}
	return <Outlet />;
}
```

Keep `RootShell` outside success/error/not-found, keep `react.useSuspense: false`, and keep resolver load failures as returned context rather than throws.

- [ ] **Step 5: Migrate every remaining old-API consumer in the same change**

In `apps/front-2/src/server.ts`, replace the old i18n imports with:

```ts
import { createBackendI18n, loadNamespacesStrict } from './lib/i18n.backend';
import { GLOBAL_I18N_NAMESPACES } from './lib/i18n.namespaces';
import { resolveLocaleFromCookie } from './lib/i18n.server';
import type { SupportedLanguage } from './lib/i18n.shared';
```

Replace the complete SEO translator function with the request-local backend path below. This loads only the global namespaces for the active locale, keeps all SEO keys in `common`, and does not introduce a server-function call:

```ts
export const resolveSeoTranslator = async (
	locale: SupportedLanguage,
): Promise<SeoTranslator> => {
	const instance = await createBackendI18n(locale);
	await loadNamespacesStrict(instance, GLOBAL_I18N_NAMESPACES);
	const t = instance.getFixedT(locale, 'common');
	return (key: string) => t(key as never);
};
```

In `apps/front-2/src/routes/__root-error-boundary.test.tsx`, remove the `buildI18nResources` import. Import the manifests, registry, and locale type, then add a plain active-language global snapshot helper:

```ts
import enResource from '~/i18n/locales/en';
import frResource from '~/i18n/locales/fr';
import { GLOBAL_I18N_NAMESPACES } from '~/lib/i18n.namespaces';
import type { SupportedLanguage } from '~/lib/i18n.shared';

const makeRootI18nContext = (locale: SupportedLanguage) => {
	const resource = locale === 'fr' ? frResource : enResource;
	return {
		locale,
		namespaces: [...GLOBAL_I18N_NAMESPACES],
		resources: {
			[locale]: {
				common: resource.common,
				zod: resource.zod,
				'response-message': resource['response-message'],
			},
		},
		namespaceLoadError: null,
	};
};
```

Replace the three successful `mockResolvedValue({ locale, resources: await buildI18nResources(locale) })` calls with `mockResolvedValue(makeRootI18nContext(locale))`. Replace the obsolete rejection/fallback case with the server loader's actual fallback contract:

```ts
test('an unknown route renders English when server locale resolution falls back', async () => {
	mocks.loadI18nForRequest.mockResolvedValue(makeRootI18nContext('en'));

	const html = await renderRoute('/nowhere', false);

	expect(html).toMatch(/<html[^>]*lang="en"/);
	expect(html).toContain('</head>');
	expect(html).toContain('Page not found');
});
```

In `apps/front-2/src/lib/mutation-toast.test.ts`, keep the existing `createI18nFromResources` import and replace `makeI18n` with the new three-argument, active-language-only snapshot:

```ts
const makeI18n = () =>
	createI18nFromResources('fr', ['common', 'response-message'], {
		fr: {
			common: {
				'an-error-occurred': 'Une erreur est survenue',
				'frontend-success': 'Succès frontend',
			},
			'response-message': {
				'backend-success': 'Succès backend',
				'backend-failure': 'Échec backend',
			},
		},
	});
```

In `apps/front-2/src/components/field/field.test.tsx`, remove `buildI18nResources`, import the two shared Zod JSON files, and replace the async helper with an explicit one-namespace snapshot:

```ts
import zodEn from '@org/shared-ts/lib/i18n/json/zod.en.json';
import zodFr from '@org/shared-ts/lib/i18n/json/zod.fr.json';

const zodResources = { en: zodEn, fr: zodFr } as const;

const configureInterZodLocale = (locale: 'en' | 'fr') => {
	const i18n = createI18nFromResources(locale, ['zod'], {
		[locale]: { zod: zodResources[locale] },
	});
	const interZod = new InterZod({
		i18n: {
			getFixedT: i18n.getFixedT.bind(i18n),
			t: i18n.t.bind(i18n) as never,
		},
		locale,
	});

	z.setErrorMap(interZod.getErrorMap());
};
```

Change both `await configureInterZodLocale(...)` calls to direct synchronous calls. After this step, a repository search for `buildI18nResources`, `FALLBACK_I18N_RESOURCES`, or a two-argument `createI18nFromResources` call under `apps/front-2/src` must return no matches.

- [ ] **Step 6: Run the atomic task verification floor**

Run:

```bash
pnpm --filter front-2 exec vitest run src/lib/i18n.shared.test.ts src/lib/i18n.server.test.ts src/lib/i18n.backend.test.ts src/routes/__root-i18n-context.test.ts src/routes/__root-error-boundary.test.tsx src/lib/mutation-toast.test.ts src/components/field/field.test.tsx src/server.test.ts
```

Expected: PASS.

Run:

```bash
npx oxlint apps/front-2/src/lib/i18n.shared.ts apps/front-2/src/lib/i18n.shared.test.ts apps/front-2/src/lib/i18n.client.ts apps/front-2/src/lib/i18n.server.ts apps/front-2/src/lib/i18n.server.test.ts apps/front-2/src/lib/i18n.backend.ts apps/front-2/src/server/i18n-locale.ts apps/front-2/src/routes/__root.tsx apps/front-2/src/routes/__root-i18n-context.test.ts apps/front-2/src/routes/__root-error-boundary.test.tsx apps/front-2/src/server.ts apps/front-2/src/lib/mutation-toast.test.ts apps/front-2/src/components/field/field.test.tsx
```

Expected: 0 errors.

Run: `pnpm --filter front-2 typecheck`

Expected: PASS with the removed exports and new three-argument constructor fully migrated across every source and test consumer.

- [ ] **Step 7: Commit the API removal and all consumers atomically**

```bash
git add apps/front-2/src/lib/i18n.shared.ts apps/front-2/src/lib/i18n.shared.test.ts apps/front-2/src/lib/i18n.client.ts apps/front-2/src/lib/i18n.server.ts apps/front-2/src/lib/i18n.server.test.ts apps/front-2/src/lib/i18n.backend.ts apps/front-2/src/server/i18n-locale.ts apps/front-2/src/routes/__root.tsx apps/front-2/src/routes/__root-i18n-context.test.ts apps/front-2/src/routes/__root-error-boundary.test.tsx apps/front-2/src/server.ts apps/front-2/src/lib/mutation-toast.test.ts apps/front-2/src/components/field/field.test.tsx
git commit -m "feat(front-2): load matched i18n namespaces"
```

### Task 5: Namespace-aware Translation Key Coverage

**Files:**
- Modify: `apps/front-2/src/lib/i18n-key-coverage.test.ts`

- [ ] **Step 1: Add a failing namespace canary**

Add a small pure `resolveUsageKey(rawKey, defaultNamespace)` helper test before changing the extractor:

```ts
test('attributes unqualified and explicitly qualified keys to their namespaces', () => {
	expect(resolveUsageKey('sign-in', 'auth')).toEqual({
		namespace: 'auth',
		key: 'sign-in',
	});
	expect(resolveUsageKey('common:retry', 'auth')).toEqual({
		namespace: 'common',
		key: 'retry',
	});
});
```

Run: `pnpm --filter front-2 exec vitest run src/lib/i18n-key-coverage.test.ts`

Expected: FAIL because `resolveUsageKey` and namespace-aware bundles do not exist.

- [ ] **Step 2: Make extraction and assertions namespace-aware**

Replace shared locale imports with `~/i18n/locales/en` and `~/i18n/locales/fr`. Widen key patterns to include `:` and infer the file default from its hook:

```ts
const KEY_PATTERNS = [
	/\bt\(\s*(['"])([a-zA-Z0-9_.:-]+)\1/g,
	/\bi18nKey=(['"])([a-zA-Z0-9_.:-]+)\1/g,
];
const USE_TRANSLATION_PATTERN =
	/\buseTranslation\(\s*(?:\[\s*)?(['"])([a-zA-Z0-9_.-]+)\1/;

type UsageKey = { namespace: SupportedNamespace; key: string };

const resolveUsageKey = (
	rawKey: string,
	defaultNamespace: SupportedNamespace,
): UsageKey => {
	const separator = rawKey.indexOf(':');
	if (separator === -1) return { namespace: defaultNamespace, key: rawKey };
	return {
		namespace: rawKey.slice(0, separator) as SupportedNamespace,
		key: rawKey.slice(separator + 1),
	};
};
```

For each source file, set `defaultNamespace` from `USE_TRANSLATION_PATTERN` or `'common'`; store usages under `${namespace}:${key}`. Pass that namespace into `extractKeyMapLiteralUsages` and `extractScalarKeyDeclarations` so indirect `_I18N_KEYS` values use the file namespace. Replace the final test with:

```ts
test('every t()/i18nKey literal resolves in its namespace in both locales', async () => {
	const usages = await extractI18nKeyUsages(srcDir);
	const missingEn: string[] = [];
	const missingFr: string[] = [];
	for (const [qualifiedKey, locations] of usages) {
		const [namespace, ...parts] = qualifiedKey.split(':');
		const key = parts.join(':');
		if (!resolvesInBundle(key, enResource[namespace as SupportedNamespace])) {
			missingEn.push(`${qualifiedKey} (${locations.join(', ')})`);
		}
		if (!resolvesInBundle(key, frResource[namespace as SupportedNamespace])) {
			missingFr.push(`${qualifiedKey} (${locations.join(', ')})`);
		}
	}
	expect(missingEn, 'keys missing from English namespace bundles').toEqual([]);
	expect(missingFr, 'keys missing from French namespace bundles').toEqual([]);
});
```

- [ ] **Step 3: Run the task verification floor**

Run: `pnpm --filter front-2 exec vitest run src/lib/i18n-key-coverage.test.ts`

Expected: PASS against the still-common route call sites.

Run: `npx oxlint apps/front-2/src/lib/i18n-key-coverage.test.ts`

Expected: 0 errors.

Run: `pnpm --filter front-2 typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/front-2/src/lib/i18n-key-coverage.test.ts
git commit -m "test(front-2): cover namespaced i18n keys"
```

### Task 6: Extract the Auth Namespace and Declare the Five Routes

**Files:**
- Modify: `apps/front-2/src/i18n/locales/en/common.json`
- Modify: `apps/front-2/src/i18n/locales/fr/common.json`
- Modify: `apps/front-2/src/i18n/locales/en/auth.json`
- Modify: `apps/front-2/src/i18n/locales/fr/auth.json`
- Modify: `apps/front-2/src/routes/login.tsx`
- Modify: `apps/front-2/src/routes/signup.tsx`
- Modify: `apps/front-2/src/routes/reset-password.tsx`
- Modify: `apps/front-2/src/routes/verify-email.tsx`
- Modify: `apps/front-2/src/routes/accept-invitation.tsx`
- Test: `apps/front-2/src/routes/login.test.tsx`
- Test: `apps/front-2/src/routes/signup.test.tsx`
- Test: `apps/front-2/src/routes/reset-password.test.tsx`
- Test: `apps/front-2/src/routes/verify-email.test.tsx`
- Test: `apps/front-2/src/routes/accept-invitation.test.tsx`
- Test: `apps/front-2/src/lib/i18n-key-coverage.test.ts`
- Test: `apps/front-2/src/i18n/locales/locales.test.ts`
- Create/Test: `apps/front-2/e2e/i18n-namespaces.spec.ts`

- [ ] **Step 1: Add failing static-data assertions to all five existing route tests**

Add this assertion inside each route's top-level `describe`, using that test file's existing imported `Route`:

```ts
test('declares the auth i18n namespace', () => {
	expect(Route.options.staticData).toEqual({ i18nNamespaces: ['auth'] });
});
```

Run:

```bash
pnpm --filter front-2 exec vitest run src/routes/login.test.tsx src/routes/signup.test.tsx src/routes/reset-password.test.tsx src/routes/verify-email.test.tsx src/routes/accept-invitation.test.tsx
```

Expected: FAIL in five new assertions because all route `staticData` values are currently undefined.

- [ ] **Step 2: Use this audited call-site inventory while editing**

The current route files contain 18 `useTranslation('common')` hooks: login 2, signup 2, reset-password 4, verify-email 1, accept-invitation 9. Change every one to `useTranslation(['auth', 'common'])`; `auth` is the primary namespace, and including `common` makes explicit `common:<key>` calls type-safe without namespace fallback. Literal calls currently resolve these keys:

- `login.tsx`: `authentication-required`, `back-to-login`, `create-one`, `email-address`, `email-placeholder`, `enter-valid-email-address`, `enter-valid-email-and-password`, `enter-your-password`, `error-401-code`, `error-500-code`, `forgot-password`, `go-to-home`, `invalid-credentials-description`, `login-request-unauthorized-description`, `no-account-yet`, `password`, `password-is-required`, `password-reset-success`, `retry`, `session-expired-notice`, `sign-in`, `sign-in-could-not-be-completed`, `sign-in-failed-check-credentials`, `sign-in-to-pick-up-where-you-left-off`, `signing-in`, `something-went-wrong`, `welcome-back`.
- `signup.tsx`: `already-have-account-question`, `an-error-occurred`, `and`, `auth-first-name`, `auth-last-name`, `by-signing-up-agree`, `create-account`, `create-your-account`, `email-address`, `email-placeholder`, `enter-valid-email-address`, `first-name-required`, `last-name-required`, `log-in`, `password`, `password-min-length-hint-n`, `privacy-policy`, `signup-closed-notice`, `terms-of-service`.
- `reset-password.tsx`: `an-error-occurred`, `back-to-sign-in`, `confirm-password`, `email-address`, `email-placeholder`, `email-verification-success`, `enter-valid-email-address`, `invalid-reset-link-description`, `new-password`, `password-is-required`, `password-min-length-hint-n`, `password-reset-success-description`, `password-reset-title`, `passwords-do-not-match`, `reset-link-sent-description`, `reset-link-sent-title`, `reset-password`, `reset-password-description`, `reset-password-request-description`, `reset-your-password`, `send-reset-link`, `set-a-new-password`.
- `verify-email.tsx`: `an-error-occurred`, `back-to-sign-in`, `email-address`, `email-placeholder`, `enter-valid-email-address`, `invalid-verification-link-description`, `verification-email-sent`, `verify-email`, `verify-email-sent-description`, `verify-email-sent-hint`, `verify-your-email`, `verify-your-email-description`.
- `accept-invitation.tsx`: `accept-invitation-brand-eyebrow`, `accept-invitation-new-user-description`, `accept-invitation-not-you`, `accept-invitation-return-note`, `accept-invitation-title`, `an-error-occurred`, `auth-first-name`, `auth-invitation-existing-user-authenticated-description`, `auth-invitation-existing-user-login-description`, `auth-invitation-invalid`, `auth-invitation-invalid-description`, `auth-invitation-wrong-account-title`, `auth-last-name`, `common-loading`, `confirm-password`, `create-account`, `create-your-account`, `first-name-required`, `invited-email`, `join-organization`, `last-name-required`, `password`, `password-min-length-hint-n`, `passwords-do-not-match`, `profile`, `sign-in-to-continue`, `signed-in-as`, `try-again`.

The three literal `Trans` keys are `reset-link-sent-description`, `reset-password-description`, and `verify-email-sent-description`. Add `ns="auth"` to each. The invitation dynamic `Trans` also gets `ns="auth"`.

- [ ] **Step 3: Extract the exact auth-only key set in both languages**

Run this mechanical, deterministic move against the local copies (not shared-ts). It preserves the approved translations, writes sorted pretty JSON, and fails if either locale lacks a key:

```bash
node --input-type=module <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';

const AUTH_KEYS = [
	'accept-invitation-brand-eyebrow', 'accept-invitation-brand-headline-existing-match',
	'accept-invitation-brand-headline-existing-signed-out', 'accept-invitation-brand-headline-mismatch',
	'accept-invitation-brand-headline-new-user', 'accept-invitation-brand-subtitle-existing-match',
	'accept-invitation-brand-subtitle-existing-signed-out', 'accept-invitation-brand-subtitle-mismatch',
	'accept-invitation-brand-subtitle-new-user', 'accept-invitation-new-user-description',
	'accept-invitation-not-you', 'accept-invitation-return-note', 'accept-invitation-title',
	'already-have-account-question', 'and', 'auth-first-name',
	'auth-invitation-existing-user-authenticated-description',
	'auth-invitation-existing-user-login-description',
	'auth-invitation-existing-user-mismatch-description', 'auth-invitation-invalid',
	'auth-invitation-invalid-description', 'auth-invitation-log-out-and-continue',
	'auth-invitation-log-out-and-sign-in', 'auth-invitation-new-user-mismatch-description',
	'auth-invitation-wrong-account-title', 'auth-last-name', 'back-to-sign-in',
	'by-signing-up-agree', 'confirm-password', 'create-account', 'create-one',
	'create-your-account', 'email-verification-success', 'enter-valid-email-address',
	'enter-valid-email-and-password', 'enter-your-password', 'first-name-required',
	'forgot-password', 'invalid-credentials-description', 'invalid-reset-link-description',
	'invalid-verification-link-description', 'invited-email', 'join-organization',
	'last-name-required', 'log-in', 'login-request-unauthorized-description',
	'new-password', 'no-account-yet', 'password-is-required',
	'password-min-length-hint-n', 'password-reset-success',
	'password-reset-success-description', 'password-reset-title', 'passwords-do-not-match',
	'privacy-policy', 'reset-link-sent-description', 'reset-link-sent-title',
	'reset-password', 'reset-password-description', 'reset-password-request-description',
	'reset-your-password', 'send-reset-link', 'session-expired-notice',
	'set-a-new-password', 'sign-in-could-not-be-completed',
	'sign-in-failed-check-credentials', 'sign-in-to-continue',
	'sign-in-to-pick-up-where-you-left-off', 'signed-in-as', 'signing-in',
	'signup-closed-notice', 'terms-of-service', 'verification-email-sent',
	'verify-email', 'verify-email-sent-description', 'verify-email-sent-hint',
	'verify-your-email', 'verify-your-email-description', 'welcome-back',
];

for (const locale of ['en', 'fr']) {
	const base = `apps/front-2/src/i18n/locales/${locale}`;
	const common = JSON.parse(await readFile(`${base}/common.json`, 'utf8'));
	const auth = {};
	for (const key of AUTH_KEYS) {
		if (!(key in common)) throw new Error(`${locale}/common missing ${key}`);
		auth[key] = common[key];
		delete common[key];
	}
	await writeFile(`${base}/common.json`, `${JSON.stringify(common, null, '\t')}\n`);
	await writeFile(`${base}/auth.json`, `${JSON.stringify(auth, null, '\t')}\n`);
}
NODE
```

The 15 global keys used by auth files remain only in `common`: `an-error-occurred`, `authentication-required`, `back-to-login`, `common-loading`, `email-address`, `email-placeholder`, `error-401-code`, `error-500-code`, `go-to-home`, `password`, `profile`, `retry`, `sign-in`, `something-went-wrong`, `try-again`.

- [ ] **Step 4: Bind routes to auth and explicitly qualify retained globals**

Add this to each of the five `createFileRoute` option objects:

```ts
staticData: { i18nNamespaces: ['auth'] },
```

Change all 18 hooks to `useTranslation(['auth', 'common'])`. Change each retained-global call from `t('retry')` to the corresponding qualified form, for example `t('common:retry')`; apply this to every occurrence of the 15-key retained list. Add `ns="auth"` to all four `Trans` uses. Do not configure `fallbackNS`; every cross-namespace lookup remains explicit.

Replace the invitation's invisible ternary/dynamic tables with extractor-visible constants:

```ts
const INVITATION_MISMATCH_I18N_KEYS = {
	existing: {
		description: 'auth-invitation-existing-user-mismatch-description',
		cta: 'auth-invitation-log-out-and-sign-in',
	},
	newUser: {
		description: 'auth-invitation-new-user-mismatch-description',
		cta: 'auth-invitation-log-out-and-continue',
	},
} as const;

const INVITATION_BRAND_I18N_KEYS: Partial<
	Record<BranchKind, { headline: string; subtitle: string }>
> = {
	'new-user': {
		headline: 'accept-invitation-brand-headline-new-user',
		subtitle: 'accept-invitation-brand-subtitle-new-user',
	},
	'existing-match': {
		headline: 'accept-invitation-brand-headline-existing-match',
		subtitle: 'accept-invitation-brand-subtitle-existing-match',
	},
	'existing-signed-out': {
		headline: 'accept-invitation-brand-headline-existing-signed-out',
		subtitle: 'accept-invitation-brand-subtitle-existing-signed-out',
	},
	mismatch: {
		headline: 'accept-invitation-brand-headline-mismatch',
		subtitle: 'accept-invitation-brand-subtitle-mismatch',
	},
};
```

Select `INVITATION_MISMATCH_I18N_KEYS[userExists ? 'existing' : 'newUser']` once and use its `description`/`cta`; rename the existing brand lookup reference to `INVITATION_BRAND_I18N_KEYS`. Both names end in `_I18N_KEYS`, so Task 5's indirect-key collector verifies every value.

- [ ] **Step 5: Run the task verification floor**

Run:

```bash
pnpm --filter front-2 exec vitest run src/routes/login.test.tsx src/routes/signup.test.tsx src/routes/reset-password.test.tsx src/routes/verify-email.test.tsx src/routes/accept-invitation.test.tsx src/lib/i18n-key-coverage.test.ts src/i18n/locales/locales.test.ts
```

Expected: PASS, including five static-data assertions, namespace-aware key coverage, and exact en/fr parity.

Run: `npx oxlint apps/front-2/src/routes/login.tsx apps/front-2/src/routes/signup.tsx apps/front-2/src/routes/reset-password.tsx apps/front-2/src/routes/verify-email.tsx apps/front-2/src/routes/accept-invitation.tsx apps/front-2/src/routes/login.test.tsx apps/front-2/src/routes/signup.test.tsx apps/front-2/src/routes/reset-password.test.tsx apps/front-2/src/routes/verify-email.test.tsx apps/front-2/src/routes/accept-invitation.test.tsx apps/front-2/src/lib/i18n-key-coverage.test.ts apps/front-2/src/i18n/locales/en.ts apps/front-2/src/i18n/locales/fr.ts`

Expected: 0 errors.

Run: `pnpm --filter front-2 typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/front-2/src/i18n/locales apps/front-2/src/routes/login.tsx apps/front-2/src/routes/signup.tsx apps/front-2/src/routes/reset-password.tsx apps/front-2/src/routes/verify-email.tsx apps/front-2/src/routes/accept-invitation.tsx apps/front-2/src/routes/login.test.tsx apps/front-2/src/routes/signup.test.tsx apps/front-2/src/routes/reset-password.test.tsx apps/front-2/src/routes/verify-email.test.tsx apps/front-2/src/routes/accept-invitation.test.tsx apps/front-2/e2e/i18n-namespaces.spec.ts
git commit -m "feat(front-2): extract auth translations"
```

## Final production runtime verification

**Files:**
- Created in Task 6: `apps/front-2/e2e/i18n-namespaces.spec.ts`
- Test: `apps/front-2/e2e/i18n-namespaces.spec.ts`

Add this production-runtime coverage during Task 6 before moving the JSON/routes. The five new route assertions are the deterministic red test; this file supplies the production proof once the task is green.

```ts
import { expect, test } from '@playwright/test';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';

const cookie = (locale: 'en' | 'fr') => `${LOCALE_COOKIE_KEY}=${locale}`;

declare global {
	interface Window {
		recordEnglishFlash: (value: string) => void;
	}
}

test('French auth SSR contains French auth copy without English fallback', async ({
	request,
}) => {
	const response = await request.get('/login', {
		headers: { cookie: cookie('fr') },
	});
	const html = await response.text();
	expect(response.ok()).toBe(true);
	expect(html).toContain('Se connecter');
	expect(html).toContain('Pas encore de compte?');
	expect(html).not.toContain('No account yet?');
});

test('concurrent SSR requests do not leak locale resources', async ({ request }) => {
	const [english, french] = await Promise.all([
		request.get('/login', { headers: { cookie: cookie('en') } }),
		request.get('/login', { headers: { cookie: cookie('fr') } }),
	]);
	const [englishHtml, frenchHtml] = await Promise.all([
		english.text(),
		french.text(),
	]);
	expect(englishHtml).toContain('No account yet?');
	expect(englishHtml).not.toContain('Pas encore de compte?');
	expect(frenchHtml).toContain('Pas encore de compte?');
	expect(frenchHtml).not.toContain('No account yet?');
});

test('hydration preserves the SSR locale and auth copy', async ({ page }) => {
	await page.context().addCookies([
		{ name: LOCALE_COOKIE_KEY, value: 'fr', url: 'https://front-2.localhost:8443' },
	]);
	const englishFlash: string[] = [];
	await page.exposeFunction('recordEnglishFlash', (value: string) => {
		englishFlash.push(value);
	});
	await page.addInitScript(() => {
		new MutationObserver(() => {
			if (document.body?.textContent?.includes('No account yet?')) {
				void window.recordEnglishFlash('No account yet?');
			}
		}).observe(document.documentElement, { childList: true, subtree: true });
	});
	await page.goto('/login');
	await expect(page.getByRole('heading', { name: 'Se connecter' })).toBeVisible();
	await expect(page.getByText('Pas encore de compte?')).toBeVisible();
	expect(englishFlash).toEqual([]);
});
```

These tests run against the rebuilt production stack after Task 6.

### Build and run the focused e2e

Run: `pnpm --filter front-2 build`

Expected: PASS.

Run:

```bash
docker compose -f apps/front-2/docker-compose.test.yml down -v --remove-orphans
docker compose -f apps/front-2/docker-compose.test.yml up -d --build --wait --wait-timeout 180
pnpm --filter front-2 exec playwright test e2e/i18n-namespaces.spec.ts --project=chromium
```

Expected: PASS (3 tests).

### runtime-verify chunking, dehydration, hydration, and navigation behavior

Run each check against the production compose stack and save the Playwright trace/build listing as review evidence, not as committed artifacts:

1. Run `rg --files --hidden apps/front-2/.output | sort | rg '(auth|common|zod|response-message).*(en|fr)|(en|fr).*(auth|common|zod|response-message)'`. Confirm distinct locale/namespace output chunks and inspect the initial entry with `rg 'No account yet\?|Pas encore de compte\?' apps/front-2/.output/public`; neither auth translation may be embedded in the initial client entry.
2. Run `pnpm --filter front-2 exec playwright test e2e/i18n-namespaces.spec.ts --project=chromium --trace=on`. In the trace for French `/login`, inspect the root match payload: only `fr`, and exactly `common`, `zod`, `response-message`, `auth`. Confirm no namespace chunk or `loadI18nForRequest` request occurs after the document response during hydration.
3. Hover the `/login` link from `/` with `defaultPreload: 'intent'`, then click it. In the trace, confirm one client-side `auth` chunk import, no server-function request, no duplicate on commit, and that login content appears only after the delayed chunk response is released.
4. Cold-load one existing `ssr: false` authenticated deep link such as `/staff/staff-users`; confirm translated pending UI and first content use the dehydrated globals.
5. Exercise existing child-loader-throw and unmatched-route fault cases in `e2e/auth-error.spec.ts`/`e2e/shell.spec.ts`; confirm `RootShell` supplies translated common copy to both error and route-level not-found views.
6. Temporarily change the test-only backend call in `i18n.backend.test.ts` to `missing` (never commit a bad route declaration) and run the strict-error unit plus the root-context failure test. Confirm the result retains the active-locale `common`/`zod`/`response-message` provider and routes the serializable error through the root error view.
7. Switch `/login` from English to French and inspect the new root match payload: it changes atomically, contains only `fr`, and retains only the current matched namespace set.

### Run the final verification floor

Run: `npx oxlint apps/front-2/e2e/i18n-namespaces.spec.ts apps/front-2/src/lib/i18n*.ts apps/front-2/src/routes/__root.tsx apps/front-2/src/routes/login.tsx apps/front-2/src/routes/signup.tsx apps/front-2/src/routes/reset-password.tsx apps/front-2/src/routes/verify-email.tsx apps/front-2/src/routes/accept-invitation.tsx`

Expected: 0 errors.

Run: `pnpm --filter front-2 typecheck`

Expected: PASS.

Run: `pnpm --filter front-2 test`

Expected: PASS.

Run: `pnpm --filter front-2 build`

Expected: PASS with separate namespace chunks.

Run: `just ci-front-2`

Expected: PASS.

## Execution notes

- Execute this plan with `superpowers:subagent-driven-development`; use a fresh implementer per task and cross-family review after each task. The reviewer must not be from the implementer's model family.
- Preserve one green, independently reviewable commit per task. Do not squash while executing; do not push or merge without explicit authorization.
- The worktree intentionally has no `node_modules`; execution begins with the repository's pinned install path (`just ci-install` or the equivalent frozen pnpm install), not during plan drafting.
- Before the P1 PR, run `just ci` and the focused SSR-no-flash production e2e above. Then run `just ci-e2e-front-2` (or `just ci-full` when both frontend suites are required) so the focused proof is also covered in the full stack.
- Never modify shared-ts `common` or the legacy frontend in P1. P2 is only: register one feature namespace, add its JSON pair, declare it in route `staticData`, move its keys, and let the same backend/coverage/runtime path verify it.
