import { expect, test } from 'vitest';

import { getLoginSessionCookieValue } from './session-actions';

test('login helper writes tenant token to cookie format on initial login write', () => {
	expect(getLoginSessionCookieValue('SESSION_123')).toBe('t:SESSION_123');
});

test('login helper does not write staff slot before redirect-code staff proof', () => {
	expect(getLoginSessionCookieValue('SESSION_123')).not.toMatch(/^s:/);
});
