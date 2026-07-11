import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	read: vi.fn(),
	sheet_to_json: vi.fn(),
}));

vi.mock('xlsx', () => ({
	read: mocks.read,
	utils: {
		sheet_to_json: mocks.sheet_to_json,
	},
}));

import { parseXlsxFile } from './tenants-new-xlsx';

describe('parseXlsxFile', () => {
	test('reads the first sheet and normalizes header keys to lowercase, trimmed strings', async () => {
		mocks.read.mockReturnValue({
			SheetNames: ['Sheet1'],
			Sheets: { Sheet1: 'sheet-handle' },
		});
		mocks.sheet_to_json.mockReturnValue([
			{ Email: ' user1@example.com ', Role: 'Admin' },
			{ Email: 'user2@example.com', Role: 'user' },
		]);

		const file = {
			arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
		} as unknown as File;

		const rows = await parseXlsxFile(file);

		expect(mocks.read).toHaveBeenCalledWith(expect.any(ArrayBuffer), {
			type: 'array',
		});
		expect(mocks.sheet_to_json).toHaveBeenCalledWith('sheet-handle', {
			defval: '',
		});
		expect(rows).toEqual([
			{ email: 'user1@example.com', role: 'Admin' },
			{ email: 'user2@example.com', role: 'user' },
		]);
	});

	test('returns an empty array when the workbook has no sheets', async () => {
		mocks.read.mockReturnValue({ SheetNames: [], Sheets: {} });

		const file = {
			arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
		} as unknown as File;

		expect(await parseXlsxFile(file)).toEqual([]);
	});
});
