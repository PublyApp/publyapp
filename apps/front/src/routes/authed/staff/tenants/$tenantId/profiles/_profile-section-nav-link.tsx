import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import type { ProfileSection } from './$profileId/_sections';
import type { ProfileDetailsSearchParams } from './_profile-details-search';

const SECTION_ROUTES = {
	overview: '/staff/tenants/$tenantId/profiles/$profileId',
	permissions: '/staff/tenants/$tenantId/profiles/$profileId/permissions',
	members: '/staff/tenants/$tenantId/profiles/$profileId/members',
} as const;

export const ProfileSectionNavLink = ({
	activeSection,
	count,
	label,
	profileId,
	section,
	tenantId,
}: {
	activeSection: ProfileSection;
	count?: number;
	label: string;
	profileId: string;
	section: ProfileSection;
	tenantId: string;
}) => {
	const content: ReactNode = (
		<>
			<span>{label}</span>
			{count === undefined ? null : (
				<span className="publy-profile-count-badge">{count}</span>
			)}
		</>
	);

	if (activeSection === section) {
		return (
			<span
				aria-current="page"
				className="inline-flex items-center gap-2 border-b-2 border-primary px-3 pb-2.5 text-[13px] font-medium text-foreground"
			>
				{content}
			</span>
		);
	}

	return (
		<Link
			to={SECTION_ROUTES[section]}
			params={{ tenantId, profileId }}
			// Sections are path segments now (#977), but the edit drawer's
			// `?edit=1` flag is still view state that belongs on whichever
			// section you are looking at — and the drawer is hosted by the
			// layout, so it survives a section switch. Carry the search across
			// rather than silently dropping it.
			search={(previous: ProfileDetailsSearchParams) => previous}
			className="inline-flex items-center gap-2 border-b-2 border-transparent px-3 pb-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
		>
			{content}
		</Link>
	);
};
