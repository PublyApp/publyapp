import { describe, expect, test } from 'vitest';
import { z } from 'zod';

/**
 * Issue #155: the app runs on zod v4. This suite pins the installed major
 * version through the public API surface so a silent downgrade back to v3
 * (an accidental `pnpm update zod@3`, a bad resolution override, a stale
 * lockfile entry) turns the suite red instead of surfacing months later as
 * subtle validator behaviour differences. Mirrors the pin living next to
 * InterZod in `packages/shared-ts` — the two packages declare their zod
 * dependency independently, so each guards its own specifier.
 */
describe('zod major version pin (#155)', () => {
	test('exposes the v4 top-level string-format factories', () => {
		expect(typeof z.email).toBe('function');
		expect(typeof z.uuid).toBe('function');
	});

	test('deprecates the v3-style string-format chain methods', () => {
		expect(String(z.string().email)).toContain('[Deprecated]');
	});
});
