import { describe, expect, it } from 'vitest';

import { MemoryLoggerAdapter } from '../adapters/memory-logger-adapter';

describe('MemoryLoggerAdapter', () => {
	it('keeps entries and clears', () => {
		const adapter = new MemoryLoggerAdapter();
		adapter.write({
			level: 'info',
			message: 'm',
			time: new Date('2026-11-24T10:00:00Z'),
		});
		expect(adapter.entries).toHaveLength(1);
		adapter.clear();
		expect(adapter.entries).toHaveLength(0);
	});
});
