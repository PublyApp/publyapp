/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { downloadFile, formatExportDateStamp } from '~/lib/download-file';

describe('downloadFile', () => {
	const createObjectURL = vi.fn(() => 'blob:mock-url');
	const revokeObjectURL = vi.fn();

	beforeEach(() => {
		createObjectURL.mockClear();
		revokeObjectURL.mockClear();
		URL.createObjectURL = createObjectURL;
		URL.revokeObjectURL = revokeObjectURL;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('creates an object URL, clicks a download anchor, and defers revoking the URL', () => {
		vi.useFakeTimers();
		const clickSpy = vi
			.spyOn(HTMLAnchorElement.prototype, 'click')
			.mockImplementation(() => undefined);

		downloadFile({
			data: new ArrayBuffer(4),
			fileName: 'acme-members-2026-07-12.csv',
			mimeType: 'text/csv',
		});

		expect(createObjectURL).toHaveBeenCalledTimes(1);
		expect(clickSpy).toHaveBeenCalledTimes(1);
		expect(revokeObjectURL).not.toHaveBeenCalled();

		vi.runAllTimers();

		expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
		vi.useRealTimers();
	});
});

describe('formatExportDateStamp', () => {
	test('formats a date as zero-padded YYYY-MM-DD', () => {
		expect(formatExportDateStamp(new Date(2026, 0, 5))).toBe('2026-01-05');
		expect(formatExportDateStamp(new Date(2026, 10, 23))).toBe('2026-11-23');
	});
});
