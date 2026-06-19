/**
 * @vitest-environment jsdom
 */
import { expect, test } from 'vitest';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';

import { getSessionTokensIsomorphic } from './request-context';

test('getSessionTokensIsomorphic reads session tokens from document.cookie in jsdom', async () => {
	document.cookie = `${SESSION_TOKEN_COOKIE_KEY}=s:staff-token+t:tenant-token`;

	const tokens = await getSessionTokensIsomorphic();

	expect(tokens).toEqual({
		staffToken: 'staff-token',
		tenantToken: 'tenant-token',
	});
});
