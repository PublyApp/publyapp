import { expect, test } from 'vitest';

import {
	formatSessionCookie,
	parseSessionCookie,
	selectToken,
} from './parse';

test('parses staff + tenant dual-token cookie', () => {
	expect(parseSessionCookie('s:STAFF+t:TENANT')).toEqual({
		staffToken: 'STAFF',
		tenantToken: 'TENANT',
	});
});

test('parses legacy raw token as tenant token', () => {
	expect(parseSessionCookie('RAW_TOKEN')).toEqual({
		tenantToken: 'RAW_TOKEN',
	});
});

test('roundtrips through formatter', () => {
	const parsed = parseSessionCookie('s:STAFF+t:TENANT');
	expect(formatSessionCookie(parsed)).toBe('s:STAFF+t:TENANT');
});

test('selects tenant token for tenant scope and staff token fallback for staff scope', () => {
	const tokens = parseSessionCookie('s:STAFF+t:TENANT');

	expect(selectToken(tokens, 'tenant')).toBe('TENANT');
	expect(selectToken(tokens, 'staff')).toBe('STAFF');
});

test('selectToken for staff scope falls back to tenant when staff missing', () => {
	const tokens = parseSessionCookie('RAW_TOKEN');
	expect(selectToken(tokens, 'staff')).toBe('RAW_TOKEN');
});
