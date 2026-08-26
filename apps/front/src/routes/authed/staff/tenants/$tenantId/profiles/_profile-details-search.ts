/** Search state for the tenant-profile detail LAYOUT route.
 *
 * Since #977 the three sections (overview / permissions / members) are real
 * path segments, not `?tab=` — "which section of this resource am I looking
 * at" is a distinct, linkable location, not view state. What stays here is
 * the edit drawer's open flag, which genuinely modifies the page it sits on
 * and is valid on every section.
 */
export type ProfileDetailsSearchParams = {
	edit?: 1;
};

export type ProfileDetailsSearchParamInput = {
	edit?: unknown;
};

/** The flag round-trips as the NUMBER 1. A string value would be JSON-quoted
 * by the router's search serializer. Malformed values return an explicit
 * undefined edit key because validated search merges over raw parsed search.
 *
 * NOTE: this is the DETAIL page's flag (`?edit=1`). The profiles LIST page
 * carries `?edit=<profileId>` — an id that says *which row* — and the two are
 * deliberately not unified; see the id-carrying-param rule in
 * `docs/guides/front/conventions.md`. */
export const parseProfileDetailsSearchParams = (
	search: ProfileDetailsSearchParamInput,
): ProfileDetailsSearchParams => {
	const isEditOpen =
		search.edit === 1 ||
		(typeof search.edit === 'string' && search.edit.trim() === '1');

	return { edit: isEditOpen ? 1 : undefined };
};

/** The two sections that used to be addressed as `?tab=<name>` before #977.
 * `overview` is deliberately absent: it was already the "no param" default,
 * so it needs no redirect — dropping the param leaves the index route, which
 * IS overview. */
type LegacyProfileDetailsTab = 'members' | 'permissions';

export type ProfileOverviewSearchParams = {
	tab?: LegacyProfileDetailsTab;
};

export type ProfileOverviewSearchParamInput = {
	tab?: unknown;
};

/** Legacy `?tab=` support, declared ONLY on the overview (index) route so the
 * param never survives on a section path. Bookmarks and copy-pasted links
 * carrying `?tab=permissions` / `?tab=members` are in the wild; the index
 * route reads this and redirects to the matching path segment (see
 * `$profileId/index.tsx`). Anything else — `overview`, a typo, a non-string —
 * resolves to `undefined`, which drops the key from the address bar rather
 * than persisting a default. */
export const parseProfileOverviewSearchParams = (
	search: ProfileOverviewSearchParamInput,
): ProfileOverviewSearchParams => ({
	tab:
		search.tab === 'permissions' || search.tab === 'members'
			? search.tab
			: undefined,
});
