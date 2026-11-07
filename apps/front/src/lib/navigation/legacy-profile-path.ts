/**
 * The permission-group surface used to live under `…/profiles` (#2290 renamed it to
 * `…/roles`). Old bookmarks must still land on the renamed page, so the frozen stub
 * routes feed their pathname through this pure mapping.
 *
 * `searchStr` (the raw query string, leading `?` included) rides along so a bookmarked
 * filtered list keeps its filters. The fallback is unreachable from the frozen stubs —
 * it only exists so the redirect href is always a `string`.
 */
const LEGACY_PROFILE_PATH = /^\/staff\/(?:tenants\/[^/]+\/)?profiles(?=\/|$)/;

export const legacyProfileRedirectHref = (
	pathname: string,
	searchStr = '',
): string => {
	const href = LEGACY_PROFILE_PATH.test(pathname)
		? pathname.replace('/profiles', '/roles')
		: '/staff/roles';
	return `${href}${searchStr}`;
};
