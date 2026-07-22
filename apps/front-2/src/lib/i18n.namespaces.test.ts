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
				{ staticData: { i18nNamespaces: ['staff-users'] } },
				{ staticData: { i18nNamespaces: ['auth'] } },
				{ staticData: { i18nNamespaces: ['staff-users'] } },
			]),
		).toEqual([...GLOBAL_I18N_NAMESPACES, 'auth', 'staff-users']);
	});

	test('validates only registered server-function input', () => {
		expect(I18nNamespaceListSchema.parse([...I18N_NAMESPACES])).toEqual([
			...I18N_NAMESPACES,
		]);
		expect(
			I18nNamespaceListSchema.safeParse(['common', 'unknown']).success,
		).toBe(false);
	});
});
