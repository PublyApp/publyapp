import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import type { RoleSection } from './$roleId/_sections';
import { ROLE_SECTION_ROUTES } from './$roleId/_sections';
import type { RoleDetailsSearchParams } from './_role-details-search';

export const RoleSectionNavLink = ({
	activeSection,
	count,
	label,
	roleId,
	section,
	tenantId,
}: {
	activeSection: RoleSection;
	count?: number;
	label: string;
	roleId: string;
	section: RoleSection;
	tenantId: string;
}) => {
	const content: ReactNode = (
		<>
			<span>{label}</span>
			{count === undefined ? null : (
				<span className="publy-role-count-badge">{count}</span>
			)}
		</>
	);

	if (activeSection === section) {
		return (
			<span
				aria-current="page"
				className="inline-flex items-center gap-2 border-b-2 border-foreground px-3 pb-2.5 text-sm font-medium text-foreground"
			>
				{content}
			</span>
		);
	}

	return (
		<Link
			to={ROLE_SECTION_ROUTES[section]}
			params={{ tenantId, roleId }}
			// The Overview link's path is a PREFIX of every other section's, so
			// the router's default prefix matching would mark it active — and
			// stamp a second `aria-current="page"` on the nav — while the user
			// is on Permissions or Members. Sections are mutually exclusive.
			activeOptions={{ exact: true }}
			// Sections are path segments now (#977), but the edit drawer's
			// `?edit=1` flag is still view state that belongs on whichever
			// section you are looking at — and the drawer is hosted by the
			// layout, so it survives a section switch. Carry the search across
			// rather than silently dropping it.
			search={(previous): RoleDetailsSearchParams => ({
				// Only the details layout owns `?edit=1`; anything else in the
				// merged search belongs to sibling routes, not to a section URL.
				edit: previous.edit === 1 ? 1 : undefined,
			})}
			className="inline-flex items-center gap-2 border-b-2 border-transparent px-3 pb-2.5 text-sm font-normal text-muted-foreground transition-colors hover:text-foreground"
		>
			{content}
		</Link>
	);
};
