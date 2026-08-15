import { describe, expect, test, vi } from 'vitest';

import {
	buildUpdateTenantSettingsGeneralBody,
	toTenantSettingsGeneral,
} from './tenant-settings-general';

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateClient: vi.fn(),
	}),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

const unwrapUntyped = (value: unknown): unknown => {
	if (
		typeof value === 'object' &&
		value !== null &&
		'getValue' in value &&
		typeof (value as { getValue: unknown }).getValue === 'function'
	) {
		return (value as { getValue: () => unknown }).getValue();
	}

	return value;
};

describe('toTenantSettingsGeneral', () => {
	test('normalizes a full settings result', () => {
		expect(
			toTenantSettingsGeneral({
				id: 'tenant-1',
				code: 'acme-corp',
				name: ' Acme Corporation ',
				logoUrl:
					'/files/uploads/2026/08/11111111-2222-3333-4444-555555555555.png',
				legalName: 'Acme Corporation SA',
				description: ' The Acme description ',
				websiteUrl: 'https://acme.example.com',
				billingEmail: 'billing@acme.example.com',
				supportEmail: 'support@acme.example.com',
				defaultLocale: 'en',
				timezone: 'Europe/Paris',
			}),
		).toEqual({
			id: 'tenant-1',
			code: 'acme-corp',
			name: 'Acme Corporation',
			logoUrl:
				'https://api.example.test/files/uploads/2026/08/11111111-2222-3333-4444-555555555555.png',
			legalName: 'Acme Corporation SA',
			description: 'The Acme description',
			websiteUrl: 'https://acme.example.com',
			billingEmail: 'billing@acme.example.com',
			supportEmail: 'support@acme.example.com',
			defaultLocale: 'en',
			timezone: 'Europe/Paris',
		});
	});

	test('returns null without a usable id', () => {
		expect(toTenantSettingsGeneral(undefined)).toBeNull();
		expect(toTenantSettingsGeneral({ id: null, name: 'X' })).toBeNull();
	});

	test('handles nulled optional fields', () => {
		const settings = toTenantSettingsGeneral({
			id: 'tenant-1',
			name: 'Acme',
			logoUrl: null,
			legalName: null,
			description: null,
			websiteUrl: null,
			billingEmail: null,
			supportEmail: null,
			defaultLocale: null,
			timezone: null,
		});

		expect(settings).not.toBeNull();
		expect(settings?.logoUrl).toBeNull();
		expect(settings?.defaultLocale).toBeNull();
		expect(settings?.timezone).toBeNull();
	});
});

describe('buildUpdateTenantSettingsGeneralBody', () => {
	test('omits absent fields and clears with null', () => {
		expect(
			buildUpdateTenantSettingsGeneralBody({
				tenantId: 't-1',
				name: 'Acme Corp',
				description: null,
			}),
		).toEqual({
			name: expect.anything(),
			description: null,
		});
	});

	test('drops whitespace-only name so it is never sent', () => {
		expect(
			buildUpdateTenantSettingsGeneralBody({
				tenantId: 't-1',
				name: '   ',
			}),
		).toEqual({});
	});

	test('strips the API origin off a same-origin /files/ logo before sending', () => {
		expect(
			unwrapUntyped(
				buildUpdateTenantSettingsGeneralBody({
					tenantId: 't-1',
					logoUrl:
						'https://api.example.test/files/uploads/2026/08/11111111-2222-3333-4444-555555555555.png',
				}).logoUrl,
			),
		).toBe('/files/uploads/2026/08/11111111-2222-3333-4444-555555555555.png');
	});

	test('leaves an externally hosted logo URL untouched', () => {
		expect(
			unwrapUntyped(
				buildUpdateTenantSettingsGeneralBody({
					tenantId: 't-1',
					logoUrl: 'https://cdn.example.com/logo.png',
				}).logoUrl,
			),
		).toBe('https://cdn.example.com/logo.png');
	});

	test('trims whitespace-only values down to a clear', () => {
		expect(
			buildUpdateTenantSettingsGeneralBody({
				tenantId: 't-1',
				websiteUrl: '   ',
			}).websiteUrl,
		).toBeNull();
	});

	test('produces an empty body for an empty input', () => {
		expect(buildUpdateTenantSettingsGeneralBody({ tenantId: 't-1' })).toEqual(
			{},
		);
	});
});
