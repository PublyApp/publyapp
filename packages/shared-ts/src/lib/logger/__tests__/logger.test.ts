import { describe, expect, it } from 'vitest';

import { parseLevel, resolveLevel } from '../level';
import { createLogger } from '../logger';
import { MemorySink } from '../sinks/memory.sink';

describe('createLogger', () => {
	it('drops levels below the minimum and keeps the rest', () => {
		const sink = new MemorySink();
		const log = createLogger(sink, 'info');
		log.debug('d');
		log.info('i');
		log.warn('w');
		log.error('e');
		expect(sink.entries.map((e) => e.level)).toEqual(['info', 'warn', 'error']);
		expect(log.isLevelEnabled('debug')).toBe(false);
		expect(log.isLevelEnabled('warn')).toBe(true);
	});

	it('redacts message and meta before the sink sees them', () => {
		const sink = new MemorySink();
		createLogger(sink, 'debug').info('mail a@b.com', { password: 'x' });
		expect(sink.entries[0]?.message).toBe('mail [redacted-email]');
		expect(sink.entries[0]?.meta).toEqual({ password: '[REDACTED]' });
	});

	it('never throws into the caller when the sink throws', () => {
		const log = createLogger(
			{
				write: () => {
					throw new Error('boom');
				},
			},
			'debug',
		);
		expect(() => log.error('x')).not.toThrow();
	});
});

describe('level', () => {
	it('parses case-insensitively and rejects unknown values', () => {
		expect(parseLevel('WARN')).toBe('warn');
		expect(parseLevel('verbose')).toBeUndefined();
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
