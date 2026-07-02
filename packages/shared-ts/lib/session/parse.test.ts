import { expect, test } from 'vitest';

import { formatSessionCookie, parseSessionCookie, selectToken } from './parse';

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

test('blank token input returns empty tokens', () => {
	expect(parseSessionCookie('')).toEqual({});
	expect(parseSessionCookie('   ')).toEqual({});
});

test('parses single scoped token strings using their declared scope', () => {
	expect(parseSessionCookie('s:RAW_TOKEN')).toEqual({
		staffToken: 'RAW_TOKEN',
	});
	expect(parseSessionCookie('t:RAW_TOKEN')).toEqual({
		tenantToken: 'RAW_TOKEN',
	});
});

test('roundtrips through formatter', () => {
	const parsed = parseSessionCookie('s:STAFF+t:TENANT');
	expect(formatSessionCookie(parsed)).toBe('s:STAFF+t:TENANT');
});

test('roundtrips through formatter for single scoped tokens', () => {
	const parsed = parseSessionCookie(
		formatSessionCookie({ staffToken: 'STAFF' }),
	);
	expect(parsed).toEqual({ staffToken: 'STAFF' });
});

test('selects tenant token for tenant scope and staff scope token for staff scope', () => {
	const tokens = parseSessionCookie('s:STAFF+t:TENANT');

	expect(selectToken(tokens, 'tenant')).toBe('TENANT');
	expect(selectToken(tokens, 'staff')).toBe('STAFF');
});

test('selectToken for staff scope does not fall back to tenant token', () => {
	const tokens = parseSessionCookie('RAW_TOKEN');
	expect(selectToken(tokens, 'staff')).toBeUndefined();
});

test('formats and parses tokens with reserved delimiters', () => {
	const parsed = {
		staffToken: 'STAFF+ONE',
		tenantToken: 't:TENANT:1',
	};

	const formatted = formatSessionCookie(parsed);
	const roundTrip = parseSessionCookie(formatted);

	expect(roundTrip).toEqual(parsed);
});
