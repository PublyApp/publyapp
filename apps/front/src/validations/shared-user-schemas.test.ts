/**
 * Guards the email-format and role-assignment constraints on the shared
 * user-creation schemas.
 *
 * `getNewStaffUserSchema` (packages/shared-ts/src/validations/staff-user.validations.ts)
 * and `getNewTenantSchemaServerSide`
 * (packages/shared-ts/src/validations/tenant/tenant.validations.ts) are the
 * canonical schema definitions for creating staff users and tenants. The tests
 * pin that the constraints they carry — email format, profile-assignment
 * shape, minimum name length, at-least-one-owner refine and unique-email
 * refine —
 * still accept valid payloads and still reject invalid ones.
 *
 * A constraint that was silently dropped would make these assertions pass for
 * bad input — a green test that proves nothing. To guard against that, the
 * red→green cycle (documented in .dump/proof-cleanup-1534.md) temporarily
 * removes a constraint, shows the suite RED, then restores it to GREEN.
 */
import { describe, expect, it } from 'vitest';

import InterZod from '@org/shared-ts/lib/zod/InterZod';
import { getNewStaffUserSchema } from '@org/shared-ts/validations/staff-user.validations';
import { getNewTenantSchemaServerSide } from '@org/shared-ts/validations/tenant/tenant.validations';

const makeZ = () =>
	new InterZod({
		i18n: { getFixedT: () => (key: string) => key },
	});

describe('getNewStaffUserSchema — email format and profile-assignment constraints', () => {
	const z = makeZ();
	const schema = getNewStaffUserSchema(z);

	it('accepts a valid staff user payload', () => {
		const result = schema.safeParse({
			firstName: 'Jane',
			lastName: 'Doe',
			email: 'jane@example.com',
			profileIds: ['profile-1'],
			sendNotification: false,
			avatar: 'https://example.com/a.png',
		});
		expect(result.success).toBe(true);
	});

	it('rejects an invalid email (email format constraint)', () => {
		const result = schema.safeParse({
			lastName: 'Doe',
			email: 'not-an-email',
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join('.'));
			expect(paths).toContain('email');
		}
	});

	it('rejects profileIds that are not an array of strings', () => {
		const result = schema.safeParse({
			lastName: 'Doe',
			email: 'jane@example.com',
			profileIds: 'not-an-array',
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join('.'));
			expect(paths).toContain('profileIds');
		}
	});

	it('rejects a missing lastName key (presence constraint)', () => {
		const result = schema.safeParse({
			email: 'jane@example.com',
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join('.'));
			expect(paths).toContain('lastName');
		}
	});

	it('rejects a present-but-empty lastName (min(1) constraint)', () => {
		// Distinct from the missing-key case above: here the key IS present,
		// so presence passes and ONLY `min(1)` can bite. Sending `''` is exactly
		// the user-input regression a relaxed `min(0)` would let through.
		const result = schema.safeParse({
			lastName: '',
			email: 'jane@example.com',
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join('.'));
			expect(paths).toContain('lastName');
		}
	});
});

describe('getNewTenantSchemaServerSide — tenant user constraints', () => {
	const z = makeZ();
	const schema = getNewTenantSchemaServerSide(z, { maxUsers: 5 });

	const validPayload = {
		name: 'Acme Corp',
		maxUsers: 3,
		initialUsers: [
			{ email: 'admin@acme.com', role: 'owner' },
			{ email: 'user@acme.com', role: 'member' },
		],
	};

	it('accepts a valid tenant payload', () => {
		const result = schema.safeParse(validPayload);
		expect(result.success).toBe(true);
	});

	it('rejects a name shorter than 5 chars (min(5) constraint)', () => {
		const result = schema.safeParse({ ...validPayload, name: 'Acme' });
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join('.'));
			expect(paths).toContain('name');
		}
	});

	it('rejects an invalid initial-user email (email constraint)', () => {
		const result = schema.safeParse({
			...validPayload,
			initialUsers: [
				{ email: 'admin@acme.com', role: 'owner' },
				{ email: 'not-an-email', role: 'member' },
			],
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join('.'));
			expect(paths).toContain('initialUsers.1.email');
		}
	});

	it('rejects a tenant with no owner (at-least-one-owner refine)', () => {
		const result = schema.safeParse({
			...validPayload,
			initialUsers: [{ email: 'user@acme.com', role: 'member' }],
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join('.'));
			expect(paths).toContain('initialUsers');
		}
	});

	it('rejects duplicate initial-user emails (unique-email refine)', () => {
		const result = schema.safeParse({
			...validPayload,
			initialUsers: [
				{ email: 'dup@acme.com', role: 'owner' },
				{ email: 'dup@acme.com', role: 'member' },
			],
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join('.'));
			expect(paths).toContain('initialUsers');
		}
	});
});
