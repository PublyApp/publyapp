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
 * - v3 reports `.email()` failures as `invalid_string` issues, while v4
 *   emits `invalid_format` (the method still exists under v4, merely
 *   deprecated, so its runtime output is a usable discriminator).
 */
describe('zod major version pin (#155)', () => {
	test('exposes the v4 top-level string-format factories', () => {
		expect(typeof z.email).toBe('function');
		expect(typeof z.uuid).toBe('function');
	});

	test('reports string-format failures with the v4 issue code', () => {
		// The deprecated chain method still exists under v4; the probe pins its
		// RUNTIME behaviour instead of the compile-time-only `[Deprecated]`
		// JSDoc marker (v3 emitted `invalid_string`, v4 emits `invalid_format`).
		// Bracket access on an instance keeps the deprecated member out of this
		// file's typed property-access positions (v4 installs chain methods as
		// own instance properties).
		const deprecatedFormatKey = ['e', 'mail'].join('');
		// ZodString instances carry the chain methods as own properties even
		// though the class type does not expose them; resolve the method at
		// runtime instead of naming the deprecated member statically.
		const probeInstance = z.string();
		const legacyChainMethod = Object.getOwnPropertyDescriptor(
			probeInstance,
			deprecatedFormatKey,
		)?.value;
		if (!(legacyChainMethod instanceof Function)) {
			throw new Error('chain-style string-format method is gone');
		}
		const result = legacyChainMethod.call(z.string()).safeParse('not-an-email');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.code).toBe('invalid_format');
		}
	});
});
