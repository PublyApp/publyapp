import { test, expect } from 'vitest';

test('OK fixture — assertion failure (kept-red)', () => {
	expect(true).toBe(false);
});
