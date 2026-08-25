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
	test('parses list params, the level filter and the invite flag together', () => {
		expect(
			parseInvitationRouteSearchParams({
				...BASE,
				level: 'admin,user',
				invite: '1',
			}),
		).toEqual({
			q: 'sam',
			status: 'pending',
			sortId: 'created_at',
			sortOrder: 'desc',
			cursor: 'c1',
			size: 100,
			level: 'admin,user',
			invite: 1,
		});
	});

	test('drops unknown status and level tokens instead of passing them through', () => {
		expect(
			parseInvitationRouteSearchParams({
				...BASE,
				status: 'bogus',
				level: 'x',
			}),
		).toEqual({
			q: 'sam',
			status: undefined,
			sortId: 'created_at',
			sortOrder: 'desc',
			cursor: 'c1',
			size: 100,
			level: undefined,
			invite: undefined,
		});
	});

	test('treats a blank level as no filter', () => {
		expect(
			parseInvitationRouteSearchParams({ ...BASE, level: '  ' }).level,
		).toBeUndefined();
	});
});

describe('serializeInvitationRouteSearchParams', () => {
	test('round-trips parsed params back to snake_case URL values', () => {
		const params = parseInvitationRouteSearchParams({
			...BASE,
			level: 'admin',
			invite: '1',
		});

		expect(serializeInvitationRouteSearchParams(params)).toEqual({
			q: 'sam',
			status: 'pending',
			sort_id: 'created_at',
			sort_order: 'desc',
			cursor: 'c1',
			size: 100,
			level: 'admin',
			invite: 1,
		});
	});

	test('omits cleared filters and a closed drawer', () => {
		const params = parseInvitationRouteSearchParams(BASE);

		expect(
			serializeInvitationRouteSearchParams({
				...params,
				status: undefined,
				level: undefined,
				invite: undefined,
			}),
		).toEqual({
			q: 'sam',
			status: undefined,
			sort_id: 'created_at',
			sort_order: 'desc',
			cursor: 'c1',
			size: 100,
			level: undefined,
			invite: undefined,
		});
	});
});
