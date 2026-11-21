import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	type FakeClientCall,
	type FakeResponse,
	type PreloadDestination,
	widenOptions,
} from '~/__tests__/support/preload-harness';
import { respond } from '~/__tests__/support/preload-mocks';
import {
	expectColdPickerHoverWarmsNothing,
	expectPickerOnlyHoverThenClick,
	expectWarmPickerHoverThenClick,
	PICKER_RESPONSE,
	requestTenantIds,
	TENANT_ID,
} from '~/__tests__/support/tenant-preload-support';

type Search = Record<string, string>;
type Endpoint = readonly string[];

type TenantRouteSuite = {
	/** e.g. `tenant drafts`, in the describe title. */
	title: string;
	route: { options: unknown };
	linkTo: string;
	path: string;
	linkLabel: string;
	pageTestId: string;
};

export type TenantPreloadScenario = {
	title: string;
	/** Search the link carries (a non-default URL state). */
	search?: Search;
	/** Request assertions run after the hover, on top of the tenant scoping. */
	assertRequests?: () => void;
};

export type TenantPreloadSuite = TenantRouteSuite & {
	/** Every endpoint the picker-warm hover fetches once. */
	endpoints: readonly Endpoint[];
	/** The endpoints that must be scoped to the resolved tenant (default: all). */
	scoped?: readonly Endpoint[];
	/** Payloads the page needs to mount its queries; other calls get `{}`. */
	respond?: (call: FakeClientCall) => FakeResponse;
	/** Runs before the warm hover (e.g. fake timers). */
	setup?: () => void;
	/** Checks of the default URL. */
	assertRequests?: () => void;
	/** Extra URL states; the default URL is always checked first. */
	variants?: readonly TenantPreloadScenario[];
};

export type PickerOnlySuite = TenantRouteSuite & {
	/** The picker payload (default: one active workspace). */
	picker?: FakeResponse;
};

const destinationFor = (suite: TenantRouteSuite, search?: Search) =>
	widenOptions<PreloadDestination>({
		linkTo: suite.linkTo,
		linkSearch: search,
		path: suite.path,
		options: suite.route.options,
	});

const useTenantRouteLifecycle = () => {
	beforeEach(() => {
		respond.mockImplementation((): FakeResponse => ({}));
	});

	afterEach(() => {
		vi.useRealTimers();
		cleanup();
		vi.restoreAllMocks();
		respond.mockReset();
		window.localStorage.clear();
	});
};

/** Expands a tenant route's preload contract: with the workspace picker warm,
 * hover fetches each endpoint once scoped to the resolved tenant and the click
 * reuses them; with the picker cold, hover warms nothing. */
export const defineTenantPreloadSuite = (suite: TenantPreloadSuite) => {
	const scenarios: readonly TenantPreloadScenario[] = [
		{ title: 'default URL', assertRequests: suite.assertRequests },
		...(suite.variants ?? []),
	];
	const scoped = suite.scoped ?? suite.endpoints;

	describe(`#2340 ${suite.title} route preload`, () => {
		useTenantRouteLifecycle();

		test.each(scenarios)(
			'$title: hovering with the workspace picker warm fetches every page query once, scoped to the resolved tenant, and the click reuses them',
			async (scenario) => {
				suite.setup?.();
				if (suite.respond !== undefined) {
					respond.mockImplementation(suite.respond);
				}
				await expectWarmPickerHoverThenClick({
					destination: destinationFor(suite, scenario.search),
					linkLabel: suite.linkLabel,
					pageTestId: suite.pageTestId,
					endpoints: [...suite.endpoints],
					respond,
					assertRequests: () => {
						for (const endpoint of scoped) {
							expect(requestTenantIds(respond, ...endpoint)).toEqual([
								TENANT_ID,
							]);
						}
						scenario.assertRequests?.();
					},
				});
			},
		);

		test('hovering before the picker has loaded warms nothing and raises no error', async () => {
			await expectColdPickerHoverWarmsNothing({
				destination: destinationFor(suite),
				linkLabel: suite.linkLabel,
				respond,
			});
		});
	});
};

/** A route that only reads the workspace picker: hovering with a cold cache
 * warms the picker once and the click reads it without a new request. */
export const definePickerOnlyPreloadSuite = (suite: PickerOnlySuite) => {
	describe(`#2340 ${suite.title} route preload`, () => {
		useTenantRouteLifecycle();

		test('hovering with a cold picker cache warms the picker once and the click reads it without a new request', async () => {
			respond.mockReturnValue(suite.picker ?? PICKER_RESPONSE);
			await expectPickerOnlyHoverThenClick({
				destination: destinationFor(suite),
				linkLabel: suite.linkLabel,
				pageTestId: suite.pageTestId,
				respond,
			});
		});
	});
};
