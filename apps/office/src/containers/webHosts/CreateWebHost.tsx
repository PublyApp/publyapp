import Container from '@mui/material/Container';

import CustomBreadcrumbs from '@office/components/CustomBreadcrumbs';
import { BO_PATH_NAMES } from '@shared/utils/constants';

import WebHostForm from './WebHostForm';

const CreateWebHost = () => {
	// const settings = useSettingsContext();

	return (
		<Container maxWidth={/* settings.themeStretch ? false : 'lg' */ false}>
			<CustomBreadcrumbs
				heading="Create a new web host"
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
