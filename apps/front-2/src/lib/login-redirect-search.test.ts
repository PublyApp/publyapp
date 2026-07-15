import { describe, expect, test } from 'vitest';

import { buildLoginRedirectSearch } from './login-redirect-search';

describe('buildLoginRedirectSearch', () => {
	test('omits rc when no session existed, but always carries rto', () => {
		expect(
			buildLoginRedirectSearch({
				hadSession: false,
				returnTo: '/staff/tenants',
			}),
		).toEqual({ rto: '/staff/tenants' });
	});

	test('carries rc alongside rto when a session existed', () => {
		expect(
			buildLoginRedirectSearch({
				hadSession: true,
				returnTo: '/staff/tenants/1?q=a',
			}),
		).toEqual({ rc: 'invalid_session', rto: '/staff/tenants/1?q=a' });
	});

	test('produces an empty object when neither applies', () => {
		expect(buildLoginRedirectSearch({ hadSession: false })).toEqual({});
	});
});
