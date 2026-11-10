import type { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { expect } from 'vitest';
import { tenantsForPickerQueryOptions } from '~/lib/query/tenants-for-picker';
import {
	type FakeClientCall,
	type PreloadDestination,
	countCallsByPath,
	pathEndsWith,
	preloadedQueries,
	renderPreloadScenario,
	warmedSnapshot,
} from '~/routes/authed/staff/_preload-test-harness';

import { TenantStatusObject } from '@org/client-ts/models/index';

/**
 * #2340 — support for the tenant routes' `*.preload.test.tsx` files. It mirrors
 * the staff harness (`staff/_preload-test-harness.tsx`, reused for the router,
 * the QueryClient and the fake Kiota client) and adds what the tenant side
 * needs: the workspace picker, and a client that tells which tenant a request
 * was scoped to (`getOrCreateClient(tenantId)` prefixes the call path with it).
 */
export const TENANT_ID = 'tenant-preload-1';
const PICKER = ['auth', 'tenantsForPicker', 'get'] as const;

export const PICKER_RESPONSE = {
	tenants: [{ id: TENANT_ID, name: 'Vanilla Coast', status: 'active' }],
	activeCount: 1,
	totalCount: 1,
	hasDeletedTenants: false,
	hasSuspendedTenants: false,
};

type RespondMock = { mock: { calls: readonly (readonly unknown[])[] } };

/** The tenant id (first path segment) of every call to the endpoint ending in `suffix`. */
export const requestTenantIds = (
	respond: RespondMock,
	...suffix: string[]
): string[] => {
	const tenantIds: string[] = [];
	for (const args of respond.mock.calls) {
		const call = args[0] as FakeClientCall;
		if (pathEndsWith(call, ...suffix)) {
			tenantIds.push(call.path[0] ?? '');
		}
	}
	return tenantIds;
};

/** The picker data the loader resolves the tenant from (a fresh cache entry, as
 * the app shell's own picker query leaves it). */
const seedPicker = (queryClient: QueryClient): void => {
	queryClient.setQueryData(tenantsForPickerQueryOptions.queryKey({}), {
		...PICKER_RESPONSE,
		tenants: PICKER_RESPONSE.tenants.map((tenant) => ({
			...tenant,
			code: 'vanilla',
			status: TenantStatusObject.Active,
		})),
	});
};

/** Hover with an empty picker cache: the loader has no tenant, so it warms
 * nothing and the page's own fetch is the first request. */
export const expectColdPickerHoverWarmsNothing = async ({
	destination,
	linkLabel,
	respond,
}: {
	destination: PreloadDestination;
	linkLabel: string;
	respond: RespondMock;
}) => {
	const { queryClient } = renderPreloadScenario({ destination, linkLabel });
	const link = await screen.findByRole('link', { name: linkLabel });

	fireEvent.mouseEnter(link);
	await new Promise((resolve) => setTimeout(resolve, 50));

	expect(respond.mock.calls).toHaveLength(0);
	expect(preloadedQueries(queryClient)).toHaveLength(0);
};

/** Hover a link with the picker cache warm, run the caller's request
 * assertions, then click: every endpoint in `endpoints` was fetched once on
 * hover and the page reads the warmed keys without a new request. */
export const expectWarmPickerHoverThenClick = async ({
	destination,
	linkLabel,
	pageTestId,
	endpoints,
	respond,
	assertRequests,
}: {
	destination: PreloadDestination;
	linkLabel: string;
	pageTestId: string;
	endpoints: (readonly string[])[];
	respond: RespondMock;
	assertRequests: () => void;
}) => {
	const { queryClient } = renderPreloadScenario({ destination, linkLabel });
	seedPicker(queryClient);
	const link = await screen.findByRole('link', { name: linkLabel });
	expect(respond.mock.calls).toHaveLength(0);

	fireEvent.mouseEnter(link);
	await waitFor(() => {
		for (const endpoint of endpoints) {
			expect(countCallsByPath(respond, ...endpoint)).toBe(1);
		}
	});
	await waitFor(() => {
		expect(queryClient.isFetching()).toBe(0);
	});
	assertRequests();

	const warmed = preloadedQueries(queryClient);
	expect(warmed).toHaveLength(endpoints.length);
	const snapshot = warmedSnapshot(warmed);

	fireEvent.click(link);
	await waitFor(() => {
		expect(screen.getByTestId(pageTestId)).toBeTruthy();
	});

	for (const endpoint of endpoints) {
		expect(countCallsByPath(respond, ...endpoint)).toBe(1);
	}
	for (const query of warmed) {
		expect(query.getObserversCount()).toBeGreaterThan(0);
		expect(query.state.dataUpdatedAt).toBe(snapshot.get(query.queryKey));
	}
};

/** Picker-only routes: hovering with a cold cache warms the picker once, and
 * the click reads it without a second request. */
export const expectPickerOnlyHoverThenClick = async ({
	destination,
	linkLabel,
	pageTestId,
	respond,
}: {
	destination: PreloadDestination;
	linkLabel: string;
	pageTestId: string;
	respond: RespondMock;
}) => {
	const { queryClient } = renderPreloadScenario({ destination, linkLabel });
	const link = await screen.findByRole('link', { name: linkLabel });
	expect(respond.mock.calls).toHaveLength(0);

	fireEvent.mouseEnter(link);
	await waitFor(() => {
		expect(countCallsByPath(respond, ...PICKER)).toBe(1);
	});
	await waitFor(() => {
		expect(queryClient.isFetching()).toBe(0);
	});

	const warmed = preloadedQueries(queryClient);
	expect(warmed).toHaveLength(1);
	const snapshot = warmedSnapshot(warmed);

	fireEvent.click(link);
	await waitFor(() => {
		expect(screen.getByTestId(pageTestId)).toBeTruthy();
	});

	expect(countCallsByPath(respond, ...PICKER)).toBe(1);
	for (const query of warmed) {
		expect(query.getObserversCount()).toBeGreaterThan(0);
		expect(query.state.dataUpdatedAt).toBe(snapshot.get(query.queryKey));
	}
};
