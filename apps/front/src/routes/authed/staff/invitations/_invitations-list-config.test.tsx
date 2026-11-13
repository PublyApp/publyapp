import { describe, expect, test } from 'vitest';

import { buildInvitationFilters } from './_invitations-list-config';
import { toStaffInvitationRows } from './list-helpers';

const t = (key: string): string => key;

const roleFilter = (
	selected: string[],
	roles: { id: string; name: string; count: number }[] | null,
) => {
	const filter = buildInvitationFilters(t, selected, roles).find(
		(candidate) => candidate.key === 'role',
	);
	if (!filter) {
		throw new Error('role filter missing');
	}
	return filter;
};

describe('invitations role facet', () => {
	test('builds id-valued choices from the API whole-collection counts, not the page', () => {
		const filter = roleFilter(
			[],
			[
				{ id: 'id-writer', name: 'Writer', count: 12 },
				{ id: 'id-reader', name: 'Reader', count: 3 },
			],
		);

		expect(filter.choices).toEqual([
			{ value: 'id-writer', label: 'Writer', count: 12 },
			{ value: 'id-reader', label: 'Reader', count: 3 },
		]);
	});

	test('is a server-side filter: the API narrows by id across every page', () => {
		expect(roleFilter([], [{ id: 'a', name: 'A', count: 1 }]).serverSide).toBe(
			true,
		);
	});

	test('keeps a picked id labelled by its known name when the facet no longer lists it', () => {
		const filter = buildInvitationFilters(
			t,
			['id-legacy'],
			[{ id: 'id-writer', name: 'Writer', count: 1 }],
			new Map([['id-legacy', 'Legacy role']]),
		).find((candidate) => candidate.key === 'role');

		expect(filter?.choices.map((choice) => choice.value)).toEqual([
			'id-legacy',
			'id-writer',
		]);
		expect(filter?.choices[0]).toEqual({
			value: 'id-legacy',
			label: 'Legacy role',
			count: null,
		});
	});

	test('a picked id with no name yet reads « loading », never « unknown »', () => {
		const filter = roleFilter(['id-pending'], []);

		expect(filter.choices[0]?.label).toBe('loading');
	});

	test('shows no role filter while neither counts nor a picked role exist', () => {
		expect(
			buildInvitationFilters(t, [], null).some(
				(candidate) => candidate.key === 'role',
			),
		).toBe(false);
	});

	test('rows carry each role name separately, a comma in a name included', () => {
		const [row] = toStaffInvitationRows([
			{
				id: 'inv-1',
				email: 'a@example.com',
				roleName: 'Ops, Night, Writer',
				roleNames: ['Ops, Night', 'Writer'],
			},
		]);

		expect(row?.roleNames).toEqual(['Ops, Night', 'Writer']);
	});
});
