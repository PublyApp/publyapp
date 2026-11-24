import { describe, expect, it } from 'vitest';

import type { LogMeta } from '../logger.contract';
import { redactMeta, redactText } from '../redact';

type ErrorOut = {
	name: string;
	message: string;
	stack: string;
	cause: { message: string };
};

describe('redactText', () => {
	it.each([
		['mail me at jane.doe@example.com', 'mail me at [redacted-email]'],
		['auth Bearer abc.def', 'auth Bearer [REDACTED]'],
		['call +261 34 12 345 67 now', 'call [redacted-phone] now'],
		['db mongodb://user:pw@host/db', 'db mongodb://[REDACTED]@host/db'],
		['jwt eyJhbGciOi.eyJzdWIiOi.sig_nature-1', 'jwt [redacted-jwt]'],
		['blob abcdefghijklmnopqrstuvwxyz0123', 'blob [redacted-token]'],
	])('%s', (input, expected) => {
		expect(redactText(input)).toBe(expected);
	});

	it('keeps paths and ISO dates readable', () => {
		expect(redactText('/a/very/long/path/segment/here 2026-11-24')).toBe(
			'/a/very/long/path/segment/here 2026-11-24',
		);
	});
});

describe('redactMeta', () => {
	it('masks sensitive keys at any depth, in arrays, case-insensitively', () => {
		const out = redactMeta({
			user: { Password: 'p', list: [{ accessToken: 't', ok: 1 }] },
			emailHash: 'kept',
		});
		expect(out).toEqual({
			user: {
				Password: '[REDACTED]',
				list: [{ accessToken: '[REDACTED]', ok: 1 }],
			},
			emailHash: 'kept',
		});
	});

	it('redacts text values', () => {
		expect(redactMeta({ note: 'x@y.io' })).toEqual({
			note: '[redacted-email]',
		});
	});

	it('serialises errors with cause, redacted', () => {
		const err = new Error('bad a@b.com', { cause: new Error('inner c@d.com') });
		const out = redactMeta({ err }) as { err: ErrorOut };
		expect(out.err.name).toBe('Error');
		expect(out.err.message).toBe('bad [redacted-email]');
		expect(out.err.stack).not.toContain('a@b.com');
		expect(out.err.cause.message).toBe('inner [redacted-email]');
	});

	it('survives cycles and truncates depth and long arrays', () => {
		const loop: LogMeta = { name: 'n' };
		loop.self = loop;
		expect(redactMeta({ loop })).toEqual({
			loop: { name: 'n', self: '[Circular]' },
		});
		const deep = { a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } };
		expect(JSON.stringify(redactMeta(deep))).toContain('[Truncated]');
		const arr = redactMeta({ a: Array.from({ length: 150 }, (_, i) => i) }) as {
			a: unknown[];
		};
		expect(arr.a).toHaveLength(101);
		expect(arr.a.at(-1)).toBe('[Truncated]');
	});

	it('allows the same object twice (shared, not cyclic)', () => {
		const shared = { v: 1 };
		expect(redactMeta({ a: shared, b: shared })).toEqual({
			a: { v: 1 },
			b: { v: 1 },
		});
	});
});
