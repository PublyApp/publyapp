import { useQuery, useQueryClient } from '@tanstack/react-query';
import QueryDisplay from '~/components/query-display';
import { Skeleton } from '~/components/ui/skeleton';
import type { CrumbSpec } from '~/lib/navigation/breadcrumbs';

type EntityCrumbSpec = Extract<CrumbSpec, { kind: 'entity' }>;

const EntityCrumbFallback = () => (
	<span
		className="app-shell-breadcrumb-muted"
		data-testid="app-shell-breadcrumb-entity-fallback"
	>
		—
	</span>
);

/**
 * Renders one `entity` crumb slot. The crumb COUNT is already final on the
 * first frame (it comes from the route declaration, i.e. the URL, not from
 * data) — this component only ever swaps what fills ONE already-reserved
 * slot: a fixed-height skeleton while the name loads, the resolved name on
 * success, or a muted dash on error/404. It never adds or removes a crumb,
 * so the shell's row never changes height or crumb count (#997 invariant).
 *
 * The query key is built from the SAME `xxxDetailsQueryOptions` factory the
 * page itself queries (see the `*CrumbQuery` helpers next to each domain's
 * query module), so TanStack Query dedupes the request — a page the user
 * navigated from already cached the entity, and the name paints instantly.
 */
export const EntityCrumb = ({
	spec,
	params,
}: {
	spec: EntityCrumbSpec;
	params: Record<string, string>;
}) => {
	const queryClient = useQueryClient();
	const { queryKey, queryFn } = spec.query(params, { queryClient });
	// preload-exempt: the key is the page's own *DetailsQueryOptions key, warmed by that page's loader
	const query = useQuery({
		queryKey: [...queryKey],
		queryFn,
		staleTime: 30_000,
	});

	return (
		<QueryDisplay
			query={query}
			variant="discreet"
			LoadingSlot={
				<Skeleton
					className="inline-block h-3 w-20 align-middle"
					data-testid="app-shell-breadcrumb-entity-skeleton"
				/>
			}
			ErrorSlot={<EntityCrumbFallback />}
			EmptySlot={<EntityCrumbFallback />}
		>
			{({ data }) => {
				const name = spec.select(data);

				if (!name) {
					return <EntityCrumbFallback />;
				}

				// Entity names are user-supplied and arbitrarily long (a tenant, role,
				// or user's real display name — see #973). Unlike the label crumbs
				// (short, developer-controlled i18n strings), this is the one breadcrumb
				// segment that must defend its own layout: `block truncate` + `title`
				// mirrors the repo's established "long user-supplied string in
				// constrained space" pattern (list-row cells: `_staff-user-name-cell.tsx`,
				// `staff-users.tsx`'s email column, `docs/guides/front/conventions.md`'s
				// "Long descriptions… truncate" rule) rather than inventing a new one.
				// `title` is the conventional minimum for exposing the full value on
				// hover and to assistive technology; the repo has no tooltip primitive in
				// use for this pattern (`components/ui/tooltip.tsx` backs icon-only
				// affordances like `copy-button.tsx`, not inline text overflow) — a
				// second on-canvas tooltip would be the inconsistency, not this one.
				// `block` (not `inline-block`) matches every existing "block truncate"
				// call site and, combined with the `min-w-0` now on the ancestor
				// `.app-shell-breadcrumb-link`/`-current`/`-muted` flex item (see
				// `app.css`), lets this span shrink to whatever width the breadcrumb row
				// actually has left and ellipsize instead of overflowing it.
				return (
					<span
						className="block truncate"
						title={name}
						data-testid="app-shell-breadcrumb-entity-name"
					>
						{name}
					</span>
				);
			}}
		</QueryDisplay>
	);
};
