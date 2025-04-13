import { DashboardContent } from '@/front/layouts/dashboard/content';
import _ from 'lodash';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { useTranslate } from '@/front/hooks/use-translate';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { RouterLink } from '@/front/components/router-link';
import Button from '@mui/material/Button';
import { Iconify } from '@/front/components/iconify/iconify';

const TenantsListPage = () => {
	const { t } = useTranslate();
	return (
		<DashboardContent
			/* maxWidth="xl" */
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
						href="#"
						variant="contained"
						startIcon={<Iconify icon="mingcute:add-line" />}
					>
						New product
					</Button>
				}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>
		</DashboardContent>
	);
};

export default TenantsListPage;
