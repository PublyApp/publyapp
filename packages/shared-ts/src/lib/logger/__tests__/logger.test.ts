import { describe, expect, it } from 'vitest';

import { MemoryLoggerAdapter } from '../adapters/memory-logger-adapter';
import { Logger } from '../logger';

describe('Logger', () => {
	it('drops disabled levels before the adapter sees them', () => {
		const adapter = new MemoryLoggerAdapter();
		const log = new Logger(adapter, 'info');
		log.debug('dropped');
		log.info('i');
		log.warn('w');
		log.error('e');
		expect(adapter.entries.map((entry) => entry.level)).toEqual([
			'info',
			'warn',
			'error',
		]);
	});

	it('writes every enabled level generated from LOG_LEVELS', () => {
		const adapter = new MemoryLoggerAdapter();
		const log = new Logger(adapter, 'debug');
		for (const level of ['debug', 'info', 'warn', 'error'] as const) {
			log[level](level);
		}
		expect(adapter.entries.map((entry) => entry.level)).toEqual([
			'debug',
			'info',
			'warn',
			'error',
		]);
	});

	it('redacts the message and meta once, before the adapter', () => {
		const adapter = new MemoryLoggerAdapter();
		new Logger(adapter, 'debug').info('mail a@b.com', {
			password: 'secret',
			note: 'token eyJhbGciOi.eyJzdWIiOi.sig',
		});
		expect(adapter.entries[0]?.message).toBe('mail [redacted-email]');
		expect(adapter.entries[0]?.meta).toEqual({
			password: '[REDACTED]',
			note: 'token [redacted-jwt]',
		});
	});

	it('never throws into the caller when the adapter throws', () => {
		const log = new Logger(
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
