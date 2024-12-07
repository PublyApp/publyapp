// import { Container } from '@mui/material';

// import PageHeader from '@/office/components/PageHeader';
// import { BO_PATH_NAMES } from '@/shared/lib/constants';
// import useTranslate from '@/ui-react/hooks/useTranslate';

// const BlogSettings = () => {
// 	const { t } = useTranslate();
// 	const headingElement = <PageHeader.Heading text={t('settings')} />;
// 	const breadcrumbsElement = (
// 		<PageHeader.Breadcrumbs
// 			links={[
// 				{
// 					name: 'Dashboard',
// 					href: BO_PATH_NAMES.dashboard.root,
// 				},
// 				{
// 					name: `${t('post')}s`,
// 					href: BO_PATH_NAMES.dashboard.posts.root,
// 				},
// 				{
// 					name: t('settings'),
// 					// href: BO_PATH_NAMES.dashboard.posts.edi,
// 				},
// 			]}
// 		/>
// 	);

// 	return (
// 		<Container maxWidth={/* settings.themeStretch ? false :  */ 'lg'}>
// 			<PageHeader
// 				heading={headingElement}
// 				breadcrumbs={breadcrumbsElement}
// 				// action={renderHeaderActions}
// 				// moreLink={['#']}
// 				sx={{
// 					mb: { xs: 3, md: 5 },
// 				}}
// 			/>
// 			<h2>TODO:</h2>
// 			<ul>
// 				<li>default post cover selection/upload zone</li>
// 			</ul>
// 		</Container>
// 	);
// };

// export default BlogSettings;
