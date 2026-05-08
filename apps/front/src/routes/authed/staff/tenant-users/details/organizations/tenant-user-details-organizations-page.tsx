import Button from '@mui/material/Button';
import { useBoolean } from 'minimal-shared/hooks';
import { useOutletContext } from 'react-router';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import type { TenantUserDetailsOutletContext } from '../_layout/tenant-user-details-layout';
import TenantUserCompaniesTable from '../_parts/tenant-user-companies-table';
import { TenantUserDetailsBreadcrumbs } from '../_parts/tenant-user-details-breadcrumbs';
import TenantUserLinkCompanyDrawer from '../_parts/tenant-user-link-company-drawer';

const TenantUserDetailsOrganizationsPage = () => {
	const { t } = useTranslate();
	const { title } = useOutletContext<TenantUserDetailsOutletContext>();
	const linkCompanyDrawer = useBoolean();

	return (
		<>
			<TenantUserDetailsBreadcrumbs
				title={title}
				action={
					<Button
						variant="contained"
						onClick={linkCompanyDrawer.onTrue}
						startIcon={<Iconify width={16} icon="mingcute:add-line" />}
					>
						{t('link-to-company')}
					</Button>
				}
			/>
			<TenantUserCompaniesTable onLinkCompany={linkCompanyDrawer.onTrue} />
			<TenantUserLinkCompanyDrawer
				open={linkCompanyDrawer.value}
				onClose={linkCompanyDrawer.onFalse}
			/>
		</>
	);
};

export default TenantUserDetailsOrganizationsPage;
