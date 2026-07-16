import { afterEach, describe, expect, test } from 'vitest';

import { useUiStore } from './ui-store';

describe('ui-store breadcrumb override', () => {
	afterEach(() => {
		useUiStore.getState().clearBreadcrumbOverride();
	});

	test('publishes and clears a generic breadcrumb trail', () => {
		const trail = [
			{ label: 'Tenants', to: '/staff/tenants' },
			{ label: 'Acme Corporation', to: '/staff/tenants/acme' },
			{ label: 'Profiles', to: '/staff/tenants/acme/profiles' },
			{ label: 'Approvers' },
		];

		expect(useUiStore.getState().breadcrumbOverride).toBeNull();

		useUiStore.getState().setBreadcrumbOverride(trail);

		expect(useUiStore.getState().breadcrumbOverride).toEqual(trail);

		useUiStore.getState().clearBreadcrumbOverride();

		expect(useUiStore.getState().breadcrumbOverride).toBeNull();
	});
});
