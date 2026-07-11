import { describe, expect, test } from 'vitest';

import { columns } from './users';

describe('staff profile users column widths', () => {
	test('applies a fixed width to every column except the fluid name column', () => {
		const widthById = Object.fromEntries(
			columns.map((column) => [column.id, column.meta?.width]),
		);

		expect(widthById).toEqual({
			name: undefined,
			status: '122px',
		});
	});
});
