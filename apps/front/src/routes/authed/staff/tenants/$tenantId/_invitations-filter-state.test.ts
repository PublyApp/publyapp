import { describe, expect, test, vi } from 'vitest';

import { buildInvitationsFilterState } from './_invitations-filter-state';
import type { InvitationRouteSearchParams } from './_invitations-route-search';

const t = (key: string): string => key;
const selection = {
	isSelectionMode: false,
} as Parameters<typeof buildInvitationsFilterState>[0]['selection'];

const build = (search: Partial<InvitationRouteSearchParams> = {}) => {
	const applySearch = vi.fn();
	const state = buildInvitationsFilterState({
		search: search as InvitationRouteSearchParams,
		t,
		applySearch,
		selection,
	});

	return { applySearch, state };
};

describe('buildInvitationsFilterState', () => {
	test('parses the selected statuses and levels out of the search params', () => {
		const { state } = build({ status: 'pending,expired', level: 'admin' });

		expect(state.selectedStatuses).toEqual(['pending', 'expired']);
		expect(state.selectedLevels).toEqual(['admin']);
	});

	test('labels an empty selection with the all-values copy', () => {
		const { state } = build();

		expect(state.statusFilterLabel).toBe('all-statuses');
		expect(state.levelFilterLabel).toBe('all-account-levels');
	});

	test('joins the selected status labels', () => {
		const { state } = build({ status: 'pending,expired' });

		expect(state.statusFilterLabel).toBe('pending, expired');
	});

	test('adds an unselected status and resets the cursor', () => {
		const { applySearch, state } = build({
			status: 'pending',
			cursor: 'abc',
			q: 'ada',
		});

		state.toggleStatus('expired');

		expect(applySearch).toHaveBeenCalledWith({
			q: 'ada',
			status: 'pending,expired',
			cursor: undefined,
		});
	});

	test('removes an already selected status', () => {
		const { applySearch, state } = build({ status: 'pending,expired' });

		state.toggleStatus('pending');

		expect(applySearch).toHaveBeenCalledWith({
			status: 'expired',
			cursor: undefined,
		});
	});

	test('adds an unselected level and resets the cursor', () => {
		const { applySearch, state } = build({ level: 'admin', cursor: 'abc' });

		state.toggleLevel('user');

		expect(applySearch).toHaveBeenCalledWith({
			level: 'admin,user',
			cursor: undefined,
		});
	});

	test('clears every level when set to an empty selection', () => {
		const { applySearch, state } = build({ level: 'admin' });

		state.setLevels([]);

		expect(applySearch).toHaveBeenCalledWith({
			level: undefined,
			cursor: undefined,
		});
	});
});
