import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	countCallsByPath,
	type FakeClientCall,
	type FakeResponse,
	type PreloadDestination,
	pathEndsWith,
	preloadedQueries,
	renderPreloadScenario,
	requestQueryParameters,
	warmedSnapshot,
	widenOptions,
} from '~/__tests__/support/preload-harness';
import { respond } from '~/__tests__/support/preload-mocks';

/** An endpoint suffix and how many distinct queries must hit it. */
export type PreloadEndpoint = readonly [readonly string[], number];
type PreloadResponse = readonly [readonly string[], FakeResponse];
type Search = Record<string, string>;

export type PreloadVariant = {
	title: string;
	/** Search the link carries (a non-default URL state). */
	search?: Search;
	/** Overrides the suite's endpoints for this URL. */
	endpoints?: readonly PreloadEndpoint[];
	/** Endpoint counts after the click (default: `endpoints`); pins side-panel
	 * calls that hit the same endpoint. */
	clickEndpoints?: readonly PreloadEndpoint[];
	/** Overrides the suite's warmed-query count for this URL. */
	warmed?: number;
	/** Request parameters the URL must put on one endpoint's calls. */
	request?: { suffix: readonly string[]; params: Search };
};

export type PreloadSuite = {
	/** e.g. `staff tenant details`, in the describe title. */
	title: string;
	route: { options: unknown };
	linkTo: string;
	path: string;
	linkLabel: string;
	/** A REAL parent route the destination nests under. */
	parent?: { path: string; childPath: string; options: unknown };
	/** Payloads the page needs to mount its queries; other calls get `{}`. */
	responses?: readonly PreloadResponse[];
	/** Each endpoint the page reads on the default URL. */
	endpoints: readonly PreloadEndpoint[];
	/** How many queries the loader warms on the default URL. */
	warmed: number;
	/** Extra URL states; the default URL is always checked first. */
	variants?: readonly PreloadVariant[];
	/** Set for a list page: hover must not mount it, click must. */
	pageTestId?: string;
	/** Endpoints hover must not call but the clicked page mounts. */
	lazyEndpoints?: readonly (readonly string[])[];
	/** Bespoke tests that run inside the suite's describe; they get a builder
	 * for the destination under a given link search. */
	extraTests?: (destination: (search?: Search) => PreloadDestination) => void;
};

type Scenario = Required<
	Pick<PreloadVariant, 'title' | 'endpoints' | 'warmed'>
> &
	Pick<PreloadVariant, 'search' | 'request' | 'clickEndpoints'>;

const buildDestination = (suite: PreloadSuite, search?: Search) =>
	widenOptions<PreloadDestination>({
		linkTo: suite.linkTo,
		linkSearch: search,
		path: suite.path,
		parent: suite.parent,
		options: suite.route.options,
	});

const expectEndpointCalls = (
	scenario: Scenario,
	endpoints: readonly PreloadEndpoint[] = scenario.endpoints,
) => {
	for (const [suffix, count] of endpoints) {
		expect(countCallsByPath(respond, ...suffix)).toBe(count);
	}
	if (scenario.request !== undefined) {
		expect(
			requestQueryParameters(respond, ...scenario.request.suffix),
		).toContainEqual(expect.objectContaining(scenario.request.params));
	}
};

const lazyCalls = (suite: PreloadSuite) =>
	(suite.lazyEndpoints ?? []).map((suffix) =>
		countCallsByPath(respond, ...suffix),
	);

const hover = async (suite: PreloadSuite, scenario: Scenario) => {
	const { queryClient } = renderPreloadScenario({
		destination: buildDestination(suite, scenario.search),
		linkLabel: suite.linkLabel,
	});
	const link = await screen.findByRole('link', { name: suite.linkLabel });
	expect(respond).not.toHaveBeenCalled();

	fireEvent.mouseEnter(link);
	await waitFor(() => expectEndpointCalls(scenario));
	await waitFor(() => {
		expect(queryClient.isFetching()).toBe(0);
	});
	expect(lazyCalls(suite)).toEqual(lazyCalls(suite).map(() => 0));

	const warmed = preloadedQueries(queryClient);
	expect(warmed).toHaveLength(scenario.warmed);
	expect(warmed.every((query) => query.state.data !== undefined)).toBe(true);
	// Preloading never navigates: nothing observes the warmed queries yet.
	expect(warmed.every((query) => query.getObserversCount() === 0)).toBe(true);
	expect(screen.queryByRole('link', { name: suite.linkLabel })).not.toBeNull();
	if (suite.pageTestId !== undefined) {
		expect(screen.queryByTestId(suite.pageTestId)).toBeNull();
	}

	return { queryClient, link, warmed, snapshot: warmedSnapshot(warmed) };
};

const hoverThenClick = async (suite: PreloadSuite, scenario: Scenario) => {
	const hovered = await hover(suite, scenario);

	fireEvent.click(hovered.link);
	await waitFor(() => {
		if (suite.pageTestId !== undefined) {
			expect(screen.getByTestId(suite.pageTestId)).toBeTruthy();
		}
		// The page's own hooks observe the very queries the loader warmed.
		expect(hovered.warmed.every((q) => q.getObserversCount() > 0)).toBe(true);
	});
	await waitFor(() => {
		expect(hovered.queryClient.isFetching()).toBe(0);
	});
	await waitFor(() => {
		for (const count of lazyCalls(suite)) {
			expect(count).toBeGreaterThan(0);
		}
	});

	return hovered;
};

const toScenario = (
	suite: PreloadSuite,
	variant: PreloadVariant,
): Scenario => ({
	...variant,
	endpoints: variant.endpoints ?? suite.endpoints,
	warmed: variant.warmed ?? suite.warmed,
});

const respondFrom =
	(responses: readonly PreloadResponse[]) =>
	(call: FakeClientCall): FakeResponse =>
		responses.find(([suffix]) => pathEndsWith(call, ...suffix))?.[1] ?? {};

/** Expands one route's preload contract into the two standard tests per URL
 * (hover warms each query once; click reuses them with no refetch). */
export const definePreloadSuite = (suite: PreloadSuite) => {
	const scenarios = [{ title: 'default URL' }, ...(suite.variants ?? [])].map(
		(variant) => toScenario(suite, variant),
	);

	describe(`#2340 ${suite.title} route preload`, () => {
		beforeEach(() => {
			respond.mockImplementation(respondFrom(suite.responses ?? []));
		});

		afterEach(() => {
			cleanup();
			vi.restoreAllMocks();
			respond.mockReset();
		});

		test.each(scenarios)(
			'$title: hovering the link warms every page query exactly once',
			async (scenario) => {
				await hover(suite, scenario);
			},
		);

		test.each(scenarios)(
			'$title: clicking after the hover reads the warmed queries with no refetch',
			async (scenario) => {
				const { warmed, snapshot } = await hoverThenClick(suite, scenario);

				for (const query of warmed) {
					expect(query.state.dataUpdatedAt).toBe(snapshot.get(query.queryKey));
				}
				expectEndpointCalls(
					scenario,
					scenario.clickEndpoints ?? scenario.endpoints,
				);
			},
		);

		suite.extraTests?.((search) => buildDestination(suite, search));
	});
};
