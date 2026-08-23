import { describe, expect, it } from 'vitest';

import {
	getDetailsActionState,
	getMembershipActionLabel,
	getNormalizedTenantUserStatus,
} from './_details-status-helpers';

const idleFlags = {
	suspendIsPending: false,
	reactivateIsPending: false,
	removeIsPending: false,
};

describe('getNormalizedTenantUserStatus', () => {
	it('trims and lowercases a status value', () => {
		expect(getNormalizedTenantUserStatus('  ACTIVE ')).toBe('active');
	});

	it('returns an empty string for nullish values', () => {
		expect(getNormalizedTenantUserStatus(null)).toBe('');
		expect(getNormalizedTenantUserStatus(undefined)).toBe('');
	});
});

describe('getMembershipActionLabel', () => {
	it('maps active to suspend and suspended to reactivate', () => {
		expect(getMembershipActionLabel('active')).toBe('suspend');
		expect(getMembershipActionLabel('suspended')).toBe('reactivate');
	});

	it('returns null for ambiguous statuses', () => {
		expect(getMembershipActionLabel('globally_suspended')).toBe(null);
		expect(getMembershipActionLabel('')).toBe(null);
	});
});

describe('getDetailsActionState', () => {
	it('allows suspending an active membership', () => {
		expect(getDetailsActionState({ status: 'active', ...idleFlags })).toEqual({
			canChangeStatus: true,
			isGloballySuspended: false,
			isStatusActionPending: false,
			isRemoveActionPending: false,
			isAnyActionPending: false,
			membershipAction: 'suspend',
			membershipActionDisabled: false,
		});
	});

	it('allows reactivating a suspended membership', () => {
		const state = getDetailsActionState({
			status: 'Suspended',
			...idleFlags,
		});

		expect(state.canChangeStatus).toBe(true);
		expect(state.membershipAction).toBe('reactivate');
		expect(state.membershipActionDisabled).toBe(false);
	});

	it('locks lifecycle actions for a globally suspended user', () => {
		const state = getDetailsActionState({
			status: 'globally_suspended',
			...idleFlags,
		});

		expect(state.canChangeStatus).toBe(false);
		expect(state.isGloballySuspended).toBe(true);
		expect(state.membershipAction).toBe(null);
		expect(state.membershipActionDisabled).toBe(true);
	});

	it('disables the membership action while a status mutation runs', () => {
		const state = getDetailsActionState({
			status: 'active',
			...idleFlags,
			reactivateIsPending: true,
		});

		expect(state.isStatusActionPending).toBe(true);
		expect(state.isAnyActionPending).toBe(true);
		expect(state.membershipActionDisabled).toBe(true);
	});

	it('keeps the membership action enabled while only removal runs', () => {
		const state = getDetailsActionState({
			status: 'active',
			...idleFlags,
			removeIsPending: true,
		});

		expect(state.isStatusActionPending).toBe(false);
		expect(state.isRemoveActionPending).toBe(true);
		expect(state.isAnyActionPending).toBe(true);
		expect(state.membershipActionDisabled).toBe(false);
	});
});
