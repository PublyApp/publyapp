import Container from '@mui/material/Container';

import PageHeader from '@/office/components/PageHeader';
import { BO_PATH_NAMES } from '@/shared/lib/constants';

import WebHostForm from './WebHostForm';

const CreateWebHost = () => {
	// const settings = useSettingsContext();

	const breadcrumbsElement = (
		<PageHeader.Breadcrumbs
			links={[
				{
					name: 'Dashboard',
					href: BO_PATH_NAMES.dashboard,
				},
				{
					name: 'Web hosts',
					href: BO_PATH_NAMES.webHosts,
				},
				{ name: 'New web host' },
			]}
		/>
	);
	const headingElement = <PageHeader.Heading text="Create a new web host" />;

	return (
		<Container maxWidth={/* settings.themeStretch ? false : 'lg' */ false}>
			<PageHeader
				heading={headingElement}
				breadcrumbs={breadcrumbsElement}
				sx={{
					mb: { xs: 3, md: 5 },
				}}
			/>

			{/* <ProductNewEditForm /> */}
			<WebHostForm />
		</Container>
	);
};

export default CreateWebHost;
