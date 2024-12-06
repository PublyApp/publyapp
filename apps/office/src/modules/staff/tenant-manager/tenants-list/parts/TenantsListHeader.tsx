import Button from '@mui/material/Button';

import PageHeader from '@/office/components/PageHeader';
import RouterLink from '@/office/components/RouterLink';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
import Iconify from '@/ui-react/components/Iconify';
import useTranslate from '@/ui-react/hooks/useTranslate';

const TenantsListHeader = () => {
	const { t } = useTranslate();

	return (
		<PageHeader
			heading={<PageHeader.Heading>{t('list-of-items', { items: 'tenants' })}</PageHeader.Heading>}
			breadcrumbs={
				<PageHeader.Breadcrumbs
					links={[
						{
							name: 'Dashboard',
							// href: BO_PATH_NAMES.dashboard.root
						},
						{
							name: 'Tenants',
							// href: BO_PATH_NAMES.dashboard.posts.root,
						},
						{ name: t('list') },
					]}
				/>
			}
			actions={
				<Button
					component={RouterLink}
					href={BO_PATH_NAMES.staff.tenants.create}
					variant="contained"
					size="large"
					startIcon={<Iconify icon="mingcute:add-line" />}
					color="inherit"
				>
					{/* New Post */}
					{t('new-item', { item: 'tenant' })}
				</Button>
			}
		/>
	);
};

export default TenantsListHeader;
