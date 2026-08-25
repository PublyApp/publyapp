import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import type { ProfileSection } from './$profileId/_sections';
import { PROFILE_SECTION_ROUTES } from './$profileId/_sections';
import type { ProfileDetailsSearchParams } from './_profile-details-search';

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
			to={PROFILE_SECTION_ROUTES[section]}
			params={{ tenantId, profileId }}
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
			search={(previous): ProfileDetailsSearchParams => ({
				// Only the details layout owns `?edit=1`; anything else in the
				// merged search belongs to sibling routes, not to a section URL.
				edit: previous.edit === 1 ? 1 : undefined,
			})}
			className="inline-flex items-center gap-2 border-b-2 border-transparent px-3 pb-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
		>
			{content}
		</Link>
	);
};
