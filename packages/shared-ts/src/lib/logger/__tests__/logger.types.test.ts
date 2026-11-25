import { describe, expect, it } from 'vitest';

import { redactMeta } from '../log-redaction';
import { toLogError } from '../logger.types';

describe('toLogError', () => {
	it('keeps the fields of a non-Error object through redaction', () => {
		const out = redactMeta({
			error: toLogError({ code: 'REDIRECT', status: 302, to: '/login' }),
		});
		expect(out).toEqual({
			error: { code: 'REDIRECT', status: 302, to: '/login' },
		});
	});

	it('still wraps a primitive in an Error with its message', () => {
		const out = toLogError('boom');
		expect(out).toBeInstanceOf(Error);
		expect((out as Error).message).toBe('boom');
	});
});
