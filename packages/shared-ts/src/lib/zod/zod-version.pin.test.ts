import { describe, expect, test } from 'vitest';
import { z } from 'zod';

/**
 * Issue #155: the workspace runs on zod v4. This suite pins the installed
 * major version through the public API surface so a silent downgrade back to
 * v3 (an accidental `pnpm update zod@3`, a bad resolution override, a stale
 * lockfile entry) turns the suite red instead of surfacing months later as
 * subtle validator behaviour differences.
 *
 * Both probes are false under zod v3 and true under v4:
 * - v3 has no top-level `z.email()` / `z.uuid()` factories (v4 moved string
 *   formats to standalone factories);
 * - v3's `ZodString.email()` carries no `[Deprecated]` marker, while every
 *   v4 string-format method is explicitly deprecated in favour of the
 *   factories above.
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
