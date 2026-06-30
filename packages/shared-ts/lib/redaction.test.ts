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
