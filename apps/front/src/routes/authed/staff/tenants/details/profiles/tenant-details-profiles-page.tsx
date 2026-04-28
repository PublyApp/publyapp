import Box from '@mui/material/Box';
import { useOutletContext, useParams } from 'react-router';
import capitalize from 'lodash/capitalize';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import type { TenantDetailsOutletContext } from '../_layout/tenant-details-layout';
import TenantProfileCreateAction from './parts/tenant-profile-create-action.tsx';
import TenantProfilesTable from './parts/tenant-profiles-table.tsx';

const TenantDetailsProfilesPage = () => {
	const { t } = useTranslate();
	const { tenantName } = useOutletContext<TenantDetailsOutletContext>();
	const { tenantId } = useParams();
	const resolvedTenantId = tenantId ?? '';

	return (
		<Box
			sx={{
				flexGrow: 1,
				minHeight: 0,
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			<CustomBreadcrumbs
				heading={tenantName || t('tenant-details')}
				links={[
					{
						name: capitalize(t('tenants')),
						href: FRONT_PATH_NAMES.staff.tenants.root,
					},
					{ name: capitalize(t('details')) },
				]}
				action={<TenantProfileCreateAction tenantId={resolvedTenantId} />}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<Box
				sx={{
					flexGrow: 1,
					minHeight: 0,
					display: 'flex',
					flexDirection: 'column',
				}}
			>
				<TenantProfilesTable tenantId={resolvedTenantId} />
			</Box>
		</Box>
	);
};

export default TenantDetailsProfilesPage;
