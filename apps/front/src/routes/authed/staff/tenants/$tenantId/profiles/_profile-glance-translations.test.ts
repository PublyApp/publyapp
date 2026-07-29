/**
 * review-ui-fidelity.md MINOR ("visual regression coverage has specific
 * blind spots"): every component/route test exercising
 * `profile-glance-module-count` hand-builds its own translation map, so none
 * of them can prove the REAL `en`/`fr` `staff-tenant-profiles` locale JSON
 * pluralises correctly — only that whatever fixture dictionary the test
 * wrote resolves the way that same test wrote it.
 *
 * This loads the real locale resources through a real i18next instance
 * (`createBackendI18n`, the same backend the app uses to fetch namespace
 * JSON) and lets i18next's built-in `Intl.PluralRules` selection pick the
 * plural form for each locale, exactly as the deployed app does — closing
 * that gap and independently verifying French, whose plural rule differs
 * from English (French treats a count of 0 *and* 1 as singular; English
 * treats only 1 as singular — see the Intl.PluralRules assertions below).
 */
import { describe, expect, test } from 'vitest';
import { createBackendI18n, loadNamespacesStrict } from '~/lib/i18n.backend';

describe("Intl.PluralRules disagree between en and fr (the premise this key's plural split depends on)", () => {
	test('fr treats both 0 and 1 as singular ("one"); en treats only 1 as singular', () => {
		expect(new Intl.PluralRules('en').select(0)).toBe('other');
		expect(new Intl.PluralRules('en').select(1)).toBe('one');
		expect(new Intl.PluralRules('en').select(2)).toBe('other');
		expect(new Intl.PluralRules('fr').select(0)).toBe('one');
		expect(new Intl.PluralRules('fr').select(1)).toBe('one');
		expect(new Intl.PluralRules('fr').select(2)).toBe('other');
	});
});

describe('profile-glance-module-count resolves through the real locale resources', () => {
	test.each([
		[
			'en',
			{ module: 'Billing', granted: 0, total: 1 },
			'Billing: 0 of 1 permission granted',
		],
		[
			'en',
			{ module: 'Users', granted: 1, total: 2 },
			'Users: 1 of 2 permissions granted',
		],
		// total=0 is unreachable through buildProfilePermissionGlance in
		// production (a zero-permission module is dropped upstream by
		// buildStaffTenantPermissionCatalogGroups), but the translation key
		// itself must still resolve sensibly if ever called directly.
		[
			'en',
			{ module: 'Empty', granted: 0, total: 0 },
			'Empty: 0 of 0 permissions granted',
		],
		// French: total=1 is singular ("permission accordée"), same as
		// English, but for a different underlying CLDR reason (see the
		// Intl.PluralRules describe block above) — and total=0 diverges
		// from English precisely because French also treats 0 as singular.
		[
			'fr',
			{ module: 'Billing', granted: 0, total: 1 },
			'Billing : 0 sur 1 permission accordée',
		],
		[
			'fr',
			{ module: 'Users', granted: 1, total: 2 },
			'Users : 1 sur 2 permissions accordées',
		],
		[
			'fr',
			{ module: 'Empty', granted: 0, total: 0 },
			'Empty : 0 sur 0 permission accordée',
		],
	] as const)('%s, %j -> %s', async (locale, vars, expected) => {
		const instance = await createBackendI18n(locale);
		await loadNamespacesStrict(instance, ['staff-tenant-profiles']);

		const text = instance.t(
			'staff-tenant-profiles:profile-glance-module-count',
			{
				module: vars.module,
				granted: vars.granted,
				total: vars.total,
				count: vars.total,
			},
		);

		expect(text).toBe(expected);
	});
});
