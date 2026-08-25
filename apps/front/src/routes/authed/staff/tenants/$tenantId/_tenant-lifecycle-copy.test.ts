import { describe, expect, test } from 'vitest';

import {
	resolveLifecycleDescription,
	resolveLifecycleTitle,
} from './_tenant-lifecycle-copy';

const t = (key: string, options?: Record<string, unknown>): string =>
	options && 'name' in options ? `${key}:${String(options.name)}` : key;

describe('resolveLifecycleTitle', () => {
	test('returns the suspend title when the tenant is active', () => {
		expect(
			resolveLifecycleTitle({ isActive: true, isSuspended: false, t }),
		).toBe('suspend-tenant');
	});

	test('returns the reactivate title when the tenant is suspended', () => {
		expect(
			resolveLifecycleTitle({ isActive: false, isSuspended: true, t }),
		).toBe('reactivate-tenant');
	});

	test('returns the unavailable title for any other status', () => {
		expect(
			resolveLifecycleTitle({ isActive: false, isSuspended: false, t }),
		).toBe('lifecycle-unavailable-title');
	});
});

describe('resolveLifecycleDescription', () => {
	test('interpolates the tenant name when the tenant is active', () => {
		expect(
			resolveLifecycleDescription({
				isActive: true,
				isSuspended: false,
				tenantName: 'Acme',
				t,
			}),
		).toBe('suspend-tenant-confirm:Acme');
	});

	test('interpolates the tenant name when the tenant is suspended', () => {
		expect(
			resolveLifecycleDescription({
				isActive: false,
				isSuspended: true,
				tenantName: 'Acme',
				t,
			}),
		).toBe('reactivate-tenant-confirm:Acme');
	});

	test('falls back to the unavailable copy for any other status', () => {
		expect(
			resolveLifecycleDescription({
				isActive: false,
				isSuspended: false,
				tenantName: 'Acme',
				t,
			}),
		).toBe('lifecycle-unavailable-until-tenant-activates');
	});
});
