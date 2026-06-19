import { vi, expect, test } from 'vitest';

vi.mock('./session-cookie-client', () => ({
	getSessionTokensFromClient: () => ({
		staffToken: 'staff-token',
		tenantToken: 'tenant-token',
	}),
}));

import { getSessionTokenFromCookieHeaderForServer } from './api-client';
import { getStaffUsersBrowserSessionToken } from './query';

test('staff SSR token scope and browser token helper both prefer staff token', () => {
	const cookieHeader =
		'publyapp-locale=fr; publyapp-session_token=s:staff-token+t:tenant-token';
	const ssrToken = getSessionTokenFromCookieHeaderForServer(
		cookieHeader,
		'staff',
	);
	const browserToken = getStaffUsersBrowserSessionToken();

	expect(ssrToken).toBe('staff-token');
	expect(browserToken).toBe('staff-token');
	expect(ssrToken).toBe(browserToken);
});
