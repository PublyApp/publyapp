import { afterEach, describe, expect, test } from 'vitest';

import { useUiStore } from './ui-store';

describe('ui-store breadcrumb override', () => {
	afterEach(() => {
		useUiStore.setState({
			breadcrumbOverride: null,
			breadcrumbOverrideOwner: null,
		});
	});

	test('publishes a trail and clears it via the returned dispose', () => {
		const trail = [
			{ label: 'Tenants', to: '/staff/tenants' },
			{ label: 'Acme Corporation', to: '/staff/tenants/acme' },
			{ label: 'Profiles', to: '/staff/tenants/acme/profiles' },
			{ label: 'Approvers' },
		];

		expect(useUiStore.getState().breadcrumbOverride).toBeNull();

		const dispose = useUiStore.getState().setBreadcrumbOverride(trail);

		expect(useUiStore.getState().breadcrumbOverride).toEqual(trail);

		dispose();

		expect(useUiStore.getState().breadcrumbOverride).toBeNull();
	});

	test('a dispose from a superseded page does not erase page B’s override', () => {
		const trailA = [{ label: 'A' }];
		const trailB = [{ label: 'B' }];

		// Page A publishes, then page B publishes (adopting ownership) before
		// page A's cleanup runs.
		const disposeA = useUiStore.getState().setBreadcrumbOverride(trailA);
		const disposeB = useUiStore.getState().setBreadcrumbOverride(trailB);

		// Page A's late cleanup fires with its own (now stale) dispose.
		disposeA();

		// Page B's override survives — A no longer owns it.
		expect(useUiStore.getState().breadcrumbOverride).toEqual(trailB);

		// Page B's own cleanup, still the owner, clears successfully.
		disposeB();

		expect(useUiStore.getState().breadcrumbOverride).toBeNull();
	});
});
