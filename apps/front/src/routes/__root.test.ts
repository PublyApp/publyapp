import { describe, expect, test } from 'vitest';

import { isAuthedSurface, resolveRouteSurface } from './__root';

describe('resolveRouteSurface', () => {
	test('classifies every auth screen as the auth surface, not marketing', () => {
		expect(resolveRouteSurface('/login')).toBe('auth');
		expect(resolveRouteSurface('/signup')).toBe('auth');
		expect(resolveRouteSurface('/verify-email')).toBe('auth');
		expect(resolveRouteSurface('/reset-password')).toBe('auth');
		expect(resolveRouteSurface('/accept-invitation')).toBe('auth');
	});

	test('classifies everything else as marketing', () => {
		expect(resolveRouteSurface('/')).toBe('marketing');
		expect(resolveRouteSurface('/pricing')).toBe('marketing');
		expect(resolveRouteSurface('/auth')).toBe('marketing');
	});
});

describe('isAuthedSurface', () => {
	test('matches /staff and /tenant paths', () => {
		expect(isAuthedSurface('/staff/tenants')).toBe(true);
		expect(isAuthedSurface('/tenant')).toBe(true);
	});

	test('does not match auth or marketing paths', () => {
		expect(isAuthedSurface('/login')).toBe(false);
		expect(isAuthedSurface('/accept-invitation')).toBe(false);
		expect(isAuthedSurface('/')).toBe(false);
	});
});
