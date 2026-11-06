import { describe, expect, test } from 'vitest';

import {
	parseInvitationRouteSearchParams,
	serializeInvitationRouteSearchParams,
} from './_invitations-route-search';

const BASE = {
	q: 'sam',
	status: 'pending',
	sort_id: 'created_at',
	sort_order: 'desc',
	cursor: 'c1',
	size: 100,
};

describe('parseInvitationRouteSearchParams', () => {
	test('parses list params and the invite flag together', () => {
		expect(
			parseInvitationRouteSearchParams({
				...BASE,
				invite: '1',
			}),
		).toEqual({
			q: 'sam',
			status: 'pending',
			sortId: 'created_at',
			sortOrder: 'desc',
			cursor: 'c1',
			size: 100,
			invite: 1,
		});
	});

	test('drops unknown status tokens instead of passing them through', () => {
		expect(
			parseInvitationRouteSearchParams({
				...BASE,
				status: 'bogus',
			}),
		).toEqual({
			q: 'sam',
			status: undefined,
			sortId: 'created_at',
			sortOrder: 'desc',
			cursor: 'c1',
			size: 100,
			invite: undefined,
		});
	});
});

describe('serializeInvitationRouteSearchParams', () => {
	test('round-trips parsed params back to snake_case URL values', () => {
		const params = parseInvitationRouteSearchParams({
			...BASE,
			invite: '1',
		});

		expect(serializeInvitationRouteSearchParams(params)).toEqual({
			q: 'sam',
			status: 'pending',
			sort_id: 'created_at',
			sort_order: 'desc',
			cursor: 'c1',
			size: 100,
			invite: 1,
		});
	});

	test('omits cleared filters and a closed drawer', () => {
		const params = parseInvitationRouteSearchParams(BASE);

		expect(
			serializeInvitationRouteSearchParams({
				...params,
				status: undefined,
				invite: undefined,
			}),
		).toEqual({
			q: 'sam',
			status: undefined,
			sort_id: 'created_at',
			sort_order: 'desc',
			cursor: 'c1',
			size: 100,
			invite: undefined,
		});
	});
});
