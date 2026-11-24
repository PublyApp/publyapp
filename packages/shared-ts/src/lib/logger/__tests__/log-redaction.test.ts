import { describe, expect, it } from 'vitest';

import { redactEntry, redactMeta, redactText } from '../log-redaction';
import type { LogMeta } from '../logger.types';

type ErrorOut = {
	name: string;
	message: string;
	stack: string;
	cause: { message: string };
};

/** `children` nested objects under a root meta object. */
const chain = (children: number): LogMeta => {
	const root: LogMeta = { leaf: true };
	let cursor = root;
	for (let i = 0; i < children; i++) {
		const child: LogMeta = { leaf: true };
		cursor.child = child;
		cursor = child;
	}
	return root;
};

describe('redactText', () => {
	it.each([
		['mail me at jane.doe@example.com', 'mail me at [redacted-email]'],
		['auth Bearer abc.def', 'auth Bearer [REDACTED]'],
		['call +261 34 12 345 67 now', 'call [redacted-phone] now'],
		['db mongodb://user:pw@host/db', 'db mongodb://[REDACTED]@host/db'],
		['jwt eyJhbGciOi.eyJzdWIiOi.sig_nature-1', 'jwt [redacted-jwt]'],
		['blob abcdefghijklmnopqrstuvwxyz0123', 'blob [redacted-token]'],
		['bell\u0007and\u0009tab', 'bell and tab'],
	])('%s', (input, expected) => {
		expect(redactText(input)).toBe(expected);
	});

	it('keeps paths and ISO dates readable', () => {
		expect(redactText('/a/very/long/path/segment/here 2026-11-24')).toBe(
			'/a/very/long/path/segment/here 2026-11-24',
		);
	});

	it('bounds a single text to 2 KB', () => {
		const out = redactText('abcdefgh '.repeat(500));
		expect(out).toHaveLength(2048 + '[Truncated]'.length);
		expect(out.endsWith('[Truncated]')).toBe(true);
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

	it('serialises errors with cause and code, redacted', () => {
		const err = Object.assign(
			new Error('bad a@b.com', { cause: new Error('inner c@d.com') }),
			{ code: 'provider said a@b.com' },
		);
		const out = redactMeta({ err }) as { err: ErrorOut & { code: string } };
		expect(out.err.name).toBe('Error');
		expect(out.err.message).toBe('bad [redacted-email]');
		expect(out.err.code).toBe('provider said [redacted-email]');
		expect(out.err.stack).not.toContain('a@b.com');
		expect(out.err.cause.message).toBe('inner [redacted-email]');
	});

	it('survives cycles', () => {
		const loop: LogMeta = { name: 'n' };
		loop.self = loop;
		expect(redactMeta({ loop })).toEqual({
			loop: { name: 'n', self: '[Circular]' },
		});
	});

	it('bounds depth at 20 and uses the C# sink sentinel', () => {
		expect(JSON.stringify(redactMeta(chain(20)))).not.toContain(
			'[redacted-depth-exceeded]',
		);
		expect(JSON.stringify(redactMeta(chain(21)))).toContain(
			'[redacted-depth-exceeded]',
		);
	});

	it('truncates long arrays', () => {
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

describe('redactEntry', () => {
	it('redacts message and meta in one pass', () => {
		const entry = redactEntry({
			level: 'error',
			message: 'failed for a@b.com',
			meta: { authorization: 'Bearer x' },
			time: new Date('2026-11-24T10:00:00Z'),
		});
		expect(entry.message).toBe('failed for [redacted-email]');
		expect(entry.meta).toEqual({ authorization: '[REDACTED]' });
	});
});
