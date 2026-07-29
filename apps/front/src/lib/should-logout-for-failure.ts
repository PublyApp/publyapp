import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

/**
 * Authed-surface `401` means "the active session is invalid — log out" (see
 * `AGENTS.md` / conventions.md's Error Views and Logout invariant). Kept
 * here (rather than imported from `routes/authed/layout.tsx`, which defines
 * the same predicate) so `router.tsx`'s app-wide `QueryCache`/`MutationCache`
 * backstop never has to import a route module — TanStack Router code-splits
 * routes into their own chunks, and pulling a route file into the router's
 * own bootstrap would defeat that for every page, not just authed ones.
 */
export const shouldLogoutForFailure = (error: unknown): boolean => {
	const failure = toApiFailure(error);
	return failure.kind === 'problem' && failure.status === 401;
};
