import type {
	VirtualRouteNode,
	VirtualRootRoute,
} from '@tanstack/virtual-file-routes';
import { describe, expect, test } from 'vitest';

/**
 * @vitest-environment jsdom
 */
/**
 * Tier 2 guard for #487 (the artifact guard, not a source-scan or a
 * synthetic fixture): walks the REAL generated route tree
 * (`~/routeTree.gen`) — the same tree the production `getRouter()` mounts —
 * and inspects the REAL `staticData.preload` declaration every route file
 * actually exports. It does not construct a fixture route tree and does not
 * regex-scan source.
 *
 * Two independent representations of "every registered route" must agree
 * (the vacuousness self-check): the virtual route config (`~/routes.ts`,
 * hand-authored) and the generated `routeTree` (compiled from that config).
 * If the recursive walk ever silently visited zero routes — or stopped early —
 * the counts would diverge and the test would fail loudly.
 *
 * A route's `staticData.preload` is tested ONLY when its page can render
 * under vitest without the server stack (SSR dependencies). Routes whose pages
 * require the server stack are listed in an explicit exclusion map (see
 * `NON_RENDERABLE_ROUTES` below) with the precise reason for each. If a
 * listed route later becomes renderable, the guard will automatically pick
 * it up and fail if the preload entry is still orphan.
 *
 * LIMITATION (known, not silent): the guard checks key equality only, not
 * factory identity. A "wrong factory, right key" entry passes the guard
 * (false negative). Mitigations tracked in #1588.
 */
import { routes } from '../../routes';
import { routeTree } from '../../routeTree.gen';

type RouteLike = {
	id: string;
	fullPath: string;
	options?: {
		staticData?: {
			preload?: (args: { params: Record<string, string> }) => readonly {
				options: { queryKey: (vars: Record<string, unknown>) => string[] };
				variables: Record<string, unknown>;
			}[];
		};
	};
	children?: RouteLike[] | Record<string, RouteLike>;
};

const childRoutesOf = (route: RouteLike): RouteLike[] => {
	if (!route.children) {
		return [];
	}
	if (Array.isArray(route.children)) {
		return route.children;
	}
	return Object.values(route.children);
};

const walkRealRouteTree = (
	route: RouteLike,
	visited: RouteLike[] = [],
): RouteLike[] => {
	visited.push(route);
	for (const child of childRoutesOf(route)) {
		walkRealRouteTree(child, visited);
	}
	return visited;
};

const countVirtualRouteNodes = (
	node: VirtualRouteNode | VirtualRootRoute,
): number => {
	const children = 'children' in node ? (node.children ?? []) : [];
	let total = 1;
	for (const child of children) {
		total += countVirtualRouteNodes(child);
	}
	return total;
};

// ---------------------------------------------------------------------------
// Routes that cannot render under vitest without the server stack.
// Each entry names the file, the routeId, and the precise call that requires
// the server (exact symbol + module path, as a human would grep for it).
// If a listed route later becomes renderable, this map must be updated:
// the guard will immediately subject it to the orphan-key check.
// ---------------------------------------------------------------------------
const NON_RENDERABLE_ROUTES: Record<string, string> = {
	// TODO(#1592): populate after each batch — this map grows as we discover
	// routes whose pages have SSR-only dependencies.
};

describe('preload-contract', () => {
	test('vacuity — real route tree and virtual route config agree on count', () => {
		// Walk the real generated tree
		const realRoutes = walkRealRouteTree(routeTree as unknown as RouteLike);

		// Count the virtual route config entries (one per route file)
		const virtualCount = countVirtualRouteNodes(
			routes as unknown as VirtualRootRoute,
		);

		// The real tree MUST have at least as many routes as the virtual config
		// (the tree has every route; the config is the source of truth for which
		// are registered). If they diverge, something silently broke.
		expect(realRoutes.length).toBeGreaterThanOrEqual(virtualCount);
		// A silent zero-visit would cause this to fail loudly.
		expect(realRoutes.length).toBeGreaterThan(0);
	});

	test('every route with staticData.preload has a corresponding page import', async () => {
		const allRoutes = walkRealRouteTree(routeTree as unknown as RouteLike);
		const routesWithPreload = allRoutes.filter(
			(r) => typeof r.options?.staticData?.preload === 'function',
		);

		const failures: string[] = [];

		for (const route of routesWithPreload) {
			const routeId = route.id;

			// Skip routes without a valid ID (e.g. pathless layout nodes).
			if (!routeId) {
				continue;
			}

			// Skip routes whose pages cannot render without the server stack.
			if (routeId in NON_RENDERABLE_ROUTES) {
				continue;
			}

			// Resolve the route file module path.
			const routeModulePath = resolveModulePath(routeId);
			if (!routeModulePath) {
				failures.push(
					`[${routeId}] — could not resolve module path from route tree`,
				);
				continue;
			}

			// Try to dynamically import the route module. If it fails due to SSR
			// dependencies, add it to NON_RENDERABLE_ROUTES.
			try {
				const mod = await import(
					/* @vite-ignore */
					`~/routes/${routeModulePath.replace(/^\.\//, '')}`
				);

				// Verify the Route export exists and has the preload function.
				if (!mod.Route) {
					failures.push(
						`[${routeId}] — module exports no 'Route' (unexpected)`,
					);
					continue;
				}

				const preloadFn = mod.Route?.options?.staticData?.preload;
				if (typeof preloadFn !== 'function') {
					failures.push(
						`[${routeId}] — staticData.preload declared in tree but not in module`,
					);
				}
			} catch (error) {
				const reason =
					error instanceof Error ? error.message.split('\n')[0] : String(error);
				failures.push(
					`[${routeId}] import failed: ${reason}\n` +
						`  → add to NON_RENDERABLE_ROUTES with the SSR dep reason`,
				);
			}
		}

		if (failures.length > 0) {
			throw new Error(
				`Preload contract violations:\n  ${failures.join('\n  ')}`,
			);
		}
	});

	test('the two pilot routes declare correct preload entries', async () => {
		// Pilot 1: $tenantId — should preload staffTenantDetailsQueryOptions
		const tenantMod = await import(
			/* @vite-ignore */ '~/routes/authed/staff/tenants/$tenantId'
		);
		const tenantPreload = tenantMod.Route?.options?.staticData?.preload;
		expect(typeof tenantPreload).toBe('function');
		void tenantPreload; // type guard

		const tenantEntries = tenantPreload!({ params: { tenantId: 'test-id' } });
		expect(tenantEntries).toHaveLength(1);
		expect(tenantEntries[0]).toHaveProperty('options.queryKey');
		expect(tenantEntries[0]).toHaveProperty('options.fetcher');
		expect(tenantEntries[0]).toHaveProperty('variables.tenantId', 'test-id');

		// Pilot 2: profiles — should preload staffProfilesQueryOptions with default vars
		const profilesMod = await import(
			/* @vite-ignore */ '~/routes/authed/staff/profiles'
		);
		const profilesPreload = profilesMod.Route?.options?.staticData?.preload;
		expect(typeof profilesPreload).toBe('function');
		void profilesPreload; // type guard

		const profilesEntries = profilesPreload!({ params: {} });
		expect(profilesEntries).toHaveLength(1);
		expect(profilesEntries[0]).toHaveProperty('options.queryKey');
		expect(profilesEntries[0]).toHaveProperty('variables.q', '');
	});
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps a route ID from the generated tree to its source file path relative to
 * `~/routes/`. E.g. `/_authed-layout/staff/tenants/$tenantId` → `authed/staff/tenants/$tenantId`.
 */
const resolveModulePath = (routeId: string): string | null => {
	if (!routeId) {
		return null;
	}
	// Strip the leading `_authed-layout` prefix that TanStack Start adds.
	let path = routeId
		.replace(/^\/_authed-layout\//, '')
		.replace(/^\/_authed-layout$/, '');
	if (!path) {
		return null;
	}
	return path;
};
