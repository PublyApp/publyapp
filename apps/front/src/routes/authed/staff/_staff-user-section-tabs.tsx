import { Link, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';

import {
	StaffUserOverviewContext,
	type StaffUserOverviewContextValue,
} from './staff-users/$userId/_overview-context';

type StaffUserSection = 'overview' | 'permissions' | 'activity' | 'settings';

export type { StaffUserSection };

/** The section tab strip plus the routed outlet wrapped in the overview
 * context provider. Extracted from the route component so it stays
 * reviewable in isolation. */
export const StaffUserSectionTabs = ({
	userId,
	activeSection,
	contextValue,
}: {
	userId: string;
	activeSection: StaffUserSection;
	contextValue: StaffUserOverviewContextValue;
}) => {
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<Tabs value={activeSection}>
			<TabsList variant="line">
				<TabsTrigger
					value="overview"
					render={<Link to="/staff/staff-users/$userId" params={{ userId }} />}
				>
					{t('common:overview')}
				</TabsTrigger>
				<TabsTrigger
					value="permissions"
					render={
						<Link
							to="/staff/staff-users/$userId/permissions"
							params={{ userId }}
						/>
					}
				>
					{t('common:permissions')}
				</TabsTrigger>
				<TabsTrigger
					value="activity"
					render={
						<Link
							to="/staff/staff-users/$userId/activity"
							params={{ userId }}
						/>
					}
				>
					{t('common:activity')}
				</TabsTrigger>
				<TabsTrigger
					value="settings"
					render={
						<Link
							to="/staff/staff-users/$userId/settings"
							params={{ userId }}
						/>
					}
				>
					{t('settings')}
				</TabsTrigger>
			</TabsList>

			<TabsContent value={activeSection} className="mt-5">
				<StaffUserOverviewContext.Provider value={contextValue}>
					<Outlet />
				</StaffUserOverviewContext.Provider>
			</TabsContent>
		</Tabs>
	);
};
