/**
 * @vitest-environment jsdom
 */
import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	redirect: vi.fn((options: unknown) => options),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	redirect: mocks.redirect,
}));

import { Route } from './profiles-new';

describe('staff tenant profiles/new legacy route', () => {
	test('redirects to the profiles tab with the create-drawer flag', () => {
		const beforeLoad = Route.options.beforeLoad as (context: {
			params: { tenantId: string };
		}) => void;

		expect(() =>
			beforeLoad({
				params: { tenantId: '11111111-1111-1111-1111-111111111111' },
			}),
		).toThrow();

		expect(mocks.redirect).toHaveBeenCalledWith({
			to: '/staff/tenants/$tenantId/profiles',
			params: { tenantId: '11111111-1111-1111-1111-111111111111' },
			search: { new: 1 },
		});
	});
});
