import Box from '@mui/material/Box';
import capitalize from 'lodash/capitalize';
import toStr from 'lodash/toString';
import { useOutletContext, useParams } from 'react-router';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import type { StaffProfileDetailsOutletContext } from '../_layout/staff-profile-details-layout';
import { StaffProfileUsersTable } from './parts/staff-profile-users-table.tsx';
import { UserAssignDrawer } from './parts/user-assign-drawer.tsx';

const StaffProfileDetailsUsersTabPage = () => {
	const { t } = useTranslate();
	const { profileId } = useParams();
	const { profileName } = useOutletContext<StaffProfileDetailsOutletContext>();
	const resolvedProfileId = toStr(profileId);

	return (
		<Box
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				border: 'none',
			}}
		>
			<CustomBreadcrumbs
				heading={profileName}
				links={[
					{
						name: capitalize(t('profiles')),
						href: FRONT_PATH_NAMES.staff.profiles.root,
					},
					{
						name: profileName,
						href: FRONT_PATH_NAMES.staff.profiles.details(resolvedProfileId)
							.root,
					},
					{
						name: t('users'),
					},
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
				action={<UserAssignDrawer profileName={profileName} />}
			/>

			<StaffProfileUsersTable />
		</Box>
	);
};

export default StaffProfileDetailsUsersTabPage;
