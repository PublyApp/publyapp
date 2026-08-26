/**
 * Rebase proof for PR #1534 (lane/wt-155) against current `develop`.
 *
 * Two validation schemas were in conflict during the rebase:
 * `getNewStaffUserSchema` (packages/shared-ts/src/validations/staff-user.validations.ts)
 * and `getNewTenantSchemaServerSide`
 * (packages/shared-ts/src/validations/tenant/tenant.validations.ts). The PR's
 * "new form" rewrites how schemas are written (zod v4 `z.email()` factories plus
 * `ACCOUNT_LEVEL_ENUM`-backed enums). `develop` had, in parallel, dropped the
 * `ACCOUNT_LEVEL_ENUM` import and inlined literal `['Admin','User']` / `'Admin'`
 * values and switched email to the legacy `z.string().email()` chain.
 *
 * The resolved merge keeps BOTH sides' intent: `develop`'s edits exist AND are
 * written in the PR's new form. The tests below pin that the constraints
 * inherited from `develop` (email format, account-level enum, min name length,
 * at-least-one-admin refine, unique-email refine) still accept valid payloads
 * and still reject invalid ones. A constraint that was silently dropped would
 * make these assertions pass for bad input — a green test that proves nothing.
 * To guard against that, the red→green cycle (documented in
 * .dump/proof-rebase-1534.md) temporarily removes a constraint, shows the suite
 * RED, then restores it to GREEN.
 */
import { describe, expect, it } from 'vitest';

import InterZod from '@org/shared-ts/lib/zod/InterZod';
import { getNewStaffUserSchema } from '@org/shared-ts/validations/staff-user.validations';
import { getNewTenantSchemaServerSide } from '@org/shared-ts/validations/tenant/tenant.validations';

const makeZ = () =>
	new InterZod({
		i18n: { getFixedT: () => (key: string) => key },
	});

describe('getNewStaffUserSchema — rebase #1534 constraints (#155 new form)', () => {
	const z = makeZ();
	const schema = getNewStaffUserSchema(z);

	it('accepts a valid staff user payload', () => {
		const result = schema.safeParse({
			firstName: 'Jane',
			lastName: 'Doe',
			email: 'jane@example.com',
			accountLevel: 'Admin',
			sendNotification: false,
			avatar: 'https://example.com/a.png',
		});
		expect(result.success).toBe(true);
	});

	it('rejects an invalid email (develop-side email format constraint)', () => {
		const result = schema.safeParse({
			lastName: 'Doe',
			email: 'not-an-email',
			accountLevel: 'User',
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join('.'));
			expect(paths).toContain('email');
		}
	});

	it('rejects an unknown account level (develop-side enum constraint)', () => {
		const result = schema.safeParse({
			lastName: 'Doe',
			email: 'jane@example.com',
			accountLevel: 'Superuser',
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join('.'));
			expect(paths).toContain('accountLevel');
		}
	});

	it('requires lastName (develop-side min(1) constraint)', () => {
		const result = schema.safeParse({
			email: 'jane@example.com',
			accountLevel: 'User',
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join('.'));
			expect(paths).toContain('lastName');
		}
	});
});

describe('getNewTenantSchemaServerSide — rebase #1534 constraints (#155 new form)', () => {
	const z = makeZ();
	const schema = getNewTenantSchemaServerSide(z, { maxUsers: 5 });

	const validPayload = {
		name: 'Acme Corp',
		maxUsers: 3,
		initialUsers: [
			{ email: 'admin@acme.com', accountLevel: 'Admin' },
			{ email: 'user@acme.com', accountLevel: 'User' },
		],
	};

	it('accepts a valid tenant payload', () => {
		const result = schema.safeParse(validPayload);
		expect(result.success).toBe(true);
	});

	it('rejects a name shorter than 5 chars (develop-side min(5) constraint)', () => {
		const result = schema.safeParse({ ...validPayload, name: 'Acme' });
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join('.'));
			expect(paths).toContain('name');
		}
	});

	it('rejects an invalid initial-user email (develop-side email constraint)', () => {
		const result = schema.safeParse({
			...validPayload,
			initialUsers: [
				{ email: 'admin@acme.com', accountLevel: 'Admin' },
				{ email: 'not-an-email', accountLevel: 'User' },
			],
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join('.'));
			expect(paths).toContain('initialUsers.1.email');
		}
	});

	it('rejects a tenant with no admin (develop-side at-least-one-admin refine)', () => {
		const result = schema.safeParse({
			...validPayload,
			initialUsers: [{ email: 'user@acme.com', accountLevel: 'User' }],
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join('.'));
			expect(paths).toContain('initialUsers');
		}
	});

	it('rejects duplicate initial-user emails (develop-side unique-email refine)', () => {
		const result = schema.safeParse({
			...validPayload,
			initialUsers: [
				{ email: 'dup@acme.com', accountLevel: 'Admin' },
				{ email: 'dup@acme.com', accountLevel: 'User' },
			],
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join('.'));
			expect(paths).toContain('initialUsers');
		}
	});
});
