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

import { Route } from './$roleId-edit';

describe('staff tenant roles/$roleId/edit legacy route', () => {
	test('redirects to the role detail page with the edit-drawer flag', () => {
		const widenOptions = <T,>(value: unknown): T => {
			return value as T;
		};
		const { beforeLoad } = widenOptions<{
			beforeLoad: (context: {
				params: { tenantId: string; roleId: string };
			}) => void;
		}>(Route);

		expect(() =>
			beforeLoad({
				params: {
					tenantId: '11111111-1111-1111-1111-111111111111',
					roleId: '22222222-2222-2222-2222-222222222222',
				},
			}),
		).toThrow();

		expect(mocks.redirect).toHaveBeenCalledWith({
			to: '/staff/tenants/$tenantId/roles/$roleId',
			params: {
				tenantId: '11111111-1111-1111-1111-111111111111',
				roleId: '22222222-2222-2222-2222-222222222222',
			},
			search: { edit: 1 },
		});
	});
});
