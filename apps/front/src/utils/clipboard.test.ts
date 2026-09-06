import { afterEach, describe, expect, test, vi } from 'vitest';

import { copyToClipboard } from './clipboard';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('copyToClipboard', () => {
	test('reports success when the Clipboard API writes the value', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.assign(globalThis.navigator, { clipboard: { writeText } });

		expect(await copyToClipboard('secret')).toEqual({ ok: true });
		expect(writeText).toHaveBeenCalledWith('secret');
	});

	test('reports a rejected write with its error', async () => {
		const error = new Error('denied');
		Object.assign(globalThis.navigator, {
			clipboard: { writeText: vi.fn().mockRejectedValue(error) },
		});

		expect(await copyToClipboard('secret')).toEqual({
			ok: false,
			reason: 'failed',
			error,
		});
	});

	test('reports unavailable when rendering without a Clipboard API', async () => {
		Object.assign(globalThis.navigator, { clipboard: undefined });

		expect(await copyToClipboard('secret')).toEqual({
			ok: false,
			reason: 'unavailable',
		});
	});
});
