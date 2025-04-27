import _ from 'lodash';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { useTranslate } from '@/front/hooks/use-translate';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { RouterLink } from '@/front/components/router-link';
import Button from '@mui/material/Button';
import { Iconify } from '@/front/components/iconify/iconify';
import TenantsTable from './parts/tenants-table';

const TenantsListPage = () => {
	const { t } = useTranslate();

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
		>
			<CustomBreadcrumbs
				heading={t('list-of-items', { items: t('tenants') })}
				links={[
					// { name: 'Dashboard', href: paths.dashboard.root },
					{
						name: _.capitalize(t('tenants')),
						href: FRONT_PATH_NAMES.staff.tenants.root,
					},
					{ name: _.capitalize(t('list')) },
				]}
				action={
					<Button
						component={RouterLink}
						href={FRONT_PATH_NAMES.staff.tenants.new}
						variant="contained"
						startIcon={<Iconify icon="mingcute:add-line" />}
					>
						{_.capitalize(t('new-item', { item: t('tenant') }))}
					</Button>
				}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<TenantsTable />
		</DashboardContent>
	);
};

export default TenantsListPage;
