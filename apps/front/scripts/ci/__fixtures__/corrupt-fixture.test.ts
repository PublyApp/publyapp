import { test } from 'vitest';

test('CORRUPT PROOF fixture — thrown Error', () => {
	throw new Error('thrown error, not assertion failure');
});
