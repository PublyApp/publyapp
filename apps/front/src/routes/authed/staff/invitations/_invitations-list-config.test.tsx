import { describe, expect, test } from 'vitest';

import { buildInvitationFilters } from './_invitations-list-config';
import { toStaffInvitationRows } from './list-helpers';

const t = (key: string): string => key;

const roleFilter = (
	selected: string[],
	roleCounts: Record<string, number> | null,
) => {
	const filter = buildInvitationFilters(t, selected, roleCounts).find(
		(candidate) => candidate.key === 'role',
	);
	if (!filter) {
		throw new Error('role filter missing');
	}
	return filter;
};

describe('invitations role facet', () => {
	test('builds the choices from the API whole-collection counts, not the page', () => {
		const filter = roleFilter([], { Writer: 12, Reader: 3 });

		expect(filter.choices).toEqual([
			{ value: 'Writer', label: 'Writer', count: 12 },
			{ value: 'Reader', label: 'Reader', count: 3 },
		]);
	});

	test('keeps a role picked in the URL even when the counts no longer list it', () => {
		const filter = roleFilter(['Legacy'], { Writer: 1 });

		expect(filter.choices.map((choice) => choice.value)).toEqual([
			'Legacy',
			'Writer',
		]);
		expect(filter.choices[0]).toEqual({
			value: 'Legacy',
			label: 'Legacy',
			count: null,
		});
	});

	test('shows no role filter while neither counts nor a picked role exist', () => {
		expect(
			buildInvitationFilters(t, [], null).some(
				(candidate) => candidate.key === 'role',
			),
		).toBe(false);
	});

	test('matches a multi-role invitation on each role, a comma in a name included', () => {
		const [row] = toStaffInvitationRows([
			{
				id: 'inv-1',
				email: 'a@example.com',
				roleName: 'Ops, Night, Writer',
				roleNames: ['Ops, Night', 'Writer'],
			},
		]);
		if (!row) {
			throw new Error('row missing');
		}

		const filter = roleFilter([], { 'Ops, Night': 1, Writer: 1 });
		expect(filter.valueOf(row)).toEqual(['Ops, Night', 'Writer']);
	});
});
