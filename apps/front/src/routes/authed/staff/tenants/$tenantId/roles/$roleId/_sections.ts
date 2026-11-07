/**
 * The tenant-role detail sections, as real path segments (#977).
 *
 * `$roleId.tsx` is the layout route: it owns the identity header, the tab
 * nav, the delete flow and the navigation guard, and each section body is one
 * of its child routes. Overview is the index child, so it has no segment of
 * its own.
 */
const ROLE_SECTION_SEGMENTS = ['permissions', 'members'] as const;

type RoleSectionSegment = (typeof ROLE_SECTION_SEGMENTS)[number];

export type RoleSection = 'overview' | RoleSectionSegment;

/** The registered route template for each section — the `to` every in-app
 * link and imperative navigation uses. */
export const ROLE_SECTION_ROUTES = {
	overview: '/staff/tenants/$tenantId/roles/$roleId',
	permissions: '/staff/tenants/$tenantId/roles/$roleId/permissions',
	members: '/staff/tenants/$tenantId/roles/$roleId/members',
} as const;

const withoutTrailingSlash = (pathname: string): string =>
	pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

const roleDetailsBasePathname = (tenantId: string, roleId: string): string =>
	`/staff/tenants/${tenantId}/roles/${roleId}`;

export const roleSectionPathname = (
	tenantId: string,
	roleId: string,
	section: RoleSection,
): string => {
	const base = roleDetailsBasePathname(tenantId, roleId);

	if (section === 'overview') {
		return base;
	}
	return `${base}/${section}`;
};

/**
 * Every pathname that keeps the `$roleId` LAYOUT mounted — and therefore
 * keeps the edit drawer and its draft alive across a section switch.
 *
 * `$roleId/users` and `$roleId/edit` are deliberately absent: they are
 * flat sibling routes (see `src/routes.ts`), not children of this layout, so
 * navigating to either one unmounts it.
 */
export const isRoleSectionPathname = (
	pathname: string,
	tenantId: string,
	roleId: string,
): boolean => {
	const normalized = withoutTrailingSlash(pathname);
	const base = roleDetailsBasePathname(tenantId, roleId);

	return (
		normalized === base ||
		ROLE_SECTION_SEGMENTS.some((segment) => normalized === `${base}/${segment}`)
	);
};

/** Which section the current pathname is showing — the path-segment
 * equivalent of the old `search.tab ?? 'overview'`. */
export const getActiveRoleSection = (pathname: string): RoleSection => {
	const normalized = withoutTrailingSlash(pathname);

	return (
		ROLE_SECTION_SEGMENTS.find((segment) =>
			normalized.endsWith(`/${segment}`),
		) ?? 'overview'
	);
};
