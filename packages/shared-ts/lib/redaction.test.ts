import { expect, test } from 'vitest';

import { redactHeaders } from './redaction';

const token = 'x-auth-token-123';

test('redacts token in object headers', () => {
	const output = redactHeaders({
		'x-session-token': token,
		accept: 'application/json',
	});

	expect(output['x-session-token']).toBe('[REDACTED]');
	expect(output.accept).toBe('application/json');
	expect(output['x-session-token']).not.toContain(token);
});

test('redacts token when header case differs', () => {
	const output = redactHeaders([['X-SESSION-TOKEN', token]]);
	expect(output['x-session-token']).toBe('[REDACTED]');
});

test('redacts token when provided as Headers instance', () => {
	const headers = new Headers({
		'X-Session-Token': token,
		authorization: `Bearer ${token}`,
	});
	const output = redactHeaders(headers);

	expect(output['x-session-token']).toBe('[REDACTED]');
	expect(output.authorization).toBe('[REDACTED]');
	expect(output['authorization']).not.toBeUndefined();
	expect(JSON.stringify(output)).not.toContain(token);
});

test('redacts session token in cookie style headers', () => {
	const output = redactHeaders({
		cookie: `x-session-token=${token}`,
		'Set-Cookie': `x-session-token=${token}; Path=/;`,
		accept: 'application/json',
	});

	expect(output.cookie).toBe('[REDACTED]');
	expect(output['set-cookie']).toBe('[REDACTED]');
	expect(output.accept).toBe('application/json');
	expect(JSON.stringify(output)).not.toContain(token);
});

test('redacts proxy-authorization header', () => {
	const output = redactHeaders({
		'proxy-authorization': `Proxy ${token}`,
	});

	expect(output['proxy-authorization']).toBe('[REDACTED]');
	expect(JSON.stringify(output)).not.toContain(token);
});
