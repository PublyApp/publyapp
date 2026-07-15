/**
 * @vitest-environment jsdom
 */
import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	redirect: vi.fn((options: unknown) => options),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
	redirect: mocks.redirect,
}));

import { Route } from './users-invite';

describe('staff tenant users/invite legacy route', () => {
	test('redirects to the users tab with the invite drawer flag', () => {
		const RouteConfig = Route as unknown as {
			beforeLoad: (context: { params: { tenantId: string } }) => unknown;
		};

		expect(() =>
			RouteConfig.beforeLoad({
				params: { tenantId: '11111111-1111-1111-1111-111111111111' },
			}),
		).toThrow();

		expect(mocks.redirect).toHaveBeenCalledWith({
			to: '/staff/tenants/$tenantId/users',
			params: { tenantId: '11111111-1111-1111-1111-111111111111' },
			search: { invite: 1 },
		});
	});
});
