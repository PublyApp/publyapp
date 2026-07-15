import { describe, expect, test, vi } from 'vitest';

vi.mock('./client-manager', () => ({
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

import {
	normalizeNullableFileUrl,
	resolveApiFileUrl,
	toRootRelativeApiFileUrl,
} from './resolve-api-file-url';

describe('resolveApiFileUrl', () => {
	test('absolutizes a root-relative /files/ path against the API origin', () => {
		expect(resolveApiFileUrl('/files/uploads/2026/07/logo.png')).toBe(
			'https://api.example.test/files/uploads/2026/07/logo.png',
		);
	});

	test('passes an already-absolute http(s) url through unchanged', () => {
		expect(resolveApiFileUrl('https://cdn.example.com/acme-logo.png')).toBe(
			'https://cdn.example.com/acme-logo.png',
		);
	});

	test('passes an empty string through unchanged', () => {
		expect(resolveApiFileUrl('')).toBe('');
	});

	test('leaves a non-/files/ root-relative path unchanged', () => {
		expect(resolveApiFileUrl('/staff/tenants')).toBe('/staff/tenants');
	});
});

describe('toRootRelativeApiFileUrl', () => {
	test('strips the API origin off a same-origin /files/ url', () => {
		expect(
			toRootRelativeApiFileUrl(
				'https://api.example.test/files/uploads/2026/07/logo.png',
			),
		).toBe('/files/uploads/2026/07/logo.png');
	});

	test('leaves an externally hosted absolute url unchanged', () => {
		expect(
			toRootRelativeApiFileUrl('https://cdn.example.com/acme-logo.png'),
		).toBe('https://cdn.example.com/acme-logo.png');
	});

	test('leaves an already root-relative /files/ path unchanged', () => {
		expect(toRootRelativeApiFileUrl('/files/uploads/2026/07/logo.png')).toBe(
			'/files/uploads/2026/07/logo.png',
		);
	});

	test('leaves an empty string unchanged', () => {
		expect(toRootRelativeApiFileUrl('')).toBe('');
	});

	test('leaves a same-origin url outside /files/ unchanged', () => {
		expect(
			toRootRelativeApiFileUrl('https://api.example.test/staff/tenants'),
		).toBe('https://api.example.test/staff/tenants');
	});
});

describe('normalizeNullableFileUrl', () => {
	test('trims and absolutizes a root-relative /files/ path', () => {
		expect(normalizeNullableFileUrl('  /files/uploads/avatar.png  ')).toBe(
			'https://api.example.test/files/uploads/avatar.png',
		);
	});

	test('returns null for null, undefined, and blank input', () => {
		expect(normalizeNullableFileUrl(null)).toBeNull();
		expect(normalizeNullableFileUrl(undefined)).toBeNull();
		expect(normalizeNullableFileUrl('   ')).toBeNull();
	});

	test('passes an externally hosted absolute url through unchanged', () => {
		expect(normalizeNullableFileUrl('https://cdn.example.com/avatar.png')).toBe(
			'https://cdn.example.com/avatar.png',
		);
	});
});
