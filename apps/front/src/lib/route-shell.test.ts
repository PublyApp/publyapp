import { describe, expect, test } from 'vitest';

import { hasExactAuthedRouteMatch } from './route-shell';

describe('hasExactAuthedRouteMatch', () => {
	test('accepts a known route nested under the authed layout', () => {
		expect(
			hasExactAuthedRouteMatch(
				[
					{ routeId: '__root__', pathname: '/' },
					{ routeId: '/_authed-layout', pathname: '/' },
					{
						routeId: '/_authed-layout/staff/staff-users',
						pathname: '/staff/staff-users',
					},
				],
				'/staff/staff-users',
			),
		).toBe(true);
	});

	test('rejects a partial pathless-layout match for an unknown /staff path', () => {
		expect(
			hasExactAuthedRouteMatch(
				[
					{ routeId: '__root__', pathname: '/' },
					{ routeId: '/_authed-layout', pathname: '/' },
				],
				'/staff/users',
			),
		).toBe(false);
	});

	test('rejects a global not-found match even when its pathname is exact', () => {
		expect(
			hasExactAuthedRouteMatch(
				[
					{ routeId: '__root__', pathname: '/' },
					{
						routeId: '/_authed-layout',
						pathname: '/',
						_notFound: true,
					},
					{
						routeId: '/_authed-layout/staff',
						pathname: '/staff/users',
					},
				],
				'/staff/users',
			),
		).toBe(false);
	});

	test('rejects a /staff route registered outside the authed layout', () => {
		expect(
			hasExactAuthedRouteMatch(
				[
					{ routeId: '__root__', pathname: '/' },
					{ routeId: '/staff/error-preview', pathname: '/staff/error-preview' },
				],
				'/staff/error-preview',
			),
		).toBe(false);
	});
});
