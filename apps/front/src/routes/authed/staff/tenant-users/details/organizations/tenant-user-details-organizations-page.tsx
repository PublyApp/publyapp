import Button from '@mui/material/Button';
import { useOutletContext } from 'react-router';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import type { TenantUserDetailsOutletContext } from '../_layout/tenant-user-details-layout';
import TenantUserCompaniesTable from '../_parts/tenant-user-companies-table';
import { TenantUserDetailsBreadcrumbs } from '../_parts/tenant-user-details-breadcrumbs';

const TenantUserDetailsOrganizationsPage = () => {
	const { t } = useTranslate();
	const { title } = useOutletContext<TenantUserDetailsOutletContext>();
	const handleLinkCompany = () => undefined;

	return (
		<>
			<TenantUserDetailsBreadcrumbs
				title={title}
				action={
					<Button
						variant="contained"
						onClick={handleLinkCompany}
						startIcon={<Iconify width={16} icon="mingcute:add-line" />}
					>
						{t('link-to-company')}
					</Button>
				}
			/>
			<TenantUserCompaniesTable />
		</>
	);
};

export default TenantUserDetailsOrganizationsPage;
