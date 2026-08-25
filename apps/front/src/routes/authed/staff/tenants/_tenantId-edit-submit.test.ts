import { describe, expect, test } from 'vitest';

import {
	buildTenantUpdatePayload,
	planTenantEditFieldErrors,
	resolvePreviewMaxUsers,
} from './_tenantId-edit-submit';
import {
	EMPTY_FORM_VALUES,
	type EditTenantFormValues,
} from './_tenantId-edit-types';

const values = (
	overrides: Partial<EditTenantFormValues> = {},
): EditTenantFormValues => ({ ...EMPTY_FORM_VALUES, ...overrides });

describe('buildTenantUpdatePayload', () => {
	test('sends only the tenant id when nothing is dirty', () => {
		expect(
			buildTenantUpdatePayload({
				tenantId: 'tenant-1',
				values: values({ name: 'Renamed' }),
				dirtyFields: {},
			}),
		).toEqual({ tenantId: 'tenant-1' });
	});

	test('trims a dirty name and drops it when it trims to empty', () => {
		expect(
			buildTenantUpdatePayload({
				tenantId: 'tenant-1',
				values: values({ name: '  Renamed  ' }),
				dirtyFields: { name: true },
			}).name,
		).toBe('Renamed');

		expect(
			'name' in
				buildTenantUpdatePayload({
					tenantId: 'tenant-1',
					values: values({ name: '   ' }),
					dirtyFields: { name: true },
				}),
		).toBe(false);
	});

	test('sends null for a dirty optional field the user cleared', () => {
		expect(
			buildTenantUpdatePayload({
				tenantId: 'tenant-1',
				values: values({ websiteUrl: '' }),
				dirtyFields: { websiteUrl: true },
			}).websiteUrl,
		).toBeNull();
	});

	test('carries a dirty seat count through unchanged', () => {
		expect(
			buildTenantUpdatePayload({
				tenantId: 'tenant-1',
				values: values({ maxUsers: 42 }),
				dirtyFields: { maxUsers: true },
			}).maxUsers,
		).toBe(42);
	});
});

describe('planTenantEditFieldErrors', () => {
	test('maps known form fields', () => {
		expect(
			planTenantEditFieldErrors({ notes: ['too long'] }, 'fallback'),
		).toEqual({
			fieldErrors: [{ field: 'notes', message: 'too long' }],
			rootMessage: null,
		});
	});

	test('treats a known field with no messages as a root message source', () => {
		expect(planTenantEditFieldErrors({ notes: [] }, 'fallback')).toEqual({
			fieldErrors: [],
			rootMessage: 'fallback',
		});
	});

	test('de-duplicates unmapped messages into one root message', () => {
		expect(
			planTenantEditFieldErrors(
				{ unknownOne: ['boom'], unknownTwo: ['boom', 'bang'] },
				'fallback',
			).rootMessage,
		).toBe('boom bang');
	});
});

describe('resolvePreviewMaxUsers', () => {
	test('uses the watched value when it is a positive number', () => {
		expect(resolvePreviewMaxUsers('25', 10)).toBe(25);
	});

	test('falls back to the persisted value for blank or invalid drafts', () => {
		expect(resolvePreviewMaxUsers('', 10)).toBe(10);
		expect(resolvePreviewMaxUsers('abc', 10)).toBe(10);
		expect(resolvePreviewMaxUsers(0, 10)).toBe(10);
		expect(resolvePreviewMaxUsers(-3, 10)).toBe(10);
	});
});
