import { describe, expect, test } from 'vitest';

import { buildCsv } from './csv';

describe('buildCsv', () => {
	test('encodes commas, quotes, and line breaks as valid CSV', () => {
		expect(
			buildCsv([
				['Name', 'Value'],
				['Alex, "Ace"', 'line 1\r\nline 2'],
			]),
		).toBe('Name,Value\r\n"Alex, ""Ace""","line 1\r\nline 2"');
	});

	test('neutralizes formulas after leading whitespace and controls', () => {
		expect(
			buildCsv([
				['Value'],
				[' \t=HYPERLINK("https://attacker.example")'],
				['+SUM(A1:A2)'],
				[-2],
				[null],
			]),
		).toBe(
			'Value\r\n"\' \t=HYPERLINK(""https://attacker.example"")"\r\n\'+SUM(A1:A2)\r\n\'-2\r\n',
		);
	});
});
