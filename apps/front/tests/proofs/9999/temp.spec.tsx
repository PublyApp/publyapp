/**
 * TEMPORARY TEST FILE — for verifying the guard rejects unplayable extensions.
 * This file is NOT a real proof; it exists only to test the guard's extension validation.
 */
import { describe, expect, test } from 'vitest';

describe('temp proof — extension validation', () => {
	test('this should never be replayed', () => {
		expect(1).toBe(1);
	});
});
