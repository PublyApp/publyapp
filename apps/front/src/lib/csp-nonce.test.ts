import { describe, expect, test } from 'vitest';

import { mintCspNonce } from './csp-nonce';

describe('mintCspNonce', () => {
	test('is 128-bit base64url and unique per call', () => {
		const a = mintCspNonce();
		const b = mintCspNonce();

		expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
		expect(a).not.toBe(b);
	});
});
