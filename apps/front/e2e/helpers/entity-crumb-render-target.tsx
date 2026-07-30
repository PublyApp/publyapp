import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CrumbSpec } from '~/lib/navigation/breadcrumbs';
import { EntityCrumb } from '~/lib/navigation/entity-crumb';

type EntityCrumbSpec = Extract<CrumbSpec, { kind: 'entity' }>;

/**
 * Loaded ONLY via `vite.ssrLoadModule()` from `render-entity-crumb.ts` —
 * never imported directly by a `.spec.ts`/`.spec.tsx` file. That distinction
 * matters: Playwright's own test-file loader transforms every `.tsx` file
 * it touches with ITS `playwright/jsx-runtime` (used for ARIA-snapshot-as-
 * JSX authoring), which would turn every JSX element in this file (and in
 * the real `entity-crumb.tsx`, once dragged into that same transform) into
 * `{ __pw_type: 'jsx', ... }` descriptor objects rather than real React
 * elements — `renderToStaticMarkup` throws "Objects are not valid as a
 * React child" the moment one of those reaches it. Loading this file
 * through Vite's own SSR module graph instead (same `vite.config.ts`,
 * same `@vitejs/plugin-react`, same `~/*` alias the real app uses) keeps
 * every JSX element here and inside the real `EntityCrumb` compiled with
 * React's actual automatic runtime.
 *
 * `useQuery`'s success branch must paint on the very first synchronous
 * render — `renderToStaticMarkup` never runs effects, so there is no later
 * pass to resolve a pending query. Pre-seeding the query cache via
 * `setQueryData` before rendering satisfies that: TanStack Query's
 * `useBaseQuery` computes its initial (optimistic) result straight from
 * whatever is already in the cache, which is exactly how its own SSR/
 * hydration path works.
 */
export const renderEntityCrumbMarkup = (name: string): string => {
	const queryKey = ['e2e-hermetic-entity-crumb', name] as const;
	const spec: EntityCrumbSpec = {
		kind: 'entity',
		query: () => ({
			queryKey,
			queryFn: async () => ({ name }),
		}),
		select: (data) => (data as { name: string }).name,
	};

	const queryClient = new QueryClient();
	queryClient.setQueryData([...queryKey], { name });

	const markup = renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<EntityCrumb spec={spec} params={{}} />
		</QueryClientProvider>,
	);

	if (!markup.includes('app-shell-breadcrumb-entity-name')) {
		throw new Error(
			'renderEntityCrumbMarkup: the real EntityCrumb component did not ' +
				'render its success branch (data-testid="app-shell-breadcrumb-' +
				'entity-name" is missing) — the query cache seeding above no ' +
				'longer matches how EntityCrumb reads its query.',
		);
	}

	return markup;
};
