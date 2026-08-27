/**
 * The tenant-profile detail sections, as real path segments (#977).
 *
 * `$profileId.tsx` is the layout route: it owns the identity header, the tab
 * nav, the delete flow and the navigation guard, and each section body is one
 * of its child routes. Overview is the index child, so it has no segment of
 * its own.
 */
const PROFILE_SECTION_SEGMENTS = ['permissions', 'members'] as const;

type ProfileSectionSegment = (typeof PROFILE_SECTION_SEGMENTS)[number];

export type ProfileSection = 'overview' | ProfileSectionSegment;

/** The registered route template for each section — the `to` every in-app
 * link and imperative navigation uses. */
export const PROFILE_SECTION_ROUTES = {
	overview: '/staff/tenants/$tenantId/profiles/$profileId',
	permissions: '/staff/tenants/$tenantId/profiles/$profileId/permissions',
	members: '/staff/tenants/$tenantId/profiles/$profileId/members',
} as const;

const withoutTrailingSlash = (pathname: string): string =>
	pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

const profileDetailsBasePathname = (
	tenantId: string,
	profileId: string,
): string => `/staff/tenants/${tenantId}/profiles/${profileId}`;

export const profileSectionPathname = (
	tenantId: string,
	profileId: string,
	section: ProfileSection,
): string => {
	const base = profileDetailsBasePathname(tenantId, profileId);

	if (section === 'overview') return base;
	return `${base}/${section}`;
};

/**
 * Every pathname that keeps the `$profileId` LAYOUT mounted — and therefore
 * keeps the edit drawer and its draft alive across a section switch.
 *
 * `$profileId/users` and `$profileId/edit` are deliberately absent: they are
 * flat sibling routes (see `src/routes.ts`), not children of this layout, so
 * navigating to either one unmounts it.
 */
export const isProfileSectionPathname = (
	pathname: string,
	tenantId: string,
	profileId: string,
): boolean => {
	const normalized = withoutTrailingSlash(pathname);
	const base = profileDetailsBasePathname(tenantId, profileId);

	return (
		normalized === base ||
		PROFILE_SECTION_SEGMENTS.some(
			(segment) => normalized === `${base}/${segment}`,
		)
	);
};

/** Which section the current pathname is showing — the path-segment
 * equivalent of the old `search.tab ?? 'overview'`. */
export const getActiveProfileSection = (pathname: string): ProfileSection => {
	const normalized = withoutTrailingSlash(pathname);

	return (
		PROFILE_SECTION_SEGMENTS.find((segment) =>
			normalized.endsWith(`/${segment}`),
		) ?? 'overview'
	);
};
