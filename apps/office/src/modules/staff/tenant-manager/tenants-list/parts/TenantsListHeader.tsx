import PageHeader from '@/office/components/PageHeader';
import useTranslate from '@/ui-react/hooks/useTranslate';

const TenantsListHeader = () => {
	const { t } = useTranslate();

	return (
		<PageHeader
			heading={<PageHeader.Heading>{t('list-of-tenants')}</PageHeader.Heading>}
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
		/>
	);
};

export default TenantsListHeader;
