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

	test('an owner-scoped clear from a superseded page does not erase page B’s override', () => {
		const ownerA = Symbol('page-a');
		const ownerB = Symbol('page-b');
		const trailA = [{ label: 'A' }];
		const trailB = [{ label: 'B' }];

		// Page A publishes, then page B publishes (adopting ownership) before
		// page A's cleanup runs.
		useUiStore.getState().setBreadcrumbOverride(trailA, ownerA);
		useUiStore.getState().setBreadcrumbOverride(trailB, ownerB);

		// Page A's late cleanup fires with its own (now stale) token.
		useUiStore.getState().clearBreadcrumbOverride(ownerA);

		// Page B's override survives — A no longer owns it.
		expect(useUiStore.getState().breadcrumbOverride).toEqual(trailB);

		// Page B's own cleanup, still the owner, clears successfully.
		useUiStore.getState().clearBreadcrumbOverride(ownerB);

		expect(useUiStore.getState().breadcrumbOverride).toBeNull();
	});
});
