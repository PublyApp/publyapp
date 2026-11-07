/**
 * The permission-group surface used to live under `…/profiles` (#2290 renamed it to
 * `…/roles`). Old bookmarks must still land on the renamed page, so the frozen stub
 * routes feed their pathname through this pure mapping.
 *
 * `undefined` means "not a legacy profile URL" — the caller then has nothing to redirect.
 */
const LEGACY_PROFILE_PATH = /^\/staff\/(?:tenants\/[^/]+\/)?profiles(?=\/|$)/;

export const legacyProfileRedirectHref = (
	pathname: string,
): string | undefined =>
	LEGACY_PROFILE_PATH.test(pathname)
		? pathname.replace('/profiles', '/roles')
		: undefined;
