import { describe, expect, it } from 'vitest';

import { parseLevel, resolveLevel } from '../log-level';

describe('log level', () => {
	it('parses case-insensitively and rejects unknown values', () => {
		expect(parseLevel('WARN')).toBe('warn');
		expect(parseLevel('verbose')).toBeUndefined();
		expect(parseLevel(undefined)).toBeUndefined();
	});

	it('defaults to info in production, debug elsewhere, LOG_LEVEL wins', () => {
		expect(resolveLevel({ NODE_ENV: 'production' })).toBe('info');
		expect(resolveLevel({ NODE_ENV: 'development' })).toBe('debug');
		expect(resolveLevel({ NODE_ENV: 'production', LOG_LEVEL: 'error' })).toBe(
			'error',
		);
		expect(resolveLevel({ LOG_LEVEL: 'nope' })).toBe('debug');
	});
});
