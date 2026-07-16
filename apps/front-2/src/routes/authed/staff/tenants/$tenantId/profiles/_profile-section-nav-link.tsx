import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import type {
	ProfileDetailsSearchParams,
	ProfileDetailsTab,
} from './_profile-details-search';

export const ProfileSectionNavLink = ({
	activeTab,
	count,
	label,
	profileId,
	tab,
	tenantId,
}: {
	activeTab: ProfileDetailsTab;
	count?: number;
	label: string;
	profileId: string;
	tab: ProfileDetailsTab;
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

	if (activeTab === tab) {
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
			to="/staff/tenants/$tenantId/profiles/$profileId"
			params={{ tenantId, profileId }}
			search={(previous: ProfileDetailsSearchParams) => ({
				...previous,
				tab: tab === 'overview' ? undefined : tab,
			})}
			className="inline-flex items-center gap-2 border-b-2 border-transparent px-3 pb-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
		>
			{content}
		</Link>
	);
};
