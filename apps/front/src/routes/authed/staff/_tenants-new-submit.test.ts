import { describe, expect, test } from 'vitest';

import {
	buildCreateTenantInput,
	buildPendingCreateSummary,
	filterFilledEmails,
	planCreateTenantFieldErrors,
} from './_tenants-new-submit';
import {
	DEFAULT_VALUES,
	type TenantCreateFormValues,
} from './_tenants-new-types';

const values = (overrides: Partial<TenantCreateFormValues> = {}) => ({
	...DEFAULT_VALUES,
	name: '  Acme Corp  ',
	...overrides,
});

describe('filterFilledEmails', () => {
	test('keeps only entries whose email has non-whitespace content', () => {
		expect(
			filterFilledEmails([
				{ email: 'a@example.com' },
				{ email: '   ' },
				{ email: '' },
			]),
		).toEqual([{ email: 'a@example.com' }]);
	});
});

describe('buildCreateTenantInput', () => {
	test('trims the name and omits blank optional fields', () => {
		const input = buildCreateTenantInput({
			values: values({ legalName: '  ', notes: '  internal  ' }),
			parsedMembers: [],
		});

		expect(input.name).toBe('Acme Corp');
		expect(input.legalName).toBeUndefined();
		expect(input.notes).toBe('internal');
	});

	test('omits `code` entirely when the slug is blank', () => {
		const input = buildCreateTenantInput({
			values: values({ code: '   ' }),
			parsedMembers: [],
		});

		expect('code' in input).toBe(false);
	});

	test('sends the trimmed slug when one was typed', () => {
		const input = buildCreateTenantInput({
			values: values({ code: '  acme  ' }),
			parsedMembers: [],
		});

		expect(input.code).toBe('acme');
	});

	test('merges owners, imported members and manual members into initialUsers', () => {
		const input = buildCreateTenantInput({
			values: values({
				owners: [{ email: 'owner@example.com' }],
				manualMembers: [{ email: 'manual@example.com', accountLevel: 'User' }],
			}),
			parsedMembers: [{ email: 'csv@example.com', accountLevel: 'User' }],
		});

		expect(input.initialUsers.map((user) => user.email)).toEqual([
			'owner@example.com',
			'csv@example.com',
			'manual@example.com',
		]);
	});
});

describe('planCreateTenantFieldErrors', () => {
	test('maps known form fields and leaves the root message empty', () => {
		const plan = planCreateTenantFieldErrors(
			{ name: ['too short', 'reserved'] },
			'fallback',
		);

		expect(plan.fieldErrors).toEqual([
			{ field: 'name', message: 'too short reserved' },
		]);
		expect(plan.rootMessage).toBeNull();
	});

	test('collapses unknown fields into a de-duplicated root message', () => {
		const plan = planCreateTenantFieldErrors(
			{ somethingElse: ['boom'], another: ['boom', 'bang'] },
			'fallback',
		);

		expect(plan.fieldErrors).toEqual([]);
		expect(plan.rootMessage).toBe('boom bang');
	});

	test('falls back when the payload carries no usable message', () => {
		expect(planCreateTenantFieldErrors({}, 'fallback').rootMessage).toBe(
			'fallback',
		);
	});
});

describe('buildPendingCreateSummary', () => {
	test('returns zeroed counts and the placeholder slug without values', () => {
		expect(
			buildPendingCreateSummary({
				values: null,
				parsedMembersCount: 3,
				assignedAfterCreationLabel: 'assigned later',
			}),
		).toEqual({
			ownersCount: 0,
			membersCount: 0,
			slugDisplay: 'assigned later',
		});
	});

	test('counts filled owners and manual members plus imported members', () => {
		expect(
			buildPendingCreateSummary({
				values: values({
					code: ' acme ',
					owners: [{ email: 'owner@example.com' }, { email: '  ' }],
					manualMembers: [
						{ email: 'manual@example.com', accountLevel: 'User' },
						{ email: '', accountLevel: 'User' },
					],
				}),
				parsedMembersCount: 2,
				assignedAfterCreationLabel: 'assigned later',
			}),
		).toEqual({ ownersCount: 1, membersCount: 3, slugDisplay: 'acme' });
	});
});
