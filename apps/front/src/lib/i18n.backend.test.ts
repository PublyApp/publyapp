import { createInstance } from 'i18next';
import { describe, expect, test, vi } from 'vitest';

import {
	createBackendI18n,
	i18nBackend,
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
		let value: unknown = resource;
		for (const part of key.split('.')) {
			value =
				typeof value === 'object' && value !== null
					? (value as Record<string, unknown>)[part]
					: undefined;
		}
		expect(value).toBe(expected);
	});

	// Exercised through i18nBackend.read, whose i18next signature takes raw
	// strings: an out-of-contract loader key arrives here exactly like it
	// would from the real backend pipeline, no type assertion needed.
	test('rejects an unknown locale/namespace loader key', async () => {
		const failure = await new Promise<unknown>((resolve) => {
			i18nBackend.read('en', 'missing', (error) => resolve(error));
		});

		if (!(failure instanceof Error)) {
			throw new Error('expected the backend read to fail with an Error');
		}
		expect(failure.message).toBe('Unknown i18n resource: en/missing');
	});

	test('rejects when i18next reports a callback error', async () => {
		const instance = createInstance();
		vi.spyOn(instance, 'loadNamespaces').mockImplementation((_ns, callback) => {
			callback?.(new Error('chunk failed'), instance.t);
			return Promise.resolve();
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
