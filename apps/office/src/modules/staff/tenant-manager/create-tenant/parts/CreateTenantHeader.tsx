import PageHeader from '@/office/components/PageHeader';
import useTranslate from '@/ui-react/hooks/useTranslate';

const CreateTenantHeader = () => {
	const { t } = useTranslate();

	return (
		<PageHeader
			heading={<PageHeader.Heading>{t('new-item', { item: 'tenant' })}</PageHeader.Heading>}
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
						{ name: t('new-item', { item: 'tenant' }) },
					]}
				/>
			}
			// actions={
			// 	<Button
			// 		component={RouterLink}
			// 		href={BO_PATH_NAMES.staff.tenants.create}
			// 		variant="contained"
			// 		size="large"
			// 		startIcon={<Iconify icon="mingcute:add-line" />}
			// 		color="inherit"
			// 	>
			// 		{/* New Post */}
			// 		{t('new-item', { item: 'tenant' })}
			// 	</Button>
			// }
		/>
	);
};

export default CreateTenantHeader;
